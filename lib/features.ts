import type { PostRow } from "./types";

export interface PostFeatures {
  hasLink: boolean;
  hasMedia: boolean;
  /** Longitud en puntos de código Unicode, no en unidades UTF-16. */
  length: number;
  hashtagCount: number;
  mentionCount: number;
  isReply: boolean;
  /** 0-23, hora local del navegador. */
  hourOfDay: number;
  /** 0 = domingo … 6 = sábado, día local. */
  dayOfWeek: number;
}

/** URL con protocolo, o un t.co / pic.x.com sin él. */
const LINK_RE = /(https?:\/\/\S+)|(\b(?:t\.co|pic\.(?:x|twitter)\.com)\/\S+)/i;
/** Enlaces que X inserta al adjuntar media. */
const MEDIA_LINK_RE = /\bpic\.(?:x|twitter)\.com\/\S+/i;
/** Hashtag: almohadilla precedida de inicio o espacio, seguida de alfanuméricos. */
const HASHTAG_RE = /(?:^|\s)#[\p{L}\p{N}_]+/gu;
/** Mención: arroba precedida de inicio o espacio (descarta emails). */
const MENTION_RE = /(?:^|\s)@[A-Za-z0-9_]+/g;
/** El texto abre con una mención: heurística estándar de reply. */
const LEADING_MENTION_RE = /^\s*@[A-Za-z0-9_]+/;

export function extractFeatures(row: PostRow): PostFeatures {
  const text = row.text;

  return {
    hasLink: LINK_RE.test(text),
    // OJO: con un CSV nativo de Account Analytics esto es SIEMPRE false.
    // Verificado contra un export real: no existe columna de media (las 17
    // cabeceras no incluyen ninguna), y X ya no emite `pic.x.com` en el
    // texto — 391 `t.co` y cero `pic.x.com` en 457 posts.
    // Solo da true si enriqueces el CSV con una columna de media desde la
    // API. No se puede inferir de otra forma: se probó `urlClicks > 0` como
    // discriminador y no separa (un enlace que nadie clicó es idéntico a
    // una imagen).
    hasMedia:
      (row.mediaViews !== null && row.mediaViews > 0) ||
      MEDIA_LINK_RE.test(text),
    length: [...text].length,
    hashtagCount: (text.match(HASHTAG_RE) ?? []).length,
    mentionCount: (text.match(MENTION_RE) ?? []).length,
    isReply: LEADING_MENTION_RE.test(text),
    hourOfDay: row.date.getHours(),
    dayOfWeek: row.date.getDay(),
  };
}
