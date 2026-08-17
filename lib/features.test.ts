import { describe, it, expect } from "vitest";
import { extractFeatures } from "./features";
import type { PostRow } from "./types";

function post(overrides: Partial<PostRow> = {}): PostRow {
  return {
    id: "1",
    date: new Date("2026-08-17T14:30:00Z"),
    text: "texto",
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
    ...overrides,
  };
}

describe("hasLink", () => {
  it("detecta https", () => {
    expect(extractFeatures(post({ text: "mira https://x.com/a" })).hasLink).toBe(
      true,
    );
  });

  it("detecta http", () => {
    expect(extractFeatures(post({ text: "http://a.com" })).hasLink).toBe(true);
  });

  it("detecta t.co sin protocolo", () => {
    expect(extractFeatures(post({ text: "ver t.co/abc123" })).hasLink).toBe(
      true,
    );
  });

  it("no confunde un dominio suelto con un link", () => {
    expect(extractFeatures(post({ text: "trabajo en acme.com" })).hasLink).toBe(
      false,
    );
  });

  it("es falso sin URL", () => {
    expect(extractFeatures(post({ text: "sin links aquí" })).hasLink).toBe(
      false,
    );
  });
});

describe("hasMedia", () => {
  it("es verdadero si mediaViews > 0", () => {
    expect(extractFeatures(post({ mediaViews: 42 })).hasMedia).toBe(true);
  });

  it("es falso si mediaViews es 0", () => {
    expect(extractFeatures(post({ mediaViews: 0 })).hasMedia).toBe(false);
  });

  it("es falso si mediaViews es null", () => {
    expect(extractFeatures(post({ mediaViews: null })).hasMedia).toBe(false);
  });

  it("detecta pic.x.com en el texto", () => {
    expect(extractFeatures(post({ text: "foto pic.x.com/abc" })).hasMedia).toBe(
      true,
    );
  });
});

describe("length", () => {
  it("cuenta puntos de código, no unidades UTF-16", () => {
    // Un emoji fuera del BMP ocupa 2 unidades UTF-16 pero es 1 carácter.
    expect(extractFeatures(post({ text: "👍" })).length).toBe(1);
    expect(extractFeatures(post({ text: "hola 👍" })).length).toBe(6);
  });
});

describe("hashtagCount", () => {
  it("cuenta hashtags", () => {
    expect(
      extractFeatures(post({ text: "#uno y #dos" })).hashtagCount,
    ).toBe(2);
  });

  it("cuenta un hashtag pegado a puntuación", () => {
    expect(extractFeatures(post({ text: "final #tag." })).hashtagCount).toBe(1);
  });

  it("no cuenta una almohadilla suelta", () => {
    expect(extractFeatures(post({ text: "coste # 5" })).hashtagCount).toBe(0);
  });

  it("no cuenta una almohadilla en medio de una palabra", () => {
    expect(extractFeatures(post({ text: "do#re" })).hashtagCount).toBe(0);
  });
});

describe("mentionCount", () => {
  it("cuenta menciones", () => {
    expect(
      extractFeatures(post({ text: "hola @ana y @bea" })).mentionCount,
    ).toBe(2);
  });

  it("no cuenta un email como mención", () => {
    expect(
      extractFeatures(post({ text: "escribe a ana@acme.com" })).mentionCount,
    ).toBe(0);
  });
});

describe("isReply", () => {
  it("es verdadero si el texto empieza por mención", () => {
    expect(extractFeatures(post({ text: "@ana claro" })).isReply).toBe(true);
  });

  it("tolera espacios iniciales", () => {
    expect(extractFeatures(post({ text: "  @ana claro" })).isReply).toBe(true);
  });

  it("es falso si la mención va en medio", () => {
    expect(extractFeatures(post({ text: "hola @ana" })).isReply).toBe(false);
  });
});

describe("hora y día", () => {
  it("usa la hora local del usuario", () => {
    const d = new Date(2026, 7, 17, 14, 30, 0); // 17 ago 2026, lunes, 14:30 local
    const f = extractFeatures(post({ date: d }));
    expect(f.hourOfDay).toBe(14);
    expect(f.dayOfWeek).toBe(1); // 0 = domingo
  });
});
