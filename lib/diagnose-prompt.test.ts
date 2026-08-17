import { describe, it, expect } from "vitest";
import { analyze } from "./findings";
import { scoreAll } from "./cohorts";
import type { PostRow } from "./types";
import {
  DIAGNOSIS_SYSTEM_PROMPT,
  buildDiagnosisPayload,
  buildDiagnosisPrompt,
} from "./diagnose-prompt";
import { DiagnosisRequestSchema } from "./diagnosis-schema";

function post(o: Partial<PostRow> & { id: string }): PostRow {
  return {
    date: new Date("2026-08-17T12:00:00Z"),
    text: "texto normal",
    impressions: 1000,
    likes: 50,
    replies: 5,
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
    ...o,
  };
}

function fixture() {
  const rows: PostRow[] = [];
  for (let i = 0; i < 12; i++) {
    rows.push(post({ id: `l${i}`, text: `link https://a.com/${i}`, likes: 5 }));
    rows.push(post({ id: `p${i}`, text: `plano ${i}`, likes: 300 }));
  }
  return analyze(rows);
}

describe("buildDiagnosisPayload", () => {
  it("valida DiagnosisRequestSchema", () => {
    const report = fixture();
    const posts = scoreAll(
      Array.from({ length: 20 }, (_, i) => post({ id: `x${i}`, likes: i })),
    );
    const payload = buildDiagnosisPayload(report, posts);
    expect(() => DiagnosisRequestSchema.parse(payload)).not.toThrow();
  });

  it("mapea cohortes sin campos internos (groups, pScore, significant, insufficientSample)", () => {
    const report = fixture();
    const posts = scoreAll(
      Array.from({ length: 20 }, (_, i) => post({ id: `x${i}`, likes: i })),
    );
    const payload = buildDiagnosisPayload(report, posts);
    for (const c of payload.cohorts) {
      expect(c).toHaveProperty("id");
      expect(c).toHaveProperty("groups");
      expect(c).toHaveProperty("pScore");
      expect(c).toHaveProperty("significant");
      expect(c).toHaveProperty("insufficientSample");
    }
  });

  it("incluye hasta 15 posts de muestra en buckets mejor/peor/mediano", () => {
    const report = fixture();
    const posts = scoreAll(
      Array.from({ length: 50 }, (_, i) => post({ id: `x${i}`, likes: i * 10 })),
    );
    const payload = buildDiagnosisPayload(report, posts);
    expect(payload.samplePosts.length).toBeLessThanOrEqual(15);
    const buckets = new Set(payload.samplePosts.map((s) => s.bucket));
    expect(buckets.has("mejor") || buckets.has("peor")).toBe(true);
  });

  it("arrastra los hallazgos del report", () => {
    const report = fixture();
    const posts = scoreAll(
      Array.from({ length: 20 }, (_, i) => post({ id: `x${i}`, likes: i })),
    );
    const payload = buildDiagnosisPayload(report, posts);
    expect(payload.findings).toEqual(report.findings);
  });

  it("incluye proxiedWeight además de coverage, y no los confunde", () => {
    const report = fixture();
    const posts = scoreAll(
      Array.from({ length: 20 }, (_, i) => post({ id: `x${i}`, likes: i })),
    );
    const payload = buildDiagnosisPayload(report, posts);
    expect(payload).toHaveProperty("coverage");
    expect(payload).toHaveProperty("proxiedWeight");
    // `coverage` es una fracción; `proxiedWeight` es un peso del algoritmo.
    // Son magnitudes distintas y no deben sumarse ni compararse.
    expect(payload.coverage).toBeLessThanOrEqual(1);
  });
});

describe("buildDiagnosisPrompt", () => {
  const report = fixture();
  const posts = scoreAll(
    Array.from({ length: 20 }, (_, i) => post({ id: `x${i}`, likes: i })),
  );
  const payload = buildDiagnosisPayload(report, posts);
  const prompt = buildDiagnosisPrompt(payload);

  it("empieza con el system prompt de rol", () => {
    expect(prompt.startsWith(DIAGNOSIS_SYSTEM_PROMPT)).toBe(true);
  });

  it("incluye el payload como JSON indentado al final", () => {
    expect(prompt).toContain(JSON.stringify(payload, null, 2));
    // El JSON va al final, después de las instrucciones.
    const jsonIndex = prompt.indexOf(JSON.stringify(payload, null, 2));
    expect(jsonIndex).toBeGreaterThan(DIAGNOSIS_SYSTEM_PROMPT.length);
  });

  it("no pide respuesta en JSON: la salida es Markdown estructurado", () => {
    expect(prompt).not.toMatch(/Responde solo con un JSON/i);
    expect(prompt).toMatch(/Markdown completo/i);
  });

  it("contiene la estructura de 10 secciones", () => {
    expect(prompt).toContain("## 1. Resumen ejecutivo");
    expect(prompt).toContain("## 10. Conclusión");
  });

  it("es determinista: misma entrada, misma salida", () => {
    const again = buildDiagnosisPrompt(payload);
    expect(again).toBe(prompt);
  });
});
