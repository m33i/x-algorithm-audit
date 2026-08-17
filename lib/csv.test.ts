import { describe, it, expect } from "vitest";
import { parseAnalyticsCsv, CsvParseError } from "./csv";

const HEADER =
  "Date,Post id,Post text,Impressions,Likes,Replies,Reposts,Bookmarks,Share,New follows,Detail expands,Url clicks,Media views,Profile visits";

function csv(...rows: string[]): string {
  return [HEADER, ...rows].join("\n");
}

describe("parseAnalyticsCsv", () => {
  it("mapea una fila completa", () => {
    const r = parseAnalyticsCsv(
      csv("2026-08-01,111,Hola mundo,1000,100,10,5,3,2,1,40,20,7,9"),
    );
    expect(r.rows).toHaveLength(1);
    const p = r.rows[0];
    expect(p.id).toBe("111");
    expect(p.text).toBe("Hola mundo");
    expect(p.impressions).toBe(1000);
    expect(p.likes).toBe(100);
    expect(p.replies).toBe(10);
    expect(p.reposts).toBe(5);
    expect(p.bookmarks).toBe(3);
    expect(p.shares).toBe(2);
    expect(p.newFollows).toBe(1);
    expect(p.detailExpands).toBe(40);
    expect(p.urlClicks).toBe(20);
    expect(p.mediaViews).toBe(7);
    expect(p.profileVisits).toBe(9);
    expect(p.date.getUTCFullYear()).toBe(2026);
  });

  it("normaliza las cabeceras: mayúsculas, espacios y guiones bajos", () => {
    const r = parseAnalyticsCsv(
      "DATE,post_id,Post Text,impressions\n2026-08-01,111,Hola,1000",
    );
    expect(r.rows[0].id).toBe("111");
    expect(r.rows[0].impressions).toBe(1000);
  });

  it("acepta alias conocidos de cabecera", () => {
    const r = parseAnalyticsCsv(
      "Time,Tweet id,Tweet text,Impressions,Likes,Retweets\n2026-08-01,111,Hola,1000,50,5",
    );
    expect(r.rows[0].id).toBe("111");
    expect(r.rows[0].likes).toBe(50);
    expect(r.rows[0].reposts).toBe(5);
  });

  it("deja en null las columnas opcionales ausentes y las reporta", () => {
    const r = parseAnalyticsCsv(
      "Date,Post id,Post text,Impressions\n2026-08-01,111,Hola,1000",
    );
    expect(r.rows[0].likes).toBeNull();
    expect(r.rows[0].replies).toBeNull();
    expect(r.missingColumns).toContain("likes");
    expect(r.missingColumns).toContain("replies");
  });

  it("lanza CsvParseError si falta una columna requerida", () => {
    expect(() =>
      parseAnalyticsCsv("Date,Post id,Post text\n2026-08-01,111,Hola"),
    ).toThrow(CsvParseError);
  });

  it("el error nombra la columna que falta y las cabeceras vistas", () => {
    try {
      parseAnalyticsCsv("Date,Post id,Post text\n2026-08-01,111,Hola");
      expect.unreachable("debería haber lanzado");
    } catch (e) {
      expect(e).toBeInstanceOf(CsvParseError);
      const err = e as CsvParseError;
      expect(err.message).toContain("impressions");
      expect(err.seenHeaders).toContain("date");
    }
  });

  it("descarta filas sin id o sin impresiones y las cuenta", () => {
    const r = parseAnalyticsCsv(
      csv(
        "2026-08-01,111,Bien,1000,10,1,1,1,1,1,1,1,1,1",
        "2026-08-02,,Sin id,500,5,0,0,0,0,0,0,0,0,0",
        "2026-08-03,333,Sin impresiones,,5,0,0,0,0,0,0,0,0,0",
      ),
    );
    expect(r.rows).toHaveLength(1);
    expect(r.skippedRows).toBe(2);
  });

  it("descarta filas con 0 impresiones: no se pueden puntuar", () => {
    const r = parseAnalyticsCsv(
      csv("2026-08-01,111,Cero,0,0,0,0,0,0,0,0,0,0,0"),
    );
    expect(r.rows).toHaveLength(0);
    expect(r.skippedRows).toBe(1);
  });

  it("limpia separadores de millares y porcentajes", () => {
    const r = parseAnalyticsCsv(
      "Date,Post id,Post text,Impressions,Likes\n2026-08-01,111,Hola,\"12,345\",1.2%",
    );
    expect(r.rows[0].impressions).toBe(12345);
    expect(r.rows[0].likes).toBe(1.2);
  });

  it("preserva las comas dentro del texto entrecomillado", () => {
    const r = parseAnalyticsCsv(
      'Date,Post id,Post text,Impressions\n2026-08-01,111,"Hola, mundo, qué tal",1000',
    );
    expect(r.rows[0].text).toBe("Hola, mundo, qué tal");
  });

  it("lanza si el CSV está vacío", () => {
    expect(() => parseAnalyticsCsv("")).toThrow(CsvParseError);
  });
});

describe("enriquecimiento de media desde la API", () => {
  it("acepta una columna has_media booleana", () => {
    const r = parseAnalyticsCsv(
      "Date,Post id,Post text,Impressions,has_media\n2026-08-01,111,Hola,1000,true",
    );
    expect(r.rows[0].mediaViews).toBe(1);
  });

  it("mapea false a 0, no a null", () => {
    const r = parseAnalyticsCsv(
      "Date,Post id,Post text,Impressions,has_media\n2026-08-01,111,Hola,1000,false",
    );
    expect(r.rows[0].mediaViews).toBe(0);
  });

  it("sigue aceptando media views numérico", () => {
    const r = parseAnalyticsCsv(
      "Date,Post id,Post text,Impressions,Media views\n2026-08-01,111,Hola,1000,42",
    );
    expect(r.rows[0].mediaViews).toBe(42);
  });
});
