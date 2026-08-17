import { POSITIVE_WEIGHTS, POSITIVE_SUM } from "./weights";
import type { PostRow } from "./types";

/**
 * Reimplementación de la función de combinación de scores del ranker de X.
 *
 * `param.rs:283-293` advierte explícitamente que los pesos multiplican
 * *probabilidades predichas*, no contadores brutos, y llama incorrecta la
 * lectura de "un report cancela 468 likes". Por eso dividimos cada acción
 * entre las impresiones: acción/impresiones es la probabilidad empírica.
 *
 *   AlgoScore = Σ ( peso_i × acción_i / impresiones )
 *
 * El score real se normaliza después con una transformación afín
 * (`ranking_scorer.rs:555-558`), que preserva el orden. Nuestro AlgoScore es
 * monótonamente equivalente al real, no idéntico en valor absoluto.
 */

/** Acciones del algoritmo que el CSV de Analytics permite observar. */
const OBSERVABLE: {
  action: keyof typeof POSITIVE_WEIGHTS;
  /** Columnas del CSV que alimentan esta acción. Suma de las presentes. */
  columns: Exclude<keyof PostRow, "id" | "date" | "text" | "impressions">[];
}[] = [
  { action: "reply", columns: ["replies"] },
  { action: "followAuthor", columns: ["newFollows"] },
  { action: "share", columns: ["shares"] },
  { action: "retweet", columns: ["reposts"] },
  { action: "favorite", columns: ["likes"] },
  // `click` (param.rs:335) cubre el clic en el post. El CSV expone dos
  // formas observables: Detail Expands (expandir inline) y Permalink
  // Clicks (abrir la página del post). Ambas son la misma acción `click`
  // desde el punto de vista del ranker, así que se suman como una sola
  // cuenta, sin duplicar el peso 0.4.
  { action: "click", columns: ["detailExpands", "permalinkClicks"] },
  { action: "openLink", columns: ["urlClicks"] },
  // Una sola columna cubre photo_expand, video_open y vqv (0.05 cada una).
  // Se acredita 0.05 una única vez para no inflar el score.
  { action: "photoExpand", columns: ["mediaViews"] },
];

/** Suma de los pesos observables: 13.15 de los 43.32 del positive_sum. */
export const OBSERVABLE_MAX: number = OBSERVABLE.reduce(
  (acc, { action }) => acc + POSITIVE_WEIGHTS[action],
  0,
);

export interface Contribution {
  action: string;
  weight: number;
  /** (Σ columnas) / impresiones */
  probability: number;
  /** peso × probabilidad */
  points: number;
}

export interface ScoreBreakdown {
  /** Score esperado por espectador. Comparable entre posts de distinto alcance. */
  algoScore: number;
  /** algoScore × impresiones. Score acumulado sobre toda la distribución recibida. */
  totalScore: number;
  contributions: Contribution[];
  /** Fracción del positive_sum observable en este post, en [0, 1]. */
  coverage: number;
}

export function scorePost(row: PostRow): ScoreBreakdown {
  if (row.impressions <= 0) {
    throw new Error(`scorePost: el post ${row.id} no tiene impresiones`);
  }

  const contributions: Contribution[] = [];
  let algoScore = 0;
  let observedWeight = 0;

  for (const { action, columns } of OBSERVABLE) {
    // ¿Hay alguna columna presente (no null) para esta acción?
    // Si todas son null, la acción no es observable en este post y su peso
    // no cuenta para la cobertura.
    const present = columns.some((col) => row[col] !== null);
    if (!present) continue;

    // Suma de las columnas presentes. Las ausentes (null) contribuyen 0.
    const count = columns.reduce((acc, col) => {
      const v = row[col];
      return acc + (typeof v === "number" ? v : 0);
    }, 0);

    const weight = POSITIVE_WEIGHTS[action];
    observedWeight += weight;

    if (count === 0) continue;

    const probability = count / row.impressions;
    const points = weight * probability;
    algoScore += points;
    contributions.push({ action, weight, probability, points });
  }

  contributions.sort((a, b) => b.points - a.points);

  return {
    algoScore,
    totalScore: algoScore * row.impressions,
    contributions,
    coverage: observedWeight / POSITIVE_SUM,
  };
}

/**
 * Cobertura del dataset completo: usa la unión de columnas presentes en
 * al menos una fila, que es lo que el CSV realmente aporta.
 */
export function datasetCoverage(rows: PostRow[]): number {
  if (rows.length === 0) return 0;

  let observedWeight = 0;
  for (const { action, columns } of OBSERVABLE) {
    const present = columns.some((col) => rows.some((r) => r[col] !== null));
    if (present) observedWeight += POSITIVE_WEIGHTS[action];
  }
  return observedWeight / POSITIVE_SUM;
}
