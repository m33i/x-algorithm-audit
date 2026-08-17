import { describe, it, expect } from "vitest";
import { scorePost, datasetCoverage, datasetApproxCoverage, OBSERVABLE_MAX } from "./scoring";
import { POSITIVE_SUM } from "./weights";
import type { PostRow } from "./types";

function post(overrides: Partial<PostRow> = {}): PostRow {
  return {
    id: "1",
    date: new Date("2026-08-17T12:00:00Z"),
    text: "t",
    impressions: 1000,
    likes: null,
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
    ...overrides,
  };
}

describe("scorePost", () => {
  it("calcula Σ peso × acción/impresiones", () => {
    // 0.5 * (100/1000) + 5.0 * (10/1000) + 1.0 * (5/1000)
    // = 0.05 + 0.05 + 0.005 = 0.105
    const s = scorePost(post({ impressions: 1000, likes: 100, replies: 10, reposts: 5 }));
    expect(s.algoScore).toBeCloseTo(0.105, 10);
  });

  it("totalScore es algoScore por impresiones", () => {
    const s = scorePost(post({ impressions: 1000, likes: 100, replies: 10, reposts: 5 }));
    expect(s.totalScore).toBeCloseTo(105, 8);
  });

  it("puntúa mejor el post pequeño que convierte", () => {
    const viral = scorePost(post({ impressions: 10000, likes: 300, replies: 5 }));
    const bueno = scorePost(post({ impressions: 500, likes: 20, replies: 18 }));
    expect(viral.algoScore).toBeCloseTo(0.0175, 10);
    expect(bueno.algoScore).toBeCloseTo(0.2, 10);
    expect(bueno.algoScore).toBeGreaterThan(viral.algoScore);
  });

  it("una reply pesa 10 veces un like", () => {
    const conLikes = scorePost(post({ impressions: 1000, likes: 10 }));
    const conReplies = scorePost(post({ impressions: 1000, replies: 10 }));
    expect(conReplies.algoScore / conLikes.algoScore).toBeCloseTo(10, 10);
  });

  it("ignora profileVisits: su peso es 0.0", () => {
    const sin = scorePost(post({ impressions: 1000, likes: 10 }));
    const con = scorePost(post({ impressions: 1000, likes: 10, profileVisits: 500 }));
    expect(con.algoScore).toBe(sin.algoScore);
  });

  it("ignora bookmarks en el score real: no están en ScoringWeights", () => {
    const sin = scorePost(post({ impressions: 1000, likes: 10 }));
    const con = scorePost(post({ impressions: 1000, likes: 10, bookmarks: 500 }));
    expect(con.algoScore).toBe(sin.algoScore);
  });

  it("pero incorpora bookmarks en el approxScore como proxy de shareViaCopyLink", () => {
    const con = scorePost(post({ impressions: 1000, likes: 10, bookmarks: 500 }));
    // proxy 6.0 * (500/1000) = 3.0
    expect(con.approxScore - con.algoScore).toBeCloseTo(3.0, 10);
    expect(con.proxyContributions).toHaveLength(1);
    expect(con.proxyContributions[0].proxies).toBe("shareViaCopyLink");
  });

  it("no acredita proxy si la columna bookmarks es null", () => {
    const sin = scorePost(post({ impressions: 1000, likes: 10 }));
    expect(sin.proxyContributions).toHaveLength(0);
    expect(sin.approxScore).toBe(sin.algoScore);
  });

  it("quoteCount activa el peso real quote=5.0", () => {
    const s = scorePost(post({ impressions: 1000, quoteCount: 10 }));
    expect(s.algoScore).toBeCloseTo(5.0 * 0.01, 10);
    const q = s.contributions.find((c) => c.action === "quote");
    expect(q?.weight).toBe(5.0);
  });

  it("acredita mediaViews una sola vez a 0.05", () => {
    const s = scorePost(post({ impressions: 1000, mediaViews: 100 }));
    expect(s.algoScore).toBeCloseTo(0.05 * 0.1, 10);
  });

  it("da score cero sin acciones observables", () => {
    expect(scorePost(post({ impressions: 1000 })).algoScore).toBe(0);
  });

  it("lista una contribución por acción presente, ordenada de mayor a menor", () => {
    const s = scorePost(post({ impressions: 1000, likes: 100, replies: 10 }));
    expect(s.contributions).toHaveLength(2);
    expect(s.contributions[0].points).toBeGreaterThanOrEqual(
      s.contributions[1].points,
    );
    const reply = s.contributions.find((c) => c.action === "reply");
    expect(reply?.weight).toBe(5.0);
    expect(reply?.probability).toBeCloseTo(0.01, 10);
    expect(reply?.points).toBeCloseTo(0.05, 10);
  });

  it("click suma detailExpands + permalinkClicks bajo un solo peso 0.4", () => {
    const soloDetail = scorePost(post({ impressions: 1000, detailExpands: 50 }));
    const soloPermalink = scorePost(post({ impressions: 1000, permalinkClicks: 50 }));
    const ambos = scorePost(
      post({ impressions: 1000, detailExpands: 30, permalinkClicks: 20 }),
    );
    expect(soloDetail.algoScore).toBeCloseTo(0.4 * 0.05, 10);
    expect(soloPermalink.algoScore).toBeCloseTo(0.4 * 0.05, 10);
    // 50 clicks combinados → misma cuenta que 50 en una sola columna.
    expect(ambos.algoScore).toBeCloseTo(0.4 * 0.05, 10);
    // Una sola contribución `click`, sin duplicar el peso.
    expect(ambos.contributions.filter((c) => c.action === "click")).toHaveLength(1);
  });

  it("lanza si las impresiones no son positivas", () => {
    expect(() => scorePost(post({ impressions: 0 }))).toThrow();
  });
});

