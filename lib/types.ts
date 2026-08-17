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
  /**
   * AUSENTE del struct ScoringWeights, que no es lo mismo que estar en él
   * con valor 0.0 (ese es el caso de profile_click). El CSV de Analytics lo
   * expone, así que se usa como proxy de share_via_copy_link (peso real 20,
   * inobservable) dentro del AlgoScore aproximado. No entra en el score real.
   */
  bookmarks: number | null;
  /**
   * Quote count: peso real 5.0 (param.rs:358). El CSV nativo de Analytics
   * no lo expone, pero la X API v2 sí (public_metrics.quote_count). Si
   * enriqueces el CSV a mano, esta columna activa el peso real `quote`.
   */
  quoteCount: number | null;

  /**
   * Columnas del CSV de Account Analytics que no aparecen en ScoringWeights
   * (ranking_scorer.rs:18-58) ni tienen parámetro de peso en param.rs.
   * Informativas, excluidas del score.
   */
  engagements: number | null;
  hashtagClicks: number | null;
  permalinkClicks: number | null;
}
