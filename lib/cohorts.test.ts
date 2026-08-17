import { describe, it, expect } from "vitest";
import {
  scoreAll,
  compareBinary,
  compareGroups,
  linkCohort,
  MIN_GROUP_SIZE,
} from "./cohorts";
import type { PostRow } from "./types";

/** Construye un post con un ratio de likes controlado. */
function post(id: string, text: string, likes: number, impressions = 1000): PostRow {
  return {
    id,
    date: new Date("2026-08-17T12:00:00Z"),
    text,
    impressions,
    likes,
    replies: null,
    reposts: null,
    shares: null,
    newFollows: null,
    detailExpands: null,
    urlClicks: null,
    mediaViews: null,
    profileVisits: null,
    bookmarks: null,
  };
}

/** n posts con link y bajo engagement, n sin link y alto engagement. */
function datasetWithLinkEffect(n: number) {
  const rows: PostRow[] = [];
  for (let i = 0; i < n; i++) {
    rows.push(post(`link-${i}`, `con link https://a.com/${i}`, 10 + i));
    rows.push(post(`plain-${i}`, `sin link número ${i}`, 200 + i));
  }
  return scoreAll(rows);
}

describe("scoreAll", () => {
  it("adjunta features y algoScore a cada fila", () => {
    const scored = scoreAll([post("a", "hola https://x.com", 100)]);
    expect(scored).toHaveLength(1);
    expect(scored[0].features.hasLink).toBe(true);
    expect(scored[0].algoScore).toBeCloseTo(0.5 * 0.1, 10);
  });
});

describe("compareBinary", () => {
  it("detecta un efecto grande con muestra suficiente", () => {
    const c = compareBinary(
      datasetWithLinkEffect(10),
      "link",
      ["con link", "sin link"],
      (p) => p.features.hasLink,
    );
    expect(c.insufficientSample).toBe(false);
    expect(c.significant).toBe(true);
    expect(c.pScore).not.toBeNull();
    expect(c.pScore!).toBeLessThan(0.05);
    expect(c.groups[0].n).toBe(10);
    expect(c.groups[1].n).toBe(10);
    expect(c.groups[0].medianScore).toBeLessThan(c.groups[1].medianScore);
  });

  it("marca muestra insuficiente por debajo de MIN_GROUP_SIZE", () => {
    const c = compareBinary(
      datasetWithLinkEffect(MIN_GROUP_SIZE - 1),
      "link",
      ["con link", "sin link"],
      (p) => p.features.hasLink,
    );
    expect(c.insufficientSample).toBe(true);
    expect(c.significant).toBe(false);
    expect(c.pScore).toBeNull();
  });

  it("NO reporta significancia cuando no hay efecto real", () => {
    // Mismo engagement en ambos grupos: solo ruido.
    const rows: PostRow[] = [];
    for (let i = 0; i < 15; i++) {
      rows.push(post(`link-${i}`, `con link https://a.com/${i}`, 100 + (i % 5)));
      rows.push(post(`plain-${i}`, `sin link ${i}`, 100 + (i % 5)));
    }
    const c = compareBinary(
      scoreAll(rows),
      "link",
      ["con link", "sin link"],
      (p) => p.features.hasLink,
    );
    expect(c.insufficientSample).toBe(false);
    expect(c.significant).toBe(false);
  });

  it("marca muestra insuficiente si un grupo queda vacío", () => {
    const rows = Array.from({ length: 20 }, (_, i) =>
      post(`p-${i}`, `sin link ${i}`, 100),
    );
    const c = compareBinary(
      scoreAll(rows),
      "link",
      ["con link", "sin link"],
      (p) => p.features.hasLink,
    );
    expect(c.insufficientSample).toBe(true);
  });
});

describe("compareGroups", () => {
  it("compara el mejor contra el peor grupo con n suficiente", () => {
    const rows: PostRow[] = [];
    for (let i = 0; i < 10; i++) {
      rows.push(post(`m-${i}`, `mañana ${i}`, 50 + i));
      rows.push(post(`t-${i}`, `tarde ${i}`, 300 + i));
      rows.push(post(`n-${i}`, `noche ${i}`, 150 + i));
    }
    const scored = scoreAll(rows);
    const key = (p: (typeof scored)[number]) =>
      p.row.text.split(" ")[0];
    const c = compareGroups(scored, "franja", key);
    expect(c.groups).toHaveLength(3);
    expect(c.insufficientSample).toBe(false);
    // Ordenados de menor a mayor mediana de score.
    expect(c.groups[0].label).toBe("mañana");
    expect(c.groups[2].label).toBe("tarde");
  });

  it("descarta los grupos por debajo de MIN_GROUP_SIZE", () => {
    const rows: PostRow[] = [];
    for (let i = 0; i < 10; i++) rows.push(post(`a-${i}`, `alfa ${i}`, 100 + i));
    for (let i = 0; i < 3; i++) rows.push(post(`b-${i}`, `beta ${i}`, 900));
    const scored = scoreAll(rows);
    const c = compareGroups(scored, "g", (p) => p.row.text.split(" ")[0]);
    expect(c.groups.map((g) => g.label)).toEqual(["alfa"]);
    expect(c.insufficientSample).toBe(true);
  });

  it("no descarta la comparación cuando los dos grupos contrastados tienen n>=8, aunque exista un tercer bucket pequeño", () => {
    const rows: PostRow[] = [];
    for (let i = 0; i < 10; i++) rows.push(post(`a-${i}`, `alfa ${i}`, 50 + i));
    for (let i = 0; i < 10; i++) rows.push(post(`b-${i}`, `beta ${i}`, 300 + i));
    // Tercer bucket por debajo de MIN_GROUP_SIZE: debe quedar fuera de
    // `groups` sin invalidar el contraste entre alfa y beta.
    for (let i = 0; i < 2; i++) rows.push(post(`c-${i}`, `gamma ${i}`, 900));
    const scored = scoreAll(rows);
    const c = compareGroups(scored, "g", (p) => p.row.text.split(" ")[0]);
    expect(c.groups.map((g) => g.label)).toEqual(["alfa", "beta"]);
    expect(c.insufficientSample).toBe(false);
    expect(c.pScore).not.toBeNull();
  });
});

describe("linkCohort", () => {
  it("excluye los posts con media para evitar el confound de t.co", () => {
    const rows: PostRow[] = [];
    // 10 con link, sin media
    for (let i = 0; i < 10; i++) {
      rows.push(post(`l-${i}`, `link https://a.com/${i}`, 10));
    }
    // 10 sin link, sin media
    for (let i = 0; i < 10; i++) {
      rows.push(post(`p-${i}`, `plano ${i}`, 200));
    }
    // 20 con media: deben quedar fuera de ambos grupos
    const withMedia = Array.from({ length: 20 }, (_, i) => ({
      ...post(`m-${i}`, `foto pic.x.com/${i}`, 500),
      mediaViews: 100,
    }));
    const c = linkCohort(scoreAll([...rows, ...withMedia]));
    expect(c.groups[0].n + c.groups[1].n).toBe(20);
  });
});
