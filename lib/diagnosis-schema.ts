import { z } from "zod";

/** Lo que el cliente envía. Nunca incluye el CSV ni columnas crudas. */
export const DiagnosisRequestSchema = z.object({
  postCount: z.number().int().positive(),
  medianAlgoScore: z.number(),
  coverage: z.number().min(0).max(1),
  /**
   * Peso real del algoritmo que los proxies intentan estimar (20.0 de
   * share_via_copy_link si el CSV trae bookmarks). No es un porcentaje.
   */
  proxiedWeight: z.number().min(0),
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
        /** Pares posibles en la cohorte; pScore ya viene corregido por él. */
        comparisons: z.number().int().min(1),
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
