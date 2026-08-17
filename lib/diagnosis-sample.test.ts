import { describe, it, expect } from "vitest";
import { sample } from "./diagnosis-sample";
import { scoreAll } from "./cohorts";
import type { PostRow } from "./types";

/** n posts con AlgoScore estrictamente creciente (más likes → más score). */
function dataset(n: number): PostRow[] {
  const rows: PostRow[] = [];
  for (let i = 0; i < n; i++) {
    rows.push({
      id: `post-${i}`,
      date: new Date("2026-08-17T12:00:00Z"),
      text: `post número ${i}`,
      impressions: 1000,
      likes: i,
      replies: null,
      reposts: null,
      shares: null,
      newFollows: null,
      detailExpands: null,
      urlClicks: null,
      mediaViews: null,
      profileVisits: null,
      bookmarks: null,
    });
  }
  return rows;
}

describe("sample", () => {
  for (const n of [8, 10, 15, 20, 50]) {
    it(`con n=${n}, ningún id se repite entre buckets y el total no pasa de 15`, () => {
      const posts = scoreAll(dataset(n));
      const result = sample(posts);

      expect(result.length).toBeLessThanOrEqual(15);

      // Reconstruir qué id corresponde a cada entrada de la muestra por su
      // texto, ya que SamplePost no lleva id: el texto es único por post.
      const textsByBucket = new Map<string, Set<string>>();
      for (const s of result) {
        const set = textsByBucket.get(s.bucket) ?? new Set<string>();
        set.add(s.text);
        textsByBucket.set(s.bucket, set);
      }

      const allTexts = result.map((s) => s.text);
      const uniqueTexts = new Set(allTexts);
      expect(uniqueTexts.size).toBe(allTexts.length);
    });
  }

  it("no repite ids entre buckets con un dataset pequeño (n=10)", () => {
    const posts = scoreAll(dataset(10));
    const result = sample(posts);

    const seen = new Set<string>();
    for (const s of result) {
      expect(seen.has(s.text)).toBe(false);
      seen.add(s.text);
    }
  });

  it("prioriza mejor y peor: con n=8 el bucket mediano queda vacío", () => {
    const posts = scoreAll(dataset(8));
    const result = sample(posts);

    expect(result.filter((s) => s.bucket === "mejor").length).toBeGreaterThan(0);
    expect(result.filter((s) => s.bucket === "peor").length).toBeGreaterThan(0);
    expect(result.length).toBe(8);
  });

  it("con datasets grandes reparte 5/5/5", () => {
    const posts = scoreAll(dataset(50));
    const result = sample(posts);

    expect(result.filter((s) => s.bucket === "mejor").length).toBe(5);
    expect(result.filter((s) => s.bucket === "peor").length).toBe(5);
    expect(result.filter((s) => s.bucket === "mediano").length).toBe(5);
  });
});
