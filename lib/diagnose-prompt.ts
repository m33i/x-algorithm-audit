import { z } from "zod";
import {
  DiagnosisRequestSchema,
  DiagnosisSchema,
  type DiagnosisRequest,
} from "./diagnosis-schema";
import { sample, type SamplePost } from "./diagnosis-sample";
import type { AnalysisReport } from "./findings";
import type { ScoredPost } from "./cohorts";

/**
 * Prompt de sistema compartido por el endpoint `/api/diagnose` (Gemini) y por
 * el prompt copiable de la UI. Único módulo donde viven las reglas del rol.
 */
export const DIAGNOSIS_SYSTEM_PROMPT = `Eres un analista que interpreta la auditoría de una cuenta de X contra los pesos de ranking que xAI publicó en github.com/xai-org/x-algorithm.

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

/**
 * Construye el payload que se envía al LLM: agregados + hallazgos + cohortes
 * + muestra de posts. Nunca incluye el CSV ni columnas crudas.
 *
 * Es la misma estructura que valida `DiagnosisRequestSchema` y la que envía
 * el endpoint `/api/diagnose`. Centralizarla aquí evita drift entre la UI
 * y el endpoint.
 */
export function buildDiagnosisPayload(
  report: AnalysisReport,
  posts: ScoredPost[],
): DiagnosisRequest {
  const samplePosts: SamplePost[] = sample(posts);
  return DiagnosisRequestSchema.parse({
    postCount: report.postCount,
    medianAlgoScore: report.medianAlgoScore,
    coverage: report.coverage,
    findings: report.findings,
    cohorts: report.cohorts.map((c) => ({
      id: c.id,
      groups: c.groups,
      pScore: c.pScore,
      significant: c.significant,
      insufficientSample: c.insufficientSample,
    })),
    samplePosts,
  });
}

/**
 * Schema JSON de salida, serializado una sola vez. Zod 4 expone `z.toJSONSchema`
 * nativo, sin nuevas dependencias.
 */
const OUTPUT_SCHEMA_JSON = JSON.stringify(
  z.toJSONSchema(DiagnosisSchema),
  null,
  2,
);

/**
 * Mensaje de usuario: payload + instrucción de salida. Sin el system prompt,
 * que va aparte (en `systemInstruction` para Gemini, o prefijado en
 * `buildDiagnosisPrompt` para la UI copiable).
 */
export function buildDiagnosisUserMessage(payload: DiagnosisRequest): string {
  return (
    "Aquí está la auditoría completa. Redacta el diagnóstico.\n\n" +
    JSON.stringify(payload, null, 2) +
    "\n\n" +
    "Responde solo con un JSON que valide este schema (no añadas texto fuera del JSON):\n\n" +
    OUTPUT_SCHEMA_JSON
  );
}

/**
 * Construye un prompt autocontenido, listo para pegar en cualquier chat de LLM
 * (Gemini, Claude, GPT, etc.). System prompt + payload + schema de salida en
 * una sola cadena.
 *
 * No llama a ningún LLM. El usuario copia el resultado y lo pega fuera.
 */
export function buildDiagnosisPrompt(payload: DiagnosisRequest): string {
  return DIAGNOSIS_SYSTEM_PROMPT + "\n\n" + buildDiagnosisUserMessage(payload);
}
