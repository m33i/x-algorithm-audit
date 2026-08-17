import type { ScoredPost } from "./cohorts";

export interface SamplePost {
  bucket: "mejor" | "peor" | "mediano";
  text: string;
  algoScore: number;
  impressions: number;
}

/**
 * Tope de posts en la muestra. El prompt se copia y se pega a mano en un chat,
 * así que el límite real no es la ventana de contexto del modelo sino lo que
 * el portapapeles y el textarea del chat aguantan sin romperse.
 */
export const MAX_SAMPLE_POSTS = 120;

/**
 * Presupuesto de texto de los posts, aparte del tope de unidades. 120 posts
 * cortos caben de sobra; 120 hilos largos, no.
 */
export const MAX_SAMPLE_CHARS = 60_000;

/** Recorte por post, para que uno solo no se coma el presupuesto. */
const MAX_POST_CHARS = 2000;

/**
 * Tamaño de los buckets extremos. No es un número estético: la sección de
 * reescrituras del prompt reescribe TODOS los posts del bucket "peor", así que
 * subirlo aquí sube el trabajo que se le pide al LLM.
 */
const EXTREME_BUCKET_SIZE = 5;

/**
 * Muestra de posts para el prompt.
 *
 * Los buckets "mejor" y "peor" se mantienen en 5 a propósito: son los que
 * disparan las reescrituras. Lo que sí crece es "mediano", que antes eran 5
 * posts sueltos y ahora se lleva todo el presupuesto restante. La diferencia
 * importa para la sección de patrones: con 15 posts el LLM adivina, con 120
 * compara de verdad.
 *
 * Si la cuenta tiene pocos posts, van todos. Si tiene muchos, el relleno se
 * reparte de forma uniforme por el ranking de AlgoScore, no por los primeros
 * que caigan: así la muestra cubre todo el rango en vez de amontonarse en un
 * extremo. Ningún post aparece en dos buckets.
 */
export function sample(posts: ScoredPost[]): SamplePost[] {
  const toSample = (p: ScoredPost, bucket: SamplePost["bucket"]): SamplePost => ({
    bucket,
    text: p.row.text.slice(0, MAX_POST_CHARS),
    algoScore: p.algoScore,
    impressions: p.row.impressions,
  });

  const sorted = [...posts].sort((a, b) => b.algoScore - a.algoScore);

  const best = sorted.slice(0, EXTREME_BUCKET_SIZE);
  const usedIds = new Set(best.map((p) => p.row.id));

  const worst: ScoredPost[] = [];
  for (let i = sorted.length - 1; i >= 0 && worst.length < EXTREME_BUCKET_SIZE; i--) {
    const p = sorted[i];
    if (!usedIds.has(p.row.id)) {
      worst.push(p);
      usedIds.add(p.row.id);
    }
  }

  const rest = sorted.filter((p) => !usedIds.has(p.row.id));
  const slots = Math.max(0, MAX_SAMPLE_POSTS - best.length - worst.length);
  const middle = evenSpread(rest, slots);

  const out = [
    ...best.map((p) => toSample(p, "mejor")),
    ...worst.map((p) => toSample(p, "peor")),
    ...middle.map((p) => toSample(p, "mediano")),
  ];

  return withinCharBudget(out);
}

/** true si la muestra contiene todos los posts analizados. */
export function isCompleteSample(
  sampled: SamplePost[],
  posts: ScoredPost[],
): boolean {
  return sampled.length === posts.length;
}

/**
 * Toma `k` elementos repartidos por todo el array, incluyendo siempre los dos
 * extremos. Con k >= xs.length devuelve xs entero.
 */
function evenSpread<T>(xs: T[], k: number): T[] {
  if (k <= 0 || xs.length === 0) return [];
  if (xs.length <= k) return xs;
  if (k === 1) return [xs[Math.floor(xs.length / 2)]];

  const out: T[] = [];
  for (let i = 0; i < k; i++) {
    out.push(xs[Math.round((i * (xs.length - 1)) / (k - 1))]);
  }
  return out;
}

/**
 * Recorta la muestra al presupuesto de caracteres. Los buckets extremos son
 * intocables (sin ellos no hay reescrituras ni contraste); lo que se cae es
 * el relleno mediano, empezando por el final.
 */
function withinCharBudget(sampled: SamplePost[]): SamplePost[] {
  const total = sampled.reduce((acc, s) => acc + s.text.length, 0);
  if (total <= MAX_SAMPLE_CHARS) return sampled;

  const extremes = sampled.filter((s) => s.bucket !== "mediano");
  const middle = sampled.filter((s) => s.bucket === "mediano");

  let used = extremes.reduce((acc, s) => acc + s.text.length, 0);
  const kept: SamplePost[] = [];
  for (const s of middle) {
    if (used + s.text.length > MAX_SAMPLE_CHARS) break;
    used += s.text.length;
    kept.push(s);
  }

  return [...extremes, ...kept];
}
