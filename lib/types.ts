/** Una fila normalizada del CSV de X Account Analytics. */
export interface PostRow {
  id: string;
  date: Date;
  text: string;
  /** Siempre > 0. Las filas con 0 o sin impresiones se descartan al parsear. */
  impressions: number;

  likes: number | null;
  replies: number | null;
  reposts: number | null;
  shares: number | null;
  newFollows: number | null;
  detailExpands: number | null;
  urlClicks: number | null;
  mediaViews: number | null;

  /** Peso 0.0 en el ranking (param.rs:337). Informativo, excluido del score. */
  profileVisits: number | null;
  /** Sin peso en ScoringWeights. Informativo, excluido del score. */
  bookmarks: number | null;

  /**
   * Columnas del CSV de Account Analytics que no aparecen en ScoringWeights
   * (ranking_scorer.rs:18-58) ni tienen parámetro de peso en param.rs.
   * Informativas, excluidas del score.
   */
  engagements: number | null;
  hashtagClicks: number | null;
  permalinkClicks: number | null;
}
