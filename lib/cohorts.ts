import { median, mannWhitneyU } from "./stats";
import { extractFeatures, type PostFeatures } from "./features";
import { scorePost } from "./scoring";
import type { PostRow } from "./types";

/**
 * Comparación de cohortes con disciplina estadística.
 *
 * El modo de fallo típico de estas herramientas es presentar ruido como
 * hallazgo. Por eso: mediana en vez de media, Mann-Whitney en vez de
 * eyeballing, y dos umbrales que no se negocian.
 */

/** Mínimo de posts por grupo para emitir cualquier conclusión. */
export const MIN_GROUP_SIZE = 8;
/** Umbral de significancia a dos colas. */
export const SIGNIFICANCE_THRESHOLD = 0.05;

export interface ScoredPost {
  row: PostRow;
  features: PostFeatures;
  algoScore: number;
  /**
   * Score aproximado que añade los pesos proxy (bookmarks como proxy de
   * share_via_copy_link, etc.). No es el score del ranker; es una
   * aproximación con mejor cobertura observacional.
   */
  approxScore: number;
}

export interface CohortGroup {
  label: string;
  n: number;
  medianScore: number;
  medianImpressions: number;
}

export interface CohortComparison {
  id: string;
  /** Ordenados de menor a mayor mediana de AlgoScore. */
  groups: CohortGroup[];
  /** p del contraste sobre AlgoScore. null si la muestra no alcanza. */
  pScore: number | null;
  /** p del contraste sobre impresiones. null si la muestra no alcanza. */
  pImpressions: number | null;
  /** true solo si pScore < SIGNIFICANCE_THRESHOLD. */
  significant: boolean;
  /** true si algún grupo comparado quedó por debajo de MIN_GROUP_SIZE. */
  insufficientSample: boolean;
}

export function scoreAll(rows: PostRow[]): ScoredPost[] {
  return rows.map((row) => {
    const breakdown = scorePost(row);
    return {
      row,
      features: extractFeatures(row),
      algoScore: breakdown.algoScore,
      approxScore: breakdown.approxScore,
    };
  });
}

function summarize(label: string, posts: ScoredPost[]): CohortGroup {
  return {
    label,
    n: posts.length,
    medianScore: median(posts.map((p) => p.algoScore)),
    medianImpressions: median(posts.map((p) => p.row.impressions)),
  };
}

/** Contrasta dos conjuntos aplicando los umbrales. */
function contrast(
  id: string,
  groups: CohortGroup[],
  a: ScoredPost[],
  b: ScoredPost[],
): CohortComparison {
  const insufficient = a.length < MIN_GROUP_SIZE || b.length < MIN_GROUP_SIZE;

  if (insufficient) {
    return {
      id,
      groups,
      pScore: null,
      pImpressions: null,
      significant: false,
      insufficientSample: true,
    };
  }

  const pScore = mannWhitneyU(
    a.map((p) => p.algoScore),
    b.map((p) => p.algoScore),
  ).p;
  const pImpressions = mannWhitneyU(
    a.map((p) => p.row.impressions),
    b.map((p) => p.row.impressions),
  ).p;

  return {
    id,
    groups,
    pScore,
    pImpressions,
    significant: pScore < SIGNIFICANCE_THRESHOLD,
    insufficientSample: false,
  };
}

/** Parte los posts en dos por un predicado y los contrasta. */
export function compareBinary(
  posts: ScoredPost[],
  id: string,
  labels: [string, string],
  predicate: (p: ScoredPost) => boolean,
): CohortComparison {
  const yes = posts.filter(predicate);
  const no = posts.filter((p) => !predicate(p));

  const groups: CohortGroup[] = [];
  if (yes.length > 0) groups.push(summarize(labels[0], yes));
  if (no.length > 0) groups.push(summarize(labels[1], no));
  groups.sort((x, y) => x.medianScore - y.medianScore);

  return contrast(id, groups, yes, no);
}

/**
 * Agrupa por una clave categórica y contrasta el grupo de mejor mediana
 * contra el de peor. Los grupos por debajo de MIN_GROUP_SIZE se descartan
 * de `groups`, pero no invalidan la comparación: `insufficientSample`
 * depende únicamente de los dos grupos que realmente se contrastan.
 */
export function compareGroups(
  posts: ScoredPost[],
  id: string,
  keyOf: (p: ScoredPost) => string,
): CohortComparison {
  const buckets = new Map<string, ScoredPost[]>();
  for (const p of posts) {
    const k = keyOf(p);
    const bucket = buckets.get(k);
    if (bucket) bucket.push(p);
    else buckets.set(k, [p]);
  }

  const kept: { label: string; posts: ScoredPost[] }[] = [];
  for (const [label, bucketPosts] of buckets) {
    if (bucketPosts.length >= MIN_GROUP_SIZE) kept.push({ label, posts: bucketPosts });
  }

  const groups = kept
    .map((k) => summarize(k.label, k.posts))
    .sort((x, y) => x.medianScore - y.medianScore);

  if (kept.length < 2) {
    return {
      id,
      groups,
      pScore: null,
      pImpressions: null,
      significant: false,
      insufficientSample: true,
    };
  }

  const byMedian = [...kept].sort(
    (x, y) => median(x.posts.map((p) => p.algoScore)) - median(y.posts.map((p) => p.algoScore)),
  );
  const worst = byMedian[0].posts;
  const best = byMedian[byMedian.length - 1].posts;

  return contrast(id, groups, worst, best);
}

/**
 * Cohorte de enlaces acortados.
 *
 * ADVERTENCIA sobre lo que esta cohorte compara de verdad. X acorta a t.co
 * tanto los enlaces externos como los adjuntos de media, y el CSV nativo de
 * Account Analytics **no trae ninguna columna de media**: verificado contra
 * un export real de 457 posts, cuyas cabeceras son Post id, Date, Post text,
 * Post Link, Impressions, Likes, Engagements, Bookmarks, Shares, New follows,
 * Replies, Reposts, Profile visits, Detail Expands, URL Clicks, Hashtag
 * Clicks y Permalink Clicks. Tampoco aparece ya `pic.x.com` en el texto: en
 * ese mismo export había 391 `t.co` y cero `pic.x.com`.
 *
 * Consecuencia: con un CSV nativo `hasMedia` es siempre false, así que el
 * filtro de abajo no excluye nada y los dos grupos son "contiene un t.co"
 * frente a "solo texto". El t.co puede ser un enlace externo o una imagen, y
 * no hay forma de distinguirlos: se probó usar `urlClicks > 0` como
 * discriminador sobre datos reales y no separa (71 de 370 posts con t.co
 * tenían cero clics, indistinguibles de un enlace que nadie clicó).
 *
 * El filtro se mantiene porque sí funciona si alguien enriquece el CSV con
 * una columna de media desde la API. Cuando no la hay, el hallazgo debe
 * describirse como lo que es, y así lo hace `findings.ts`.
 */
export function linkCohort(posts: ScoredPost[]): CohortComparison {
  const withoutMedia = posts.filter((p) => !p.features.hasMedia);
  return compareBinary(
    withoutMedia,
    "link",
    ["con enlace acortado", "solo texto"],
    (p) => p.features.hasLink,
  );
}
