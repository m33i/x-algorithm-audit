import Papa from "papaparse";
import type { PostRow } from "./types";

export class CsvParseError extends Error {
  readonly seenHeaders: string[];
  constructor(message: string, seenHeaders: string[]) {
    super(message);
    this.name = "CsvParseError";
    this.seenHeaders = seenHeaders;
  }
}

export interface ParseResult {
  rows: PostRow[];
  /** Campos opcionales de PostRow sin columna correspondiente en el CSV. */
  missingColumns: string[];
  /** Filas descartadas por falta de id, de fecha o de impresiones útiles. */
  skippedRows: number;
}

/** Cabecera → minúsculas, sin nada que no sea alfanumérico. */
function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Alias por campo. X ha renombrado columnas entre versiones de Analytics
 * (tweet → post, retweets → reposts), así que aceptamos ambas familias.
 */
const COLUMN_ALIASES: Record<keyof PostRow, string[]> = {
  id: ["postid", "tweetid", "id"],
  date: ["date", "time", "datetime", "createdat"],
  text: ["posttext", "tweettext", "text", "post"],
  impressions: ["impressions", "views", "impression"],
  likes: ["likes", "like", "favorites"],
  replies: ["replies", "reply"],
  reposts: ["reposts", "retweets", "repost", "retweet"],
  shares: ["share", "shares"],
  newFollows: ["newfollows", "follows", "newfollowers"],
  detailExpands: ["detailexpands", "detailexpand", "expands"],
  urlClicks: ["urlclicks", "linkclicks", "urlclick"],
  mediaViews: ["mediaviews", "mediaview", "videoviews"],
  profileVisits: ["profilevisits", "profileclicks", "profilevisit"],
  bookmarks: ["bookmarks", "bookmark"],
};

const REQUIRED_FIELDS: (keyof PostRow)[] = ["id", "date", "text", "impressions"];

const OPTIONAL_NUMERIC_FIELDS = [
  "likes",
  "replies",
  "reposts",
  "shares",
  "newFollows",
  "detailExpands",
  "urlClicks",
  "mediaViews",
  "profileVisits",
  "bookmarks",
] as const;

/** "12,345" → 12345 ; "1.2%" → 1.2 ; "" → null */
function toNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const cleaned = raw.replace(/[,\s%]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function parseAnalyticsCsv(csvText: string): ParseResult {
  const parsed = Papa.parse<Record<string, string>>(csvText.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: normalizeHeader,
  });

  const seenHeaders = parsed.meta.fields ?? [];
  if (seenHeaders.length === 0) {
    throw new CsvParseError(
      "El CSV no tiene cabeceras legibles. ¿Es el fichero correcto?",
      [],
    );
  }

  // Resolver cada campo a la primera cabecera que coincida con alguno de sus alias.
  const columnFor = {} as Record<keyof PostRow, string | undefined>;
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    columnFor[field as keyof PostRow] = aliases.find((a) =>
      seenHeaders.includes(a),
    );
  }

  for (const field of REQUIRED_FIELDS) {
    if (columnFor[field] === undefined) {
      throw new CsvParseError(
        `Falta la columna requerida "${field}". Cabeceras encontradas: ${seenHeaders.join(", ")}`,
        seenHeaders,
      );
    }
  }

  const missingColumns = OPTIONAL_NUMERIC_FIELDS.filter(
    (f) => columnFor[f] === undefined,
  ) as string[];

  const rows: PostRow[] = [];
  let skippedRows = 0;

  for (const record of parsed.data) {
    const id = (record[columnFor.id!] ?? "").trim();
    const rawDate = (record[columnFor.date!] ?? "").trim();
    const impressions = toNumber(record[columnFor.impressions!]);
    const date = new Date(rawDate);

    // Sin id, sin fecha válida o sin impresiones útiles no se puede puntuar.
    if (
      id === "" ||
      Number.isNaN(date.getTime()) ||
      impressions === null ||
      impressions <= 0
    ) {
      skippedRows++;
      continue;
    }

    const row: PostRow = {
      id,
      date,
      text: record[columnFor.text!] ?? "",
      impressions,
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
    };

    for (const field of OPTIONAL_NUMERIC_FIELDS) {
      const col = columnFor[field];
      if (col !== undefined) row[field] = toNumber(record[col]);
    }

    rows.push(row);
  }

  return { rows, missingColumns, skippedRows };
}
