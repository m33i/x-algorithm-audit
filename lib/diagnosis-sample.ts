import type { ScoredPost } from "./cohorts";

export interface SamplePost {
  bucket: "mejor" | "peor" | "mediano";
  text: string;
  algoScore: number;
  impressions: number;
}

/**
 * Toma hasta 5 mejores, 5 peores y 5 medianos por AlgoScore, sin solapar:
 * cada post aparece como mucho en un bucket, así que Gemini nunca ve el
 * mismo texto bajo dos etiquetas contradictorias.
 *
 * Prioriza mejor y peor; el bucket mediano se rellena con lo que sobra
 * después de excluir esos ids. El total nunca pasa de 15.
 */
export function sample(posts: ScoredPost[]): SamplePost[] {
  const toSample = (p: ScoredPost, bucket: SamplePost["bucket"]): SamplePost => ({
    bucket,
    text: p.row.text.slice(0, 2000),
    algoScore: p.algoScore,
    impressions: p.row.impressions,
  });

  const sorted = [...posts].sort((a, b) => b.algoScore - a.algoScore);

  const best = sorted.slice(0, 5);
  const usedIds = new Set(best.map((p) => p.row.id));

  const worst: ScoredPost[] = [];
  for (let i = sorted.length - 1; i >= 0 && worst.length < 5; i--) {
    const p = sorted[i];
    if (!usedIds.has(p.row.id)) {
      worst.push(p);
      usedIds.add(p.row.id);
    }
  }

  const remaining = sorted.filter((p) => !usedIds.has(p.row.id));
  const mid = Math.floor(remaining.length / 2);
  const median = remaining.slice(Math.max(0, mid - 2), mid + 3).slice(0, 5);

  return [
    ...best.map((p) => toSample(p, "mejor")),
    ...worst.map((p) => toSample(p, "peor")),
    ...median.map((p) => toSample(p, "mediano")),
  ];
}
