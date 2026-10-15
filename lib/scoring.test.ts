import { describe, it, expect } from "vitest";
import { scorePost, datasetCoverage, datasetProxiedWeight, OBSERVABLE_MAX } from "./scoring";
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
    // 0.66 * (100/1000) + 5.0 * (10/1000) + 1.0 * (5/1000)
    // = 0.066 + 0.05 + 0.005 = 0.121
    const s = scorePost(post({ impressions: 1000, likes: 100, replies: 10, reposts: 5 }));
    expect(s.algoScore).toBeCloseTo(0.121, 10);
  });

  it("totalScore es algoScore por impresiones", () => {
    const s = scorePost(post({ impressions: 1000, likes: 100, replies: 10, reposts: 5 }));
    expect(s.totalScore).toBeCloseTo(121, 8);
  });

  it("puntúa mejor el post pequeño que convierte", () => {
    const viral = scorePost(post({ impressions: 10000, likes: 300, replies: 5 }));
    const bueno = scorePost(post({ impressions: 500, likes: 20, replies: 18 }));
    expect(viral.algoScore).toBeCloseTo(0.0223, 10);
    expect(bueno.algoScore).toBeCloseTo(0.2064, 10);
    expect(bueno.algoScore).toBeGreaterThan(viral.algoScore);
  });

  it("una reply pesa 5.0 / 0.66 ≈ 7.6 veces un like", () => {
    const conLikes = scorePost(post({ impressions: 1000, likes: 10 }));
    const conReplies = scorePost(post({ impressions: 1000, replies: 10 }));
    expect(conReplies.algoScore / conLikes.algoScore).toBeCloseTo(5.0 / 0.66, 10);
  });

  it("ignora profileVisits: su peso es 0.0", () => {
    const sin = scorePost(post({ impressions: 1000, likes: 10 }));
    const con = scorePost(post({ impressions: 1000, likes: 10, profileVisits: 500 }));
    expect(con.algoScore).toBe(sin.algoScore);
  });

  it("ignora bookmarks en el score real: no están en ValueModelWeights", () => {
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

  it("click suma detailExpands + permalinkClicks bajo un solo peso 0.3", () => {
    const soloDetail = scorePost(post({ impressions: 1000, detailExpands: 50 }));
    const soloPermalink = scorePost(post({ impressions: 1000, permalinkClicks: 50 }));
    const ambos = scorePost(
      post({ impressions: 1000, detailExpands: 30, permalinkClicks: 20 }),
    );
    expect(soloDetail.algoScore).toBeCloseTo(0.3 * 0.05, 10);
    expect(soloPermalink.algoScore).toBeCloseTo(0.3 * 0.05, 10);
    // 50 clicks combinados → misma cuenta que 50 en una sola columna.
    expect(ambos.algoScore).toBeCloseTo(0.3 * 0.05, 10);
    // Una sola contribución `click`, sin duplicar el peso.
    expect(ambos.contributions.filter((c) => c.action === "click")).toHaveLength(1);
  });

  it("lanza si las impresiones no son positivas", () => {
    expect(() => scorePost(post({ impressions: 0 }))).toThrow();
  });
});

describe("cobertura", () => {
  it("OBSERVABLE_MAX suma 18.21 (incluye quote=5.0)", () => {
    // reply 5 + follow 4 + quote 5 + share 2 + retweet 1 + fav 0.66
    // + click 0.3 + openLink 0.2 + media 0.05
    expect(OBSERVABLE_MAX).toBeCloseTo(18.21, 10);
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
    expect(scorePost(full).coverage).toBeCloseTo(18.21 / POSITIVE_SUM, 10);
    expect(scorePost(full).coverage).toBeCloseTo(0.4201, 3);
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
    expect(scorePost(full).coverage).toBeCloseTo(13.21 / POSITIVE_SUM, 10);
    expect(scorePost(full).coverage).toBeCloseTo(0.3048, 3);
  });

  it("proxiedWeight reporta el peso REAL de la señal estimada, no el proxy", () => {
    const withBookmarks = post({
      impressions: 1000,
      likes: 1,
      bookmarks: 1,
    });
    // share_via_copy_link vale 20.0 en el algoritmo. Ese es el peso de la
    // señal que el proxy intenta estimar; el 6.0 del proxy no aparece aquí.
    expect(scorePost(withBookmarks).proxiedWeight).toBe(20.0);
    expect(scorePost(withBookmarks).proxiedWeight).not.toBe(6.0);
  });

  it("el proxy NO infla la cobertura", () => {
    const base = { impressions: 1000, likes: 1, replies: 1 };
    const sinBookmarks = scorePost(post(base));
    const conBookmarks = scorePost(post({ ...base, bookmarks: 500 }));
    // `coverage` mide lo que se observa del algoritmo. Un proxy no observa
    // nada nuevo: estima. Por eso la cobertura es idéntica con y sin él.
    expect(conBookmarks.coverage).toBe(sinBookmarks.coverage);
  });

  it("proxiedWeight es 0 si no hay columna que alimente el proxy", () => {
    const withoutBookmarks = post({
      impressions: 1000,
      likes: 1,
      replies: 1,
    });
    expect(scorePost(withoutBookmarks).proxiedWeight).toBe(0);
  });

  it("baja la cobertura cuando faltan columnas", () => {
    const solo = post({ impressions: 1000, likes: 1 });
    expect(scorePost(solo).coverage).toBeCloseTo(0.66 / POSITIVE_SUM, 10);
  });

  it("datasetCoverage usa la unión de columnas presentes", () => {
    const rows = [
      post({ id: "a", likes: 1 }),
      post({ id: "b", replies: 1 }),
    ];
    expect(datasetCoverage(rows)).toBeCloseTo(5.66 / POSITIVE_SUM, 10);
  });

  it("datasetCoverage es 0 sin filas", () => {
    expect(datasetCoverage([])).toBe(0);
  });

  it("datasetProxiedWeight reporta el peso real estimado por proxy", () => {
    const rows = [
      post({ id: "a", likes: 1, bookmarks: 1 }),
      post({ id: "b", replies: 1 }),
    ];
    // El proxy de bookmarks sustituye a share_via_copy_link, que vale 20.0.
    expect(datasetProxiedWeight(rows)).toBe(20.0);
  });

  it("datasetProxiedWeight no altera datasetCoverage", () => {
    const conProxy = [post({ id: "a", likes: 1, bookmarks: 1 })];
    const sinProxy = [post({ id: "a", likes: 1 })];
    expect(datasetCoverage(conProxy)).toBe(datasetCoverage(sinProxy));
  });

  it("datasetProxiedWeight es 0 sin filas", () => {
    expect(datasetProxiedWeight([])).toBe(0);
  });
});
