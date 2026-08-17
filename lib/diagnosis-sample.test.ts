import { describe, it, expect } from "vitest";
import {
  sample,
  isCompleteSample,
  MAX_SAMPLE_POSTS,
  MAX_SAMPLE_CHARS,
} from "./diagnosis-sample";
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
      engagements: null,
      hashtagClicks: null,
      permalinkClicks: null,
      quoteCount: null,
    });
  }
  return rows;
}

describe("sample", () => {
  for (const n of [8, 10, 15, 20, 50]) {
    it(`con n=${n}, ningún id se repite entre buckets y el total no pasa del tope`, () => {
      const posts = scoreAll(dataset(n));
      const result = sample(posts);

      expect(result.length).toBeLessThanOrEqual(MAX_SAMPLE_POSTS);

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

  it("mantiene los extremos en 5 y se lleva el resto a mediano", () => {
    const posts = scoreAll(dataset(50));
    const result = sample(posts);

    expect(result.filter((s) => s.bucket === "mejor").length).toBe(5);
    expect(result.filter((s) => s.bucket === "peor").length).toBe(5);
    // Con 50 posts caben todos: 5 + 5 + 40.
    expect(result.filter((s) => s.bucket === "mediano").length).toBe(40);
  });

  it("con la cuenta entera por debajo del tope, la muestra son todos los posts", () => {
    const posts = scoreAll(dataset(50));
    const result = sample(posts);

    expect(result.length).toBe(50);
    expect(isCompleteSample(result, posts)).toBe(true);
  });

  it("por encima del tope recorta, marca la muestra como incompleta y conserva los extremos", () => {
    const posts = scoreAll(dataset(MAX_SAMPLE_POSTS + 80));
    const result = sample(posts);

    expect(result.length).toBe(MAX_SAMPLE_POSTS);
    expect(isCompleteSample(result, posts)).toBe(false);
    expect(result.filter((s) => s.bucket === "mejor").length).toBe(5);
    expect(result.filter((s) => s.bucket === "peor").length).toBe(5);

    // El post de mayor score y el de menor tienen que seguir estando: son los
    // que sostienen las reescrituras y el contraste.
    const scores = result.map((s) => s.algoScore);
    const all = posts.map((p) => p.algoScore);
    expect(Math.max(...scores)).toBe(Math.max(...all));
    expect(Math.min(...scores)).toBe(Math.min(...all));
  });

  it("el relleno mediano barre todo el rango, no solo un extremo", () => {
    const posts = scoreAll(dataset(MAX_SAMPLE_POSTS * 3));
    const result = sample(posts);
    const middle = result.filter((s) => s.bucket === "mediano");
    const globalMedian = posts.map((p) => p.algoScore).sort((a, b) => a - b)[
      Math.floor(posts.length / 2)
    ];

    // Con un barrido uniforme hay medianos por encima y por debajo de la
    // mediana global; cogiendo "los primeros que caigan" no los habría.
    expect(middle.some((s) => s.algoScore > globalMedian)).toBe(true);
    expect(middle.some((s) => s.algoScore < globalMedian)).toBe(true);
  });

  it("respeta el presupuesto de caracteres recortando solo el relleno", () => {
    const long = "x".repeat(2000);
    const rows = dataset(MAX_SAMPLE_POSTS).map((r) => ({ ...r, text: long }));
    const result = sample(scoreAll(rows));

    const chars = result.reduce((acc, s) => acc + s.text.length, 0);
    expect(chars).toBeLessThanOrEqual(MAX_SAMPLE_CHARS);
    // Los extremos son intocables aunque el presupuesto apriete.
    expect(result.filter((s) => s.bucket === "mejor").length).toBe(5);
    expect(result.filter((s) => s.bucket === "peor").length).toBe(5);
  });
});
