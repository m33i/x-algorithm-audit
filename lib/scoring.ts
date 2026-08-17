import { POSITIVE_WEIGHTS, POSITIVE_SUM, PROXY_WEIGHTS } from "./weights";
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
 * No es monótonamente equivalente al score del ranker: cubre ~30% de los
 * pesos positivos y 0% de los negativos, usa tasas empíricas en vez de las
 * probabilidades que predice el modelo, y no aplica los multiplicadores de
 * diversidad ni de OON.
 *
 * Además del AlgoScore "real" (solo pesos transcritos del código), se calcula
 * un `approxScore` que añade los pesos proxy de `PROXY_WEIGHTS` para las
 * señales que el CSV sí expone pero que el algoritmo no pondera
 * explícitamente (hoy: bookmarks como proxy de share_via_copy_link). El
 * `approxScore` no es el score del ranker; es una aproximación con mejor
 * cobertura observacional. Los tests estadísticos de cohortes siguen
 * usando `algoScore` para no mezclar señal real con señal estimada.
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
  // `quote` (param.rs:358, peso 5.0) no está en el CSV nativo de Account
  // Analytics, pero la X API v2 lo expone como public_metrics.quote_count.
  // Si enriqueces el CSV con una columna `quote_count`, se activa el peso
  // real del algoritmo. Sin esa columna, queda fuera del score real y se
  // cuenta como no observable.
  { action: "quote", columns: ["quoteCount"] },
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

/**
 * Acciones proxy: el CSV expone el contador, pero el algoritmo no las
 * pondera explícitamente. Las usamos como sustituto aproximado de señales
 * que el algoritmo sí pondera pero que el CSV no desglosa.
 */
const PROXY: {
  /** Etiqueta estable para la contribución proxy. */
  label: string;
  /** Columna del CSV que alimenta el proxy. */
  column: Exclude<keyof PostRow, "id" | "date" | "text" | "impressions">;
  /** Señal del algoritmo que sustituye aproximadamene. */
  proxies: keyof typeof POSITIVE_WEIGHTS;
  /** Peso proxy (no es peso del algoritmo real). */
  weight: number;
}[] = [
  {
    label: "bookmarks (proxy de share_via_copy_link)",
    column: "bookmarks",
    proxies: "shareViaCopyLink",
    weight: PROXY_WEIGHTS.bookmarks,
  },
];

/** Suma de los pesos observables: 18.15 de los 43.32 del positive_sum (con quote). */
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

export interface ProxyContribution {
  label: string;
  /** Señal del algoritmo que sustituye aproximadamene. */
  proxies: string;
  /** Peso proxy (no es peso del algoritmo real). */
  weight: number;
  probability: number;
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
  /**
   * Score aproximado que añade los pesos proxy (bookmarks como proxy de
   * share_via_copy_link, etc.). No es el score del ranker: mezcla pesos
   * transcritos con un peso inventado.
   */
  approxScore: number;
  /** approxScore × impresiones. */
  approxTotalScore: number;
  /** Contribuciones proxy, ordenadas de mayor a menor points. */
  proxyContributions: ProxyContribution[];
  /**
   * Peso REAL del algoritmo que los proxies presentes intentan estimar.
   * Para el proxy de bookmarks son los 20.0 de share_via_copy_link.
   *
   * NO es un porcentaje de cobertura: sumar el peso proxy (6.0) al numerador
   * mezclaría unidades, porque no es un componente de los 43.32 del
   * denominador. Cuánto captura el proxy es desconocido.
   */
  proxiedWeight: number;
}

export function scorePost(row: PostRow): ScoreBreakdown {
  if (row.impressions <= 0) {
    throw new Error(`scorePost: el post ${row.id} no tiene impresiones`);
  }

  const contributions: Contribution[] = [];
  let algoScore = 0;
  let observedWeight = 0;

  for (const { action, columns } of OBSERVABLE) {
    // Si todas las columnas son null, la acción no es observable aquí.
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

  // Proxies: señales que el CSV expone pero que el algoritmo no pondera
  // explícitamente. Las usamos como sustituto aproximado de señales
  // inobservables (hoy: bookmarks → share_via_copy_link).
  const proxyContributions: ProxyContribution[] = [];
  let approxScore = algoScore;
  // Peso REAL de las señales que estamos intentando estimar, no el peso
  // proxy. Ver la nota en `proxiedWeight`.
  let proxiedWeight = 0;

  for (const { label, column, proxies, weight } of PROXY) {
    const v = row[column];
    if (v === null) continue;
    proxiedWeight += POSITIVE_WEIGHTS[proxies];
    if (v === 0) continue;
    const probability = v / row.impressions;
    const points = weight * probability;
    approxScore += points;
    proxyContributions.push({ label, proxies, weight, probability, points });
  }

  proxyContributions.sort((a, b) => b.points - a.points);

  return {
    algoScore,
    totalScore: algoScore * row.impressions,
    contributions,
    coverage: observedWeight / POSITIVE_SUM,
    approxScore,
    approxTotalScore: approxScore * row.impressions,
    proxyContributions,
    proxiedWeight,
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

/**
 * Peso real del algoritmo que los proxies del dataset intentan estimar.
 *
 * No es una cobertura y no se suma a `datasetCoverage`: son magnitudes
 * distintas. `datasetCoverage` dice qué fracción del positive_sum medimos;
 * esto dice cuánto vale la señal que estamos aproximando a ciegas.
 */
export function datasetProxiedWeight(rows: PostRow[]): number {
  if (rows.length === 0) return 0;

  let weight = 0;
  for (const { column, proxies } of PROXY) {
    if (rows.some((r) => r[column] !== null)) {
      weight += POSITIVE_WEIGHTS[proxies];
    }
  }
  return weight;
}
