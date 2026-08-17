import { describe, it, expect } from "vitest";
import { analyze } from "./findings";
import type { PostRow } from "./types";

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
    ...o,
  };
}

describe("analyze", () => {
  it("devuelve las métricas de cabecera", () => {
    const rows = Array.from({ length: 10 }, (_, i) => post({ id: `p${i}` }));
    const r = analyze(rows);
    expect(r.postCount).toBe(10);
    expect(r.medianAlgoScore).toBeGreaterThan(0);
    expect(r.coverage).toBeGreaterThan(0);
    expect(r.coverage).toBeLessThanOrEqual(1);
  });

  it("emite el hallazgo del impuesto del link cuando el efecto es real", () => {
    const rows: PostRow[] = [];
    for (let i = 0; i < 12; i++) {
      rows.push(post({ id: `l${i}`, text: `link https://a.com/${i}`, likes: 5 }));
      rows.push(post({ id: `p${i}`, text: `plano ${i}`, likes: 300 }));
    }
    const r = analyze(rows);
    const f = r.findings.find((x) => x.id === "link-tax");
    expect(f).toBeDefined();
    expect(f!.codeRef).toContain("param.rs");
  });

  it("NO emite hallazgo de link cuando no hay efecto", () => {
    const rows: PostRow[] = [];
    for (let i = 0; i < 12; i++) {
      rows.push(post({ id: `l${i}`, text: `link https://a.com/${i}`, likes: 100 }));
      rows.push(post({ id: `p${i}`, text: `plano ${i}`, likes: 100 }));
    }
    expect(analyze(rows).findings.some((f) => f.id === "link-tax")).toBe(false);
  });

  it("NO emite hallazgos con muestra insuficiente", () => {
    const rows: PostRow[] = [];
    for (let i = 0; i < 3; i++) {
      rows.push(post({ id: `l${i}`, text: `link https://a.com/${i}`, likes: 1 }));
      rows.push(post({ id: `p${i}`, text: `plano ${i}`, likes: 999 }));
    }
    expect(analyze(rows).findings.some((f) => f.id === "link-tax")).toBe(false);
  });

  it("avisa de señales de peso cero cuando dominan", () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      post({ id: `p${i}`, likes: 5, replies: 0, profileVisits: 400, bookmarks: 300 }),
    );
    const f = analyze(rows).findings.find((x) => x.id === "zero-weight-signals");
    expect(f).toBeDefined();
    expect(f!.explanation).toContain("0.0");
  });

  it("NO emite likes-over-replies con menos de 8 posts", () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
      post({ id: `p${i}`, likes: 1000, replies: 0 }),
    );
    expect(analyze(rows).findings.some((f) => f.id === "likes-over-replies")).toBe(false);
  });

  it("NO emite zero-weight-signals con menos de 8 posts", () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
      post({ id: `p${i}`, likes: 5, replies: 0, profileVisits: 400, bookmarks: 300 }),
    );
    expect(analyze(rows).findings.some((f) => f.id === "zero-weight-signals")).toBe(false);
  });

  it("detecta ráfagas y estima el multiplicador perdido", () => {
    const base = new Date("2026-08-17T10:00:00Z").getTime();
    const rows = Array.from({ length: 5 }, (_, i) =>
      post({ id: `b${i}`, date: new Date(base + i * 10 * 60 * 1000) }),
    );
    const r = analyze(rows);
    expect(r.burstPenalty.burstCount).toBeGreaterThan(0);
    expect(r.burstPenalty.estimatedLoss).toBeGreaterThan(0);
    expect(r.findings.some((f) => f.id === "burst-cannibalization")).toBe(true);
  });

  it("no detecta ráfaga con posts bien espaciados", () => {
    const base = new Date("2026-08-01T10:00:00Z").getTime();
    const rows = Array.from({ length: 5 }, (_, i) =>
      post({ id: `s${i}`, date: new Date(base + i * 24 * 3600 * 1000) }),
    );
    expect(analyze(rows).burstPenalty.burstCount).toBe(0);
  });

  it("señala los posts que desperdiciaron alcance", () => {
    const rows: PostRow[] = [];
    // 18 posts normales
    for (let i = 0; i < 18; i++) {
      rows.push(post({ id: `n${i}`, impressions: 1000, likes: 50 }));
    }
    // 2 con muchísimo alcance y conversión ínfima
    rows.push(post({ id: "waste1", impressions: 100000, likes: 5, replies: 0 }));
    rows.push(post({ id: "waste2", impressions: 90000, likes: 4, replies: 0 }));
    expect(analyze(rows).findings.some((f) => f.id === "wasted-reach")).toBe(true);
  });

  it("NO emite wasted-reach cuando las impresiones son uniformes (sin dispersión real)", () => {
    // Mismo fixture que el hallazgo del impuesto del link: impresiones fijas
    // en 1000 para todos los posts, pese a la gran dispersión de AlgoScore.
    // Sin dispersión de impresiones, "decil alto" no significa nada.
    const rows: PostRow[] = [];
    for (let i = 0; i < 12; i++) {
      rows.push(post({ id: `l${i}`, text: `link https://a.com/${i}`, likes: 5 }));
      rows.push(post({ id: `p${i}`, text: `plano ${i}`, likes: 300 }));
    }
    expect(analyze(rows).findings.some((f) => f.id === "wasted-reach")).toBe(false);
  });

  it("NO emite wasted-reach cuando solo un post cumple el criterio", () => {
    const rows: PostRow[] = [];
    for (let i = 0; i < 16; i++) {
      rows.push(post({ id: `n${i}`, impressions: 1000, likes: 50 }));
    }
    // Mucho alcance y buena conversión: no cuenta como desperdicio.
    rows.push(
      post({ id: "good-reach", impressions: 100000, likes: 50000, replies: 0 }),
    );
    // Mucho alcance y conversión ínfima: el único que cumple el criterio.
    rows.push(post({ id: "waste1", impressions: 100000, likes: 5, replies: 0 }));
    expect(analyze(rows).findings.some((f) => f.id === "wasted-reach")).toBe(false);
  });

  it("ordena los hallazgos por severidad", () => {
    const rows: PostRow[] = [];
    for (let i = 0; i < 12; i++) {
      rows.push(post({ id: `l${i}`, text: `link https://a.com/${i}`, likes: 5 }));
      rows.push(post({ id: `p${i}`, text: `plano ${i}`, likes: 300 }));
    }
    const order = { alta: 0, media: 1, baja: 2 };
    const sev = analyze(rows).findings.map((f) => order[f.severity]);
    expect([...sev].sort((a, b) => a - b)).toEqual(sev);
  });

  it("cada hallazgo lleva evidencia numérica y referencia al código", () => {
    const rows: PostRow[] = [];
    for (let i = 0; i < 12; i++) {
      rows.push(post({ id: `l${i}`, text: `link https://a.com/${i}`, likes: 5 }));
      rows.push(post({ id: `p${i}`, text: `plano ${i}`, likes: 300 }));
    }
    for (const f of analyze(rows).findings) {
      expect(f.evidence).toMatch(/\d/);
      expect(f.codeRef.length).toBeGreaterThan(0);
      expect(f.action.length).toBeGreaterThan(0);
    }
  });

  it("lanza si no hay posts", () => {
    expect(() => analyze([])).toThrow();
  });
});
