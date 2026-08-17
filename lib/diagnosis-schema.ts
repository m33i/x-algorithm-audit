import { z } from "zod";

/** Lo que el cliente envía. Nunca incluye el CSV ni columnas crudas. */
export const DiagnosisRequestSchema = z.object({
  postCount: z.number().int().positive(),
  medianAlgoScore: z.number(),
  coverage: z.number().min(0).max(1),
  findings: z
    .array(
      z.object({
        id: z.string().max(200),
        title: z.string().max(200),
        severity: z.enum(["alta", "media", "baja"]),
        evidence: z.string().max(2000),
        explanation: z.string().max(2000),
        action: z.string().max(2000),
        codeRef: z.string().max(200),
      }),
    )
    .max(30),
  cohorts: z
    .array(
      z.object({
        id: z.string().max(200),
        groups: z
          .array(
            z.object({
              label: z.string().max(200),
              n: z.number().int(),
              medianScore: z.number(),
              medianImpressions: z.number(),
            }),
          )
          .max(10),
        pScore: z.number().nullable(),
        significant: z.boolean(),
        insufficientSample: z.boolean(),
      }),
    )
    .max(30),
  /** Muestra: 5 mejores, 5 peores, 5 medianos. */
  samplePosts: z
    .array(
      z.object({
        bucket: z.enum(["mejor", "peor", "mediano"]),
        text: z.string().max(2000),
        algoScore: z.number(),
        impressions: z.number(),
      }),
    )
    .max(15),
});

export type DiagnosisRequest = z.infer<typeof DiagnosisRequestSchema>;

/** Lo que Claude devuelve, validado por structured outputs. */
export const DiagnosisSchema = z.object({
  summary: z
    .string()
    .describe("Dos o tres frases sobre el estado general de la cuenta."),
  priorities: z
    .array(
      z.object({
        findingId: z
          .string()
          .describe("El id del hallazgo del payload al que corresponde."),
        why: z
          .string()
          .describe("Por qué este hallazgo importa más que los otros."),
      }),
    )
    .describe("Los hallazgos ordenados por impacto esperado."),
  rewrites: z
    .array(
      z.object({
        original: z.string().describe("El texto original del post."),
        rewritten: z.string().describe("La reescritura propuesta."),
        rationale: z
          .string()
          .describe(
            "Qué cambia y contra qué peso del algoritmo juega el cambio.",
          ),
      }),
    )
    .describe("Reescrituras de los peores posts de la muestra."),
});

export type Diagnosis = z.infer<typeof DiagnosisSchema>;
