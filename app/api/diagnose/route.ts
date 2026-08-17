import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import {
  DiagnosisRequestSchema,
  DiagnosisSchema,
  type Diagnosis,
} from "@/lib/diagnosis-schema";
import { DIAGNOSIS_SYSTEM_PROMPT, buildDiagnosisUserMessage } from "@/lib/diagnose-prompt";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
// La llamada no es streaming. 60s es válido tanto en Hobby como en Pro.
export const maxDuration = 60;

// x-real-ip lo fija el proxy de Vercel y no es controlable por el cliente.
// El fallback a x-forwarded-for confía en el primer elemento, que SÍ es
// spoofeable si el despliegue no está detrás de un proxy que lo normalice.
// Esto es protección contra abuso casual; el control real de un despliegue
// público es de plataforma (WAF / Vercel Firewall).
function clientIp(req: Request): string {
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return "unknown";
}

export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "El diagnóstico narrado no está configurado en este despliegue." },
      { status: 503 },
    );
  }

  const limit = checkRateLimit(clientIp(req));
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Demasiadas peticiones. Inténtalo más tarde." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let payload;
  try {
    payload = DiagnosisRequestSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  try {
    const client = new GoogleGenAI({ apiKey });
    const response = await client.models.generateContent({
      model: "gemini-2.5-flash",
      // 2.5 Flash soporta hasta 65536 tokens de salida; 16000 deja holgura
      // para el razonamiento interno y el JSON final.
      config: {
        systemInstruction: DIAGNOSIS_SYSTEM_PROMPT,
        // Forzamos JSON válido; el schema exacto va embebido en el prompt
        // (buildDiagnosisPrompt lo serializa con z.toJSONSchema). No pasamos
        // responseSchema: Gemini rechaza algunos JSON Schema que Zod genera
        // ($ref, propertyOrdering obligatorio, etc.) y lanza 400.
        responseMimeType: "application/json",
        maxOutputTokens: 16000,
        temperature: 0.2,
      },
      contents: buildDiagnosisUserMessage(payload),
    });

    const text = response.text;
    if (!text) {
      return NextResponse.json(
        { error: "El modelo declinó redactar el diagnóstico." },
        { status: 502 },
      );
    }

    let parsed: Diagnosis;
    try {
      parsed = DiagnosisSchema.parse(JSON.parse(text));
    } catch {
      return NextResponse.json(
        { error: "El diagnóstico llegó incompleto. Vuelve a intentarlo." },
        { status: 502 },
      );
    }

    return NextResponse.json({ diagnosis: parsed });
  } catch (err) {
    console.error("[diagnose]", err);
    return NextResponse.json(
      { error: "No se pudo generar el diagnóstico." },
      { status: 500 },
    );
  }
}