describe("cobertura", () => {
  it("OBSERVABLE_MAX suma 18.15 (incluye quote=5.0)", () => {
    // reply 5 + follow 4 + quote 5 + share 2 + retweet 1 + fav 0.5
    // + click 0.4 + openLink 0.2 + media 0.05
    expect(OBSERVABLE_MAX).toBeCloseTo(18.15, 10);
  });

  it("con todas las columnas cubre ~42% del espacio de pesos (con quote)", () => {
    const full = post({
      impressions: 1000,
      likes: 1,
      replies: 1,
      reposts: 1,
      shares: 1,
      newFollows: 1,
      detailExpands: 1,
      urlClicks: 1,
      mediaViews: 1,
      quoteCount: 1,
    });
    expect(scorePost(full).coverage).toBeCloseTo(18.15 / POSITIVE_SUM, 10);
    expect(scorePost(full).coverage).toBeCloseTo(0.4191, 3);
  });

  it("sin quoteCount la cobertura baja a ~30% (CSV nativo)", () => {
    const full = post({
      impressions: 1000,
      likes: 1,
      replies: 1,
      reposts: 1,
      shares: 1,
      newFollows: 1,
      detailExpands: 1,
      urlClicks: 1,
      mediaViews: 1,
    });
    expect(scorePost(full).coverage).toBeCloseTo(13.15 / POSITIVE_SUM, 10);
    expect(scorePost(full).coverage).toBeCloseTo(0.3036, 3);
  });

  it("approxCoverage añade el peso proxy de bookmarks cuando está presente", () => {
    const withBookmarks = post({
      impressions: 1000,
      likes: 1,
      replies: 1,
      reposts: 1,
      shares: 1,
      newFollows: 1,
      detailExpands: 1,
      urlClicks: 1,
      mediaViews: 1,
      bookmarks: 1,
    });
    // (13.15 + 6.0) / 43.32
    expect(scorePost(withBookmarks).approxCoverage).toBeCloseTo(
      (13.15 + 6.0) / POSITIVE_SUM,
      10,
    );
  });

  it("approxCoverage no añade el proxy si bookmarks es null", () => {
    const withoutBookmarks = post({
      impressions: 1000,
      likes: 1,
      replies: 1,
    });
    expect(scorePost(withoutBookmarks).approxCoverage).toBe(
      scorePost(withoutBookmarks).coverage,
    );
  });

  it("baja la cobertura cuando faltan columnas", () => {
    const solo = post({ impressions: 1000, likes: 1 });
    expect(scorePost(solo).coverage).toBeCloseTo(0.5 / POSITIVE_SUM, 10);
  });

  it("datasetCoverage usa la unión de columnas presentes", () => {
    const rows = [
      post({ id: "a", likes: 1 }),
      post({ id: "b", replies: 1 }),
    ];
    expect(datasetCoverage(rows)).toBeCloseTo(5.5 / POSITIVE_SUM, 10);
  });

  it("datasetCoverage es 0 sin filas", () => {
    expect(datasetCoverage([])).toBe(0);
  });

  it("datasetApproxCoverage añade proxies presentes en cualquier fila", () => {
    const rows = [
      post({ id: "a", likes: 1, bookmarks: 1 }),
      post({ id: "b", replies: 1 }),
    ];
    // (0.5 + 5.0 + 6.0) / 43.32
    expect(datasetApproxCoverage(rows)).toBeCloseTo(11.5 / POSITIVE_SUM, 10);
  });

  it("datasetApproxCoverage es 0 sin filas", () => {
    expect(datasetApproxCoverage([])).toBe(0);
  });
});
