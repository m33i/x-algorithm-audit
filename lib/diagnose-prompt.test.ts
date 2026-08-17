import { describe, it, expect } from "vitest";
import { z } from "zod";
import { analyze } from "./findings";
import { scoreAll } from "./cohorts";
import type { PostRow } from "./types";
import {
  DIAGNOSIS_SYSTEM_PROMPT,
  buildDiagnosisPayload,
  buildDiagnosisPrompt,
  buildDiagnosisUserMessage,
} from "./diagnose-prompt";
import { DiagnosisRequestSchema, DiagnosisSchema } from "./diagnosis-schema";

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

  it("incluye el payload como JSON indentado", () => {
    expect(prompt).toContain(JSON.stringify(payload, null, 2));
  });

  it("incluye el schema JSON de salida", () => {
    expect(prompt).toContain(JSON.stringify(z.toJSONSchema(DiagnosisSchema), null, 2));
  });

  it("pide respuesta solo en JSON", () => {
    expect(prompt).toMatch(/JSON/i);
  });

  it("es determinista: misma entrada, misma salida", () => {
    const again = buildDiagnosisPrompt(payload);
    expect(again).toBe(prompt);
  });
});

describe("buildDiagnosisUserMessage", () => {
  const report = fixture();
  const posts = scoreAll(
    Array.from({ length: 20 }, (_, i) => post({ id: `x${i}`, likes: i })),
  );
  const payload = buildDiagnosisPayload(report, posts);
  const userMessage = buildDiagnosisUserMessage(payload);

  it("no incluye el system prompt (va aparte en systemInstruction)", () => {
    expect(userMessage.startsWith(DIAGNOSIS_SYSTEM_PROMPT)).toBe(false);
  });

  it("incluye el payload y el schema de salida", () => {
    expect(userMessage).toContain(JSON.stringify(payload, null, 2));
    expect(userMessage).toContain(
      JSON.stringify(z.toJSONSchema(DiagnosisSchema), null, 2),
    );
  });

  it("combinado con el system prompt equivale a buildDiagnosisPrompt", () => {
    expect(DIAGNOSIS_SYSTEM_PROMPT + "\n\n" + userMessage).toBe(
      buildDiagnosisPrompt(payload),
    );
  });
});
