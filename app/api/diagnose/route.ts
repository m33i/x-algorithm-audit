import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  DiagnosisRequestSchema,
  DiagnosisSchema,
} from "@/lib/diagnosis-schema";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `Eres un analista que interpreta la auditoría de una cuenta de X contra los pesos de ranking que xAI publicó en github.com/xai-org/x-algorithm.

Los números ya están calculados. Tu trabajo es interpretarlos y redactar, nunca recalcular.

Reglas estrictas:
- No introduzcas ninguna cifra que no venga en el payload. Si necesitas un número, cítalo del payload.
- No inventes hallazgos. Trabaja solo sobre los que te llegan.
- Los hallazgos marcados como muestra insuficiente no son evidencia de nada: no los uses.
- Prioriza por impacto esperado, no por severidad nominal.
- Para las reescrituras, usa solo posts del bucket "peor" de la muestra.
- Cada reescritura debe justificar qué peso concreto del algoritmo mejora.
- Escribe en español, directo y sin relleno. Nada de "¡Genial!" ni de listas de consejos genéricos de gurú de X.

Contexto que puedes dar por sabido: una reply pesa 5.0 y un like 0.5; share_via_copy_link pesa 20.0 pero no es observable desde el CSV; open_link pesa 0.2; profile_click vale 0.0.`;

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
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
    const client = new Anthropic({ apiKey });
    const response = await client.messages.parse({
      model: "claude-opus-5",
      // En Opus 5 el thinking está activo por defecto y max_tokens acota
      // thinking + texto conjuntamente. 16000 deja holgura para ambos.
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      output_config: { format: zodOutputFormat(DiagnosisSchema) },
      messages: [
        {
          role: "user",
          content: `Aquí está la auditoría completa. Redacta el diagnóstico.\n\n${JSON.stringify(payload, null, 2)}`,
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json(
        { error: "El modelo declinó redactar el diagnóstico." },
        { status: 502 },
      );
    }

    if (!response.parsed_output) {
      return NextResponse.json(
        { error: "El diagnóstico llegó incompleto. Vuelve a intentarlo." },
        { status: 502 },
      );
    }

    return NextResponse.json({ diagnosis: response.parsed_output });
  } catch (err) {
    console.error("[diagnose]", err);
    return NextResponse.json(
      { error: "No se pudo generar el diagnóstico." },
      { status: 500 },
    );
  }
}
