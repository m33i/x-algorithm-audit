/**
 * Transcripción literal de los pesos de ranking publicados por xAI.
 *
 * Fuente: github.com/xai-org/x-algorithm, commit 92f0918 (Apache 2.0),
 * sincronizado el 15 de octubre de 2026. La versión anterior (commit
 * c65aa17, agosto de 2026) está en el historial de este repo.
 * Fichero local de referencia: ../x-algorithm/home-mixer/params/param.rs
 *
 * MODIFICADO respecto del original: las constantes de Rust se reescriben
 * como constantes de TypeScript y los nombres pasan de snake_case a
 * camelCase.
 *
 * Este módulo no contiene lógica. Solo constantes y la fórmula de decay,
 * cada una con la referencia a su línea en el código fuente.
 */

export type PositiveAction =
  | "favorite"
  | "reply"
  | "retweet"
  | "quote"
  | "share"
  | "shareViaDm"
  | "shareViaCopyLink"
  | "followAuthor"
  | "click"
  | "openLink"
  | "photoExpand"
  | "videoOpen"
  | "dwell"
  | "quotedClick"
  | "postUnexplored";

export type NegativeAction =
  | "notInterested"
  | "blockAuthor"
  | "muteAuthor"
  | "report"
  | "notDwelled";

/**
 * Pesos positivos con valor distinto de cero.
 *
 * Excluidos por valer 0.0 en la configuración por defecto:
 *   profile_click        (param.rs:350)
 *   vqv                  (param.rs:355)
 *   quoted_vqv           (param.rs:378)
 *   react_with_video     (param.rs:396)
 *
 * Excluido por no existir en el struct ValueModelWeights
 * (xai-value-model/weights.rs:7-47):
 *   bookmark: aparece en engagement_signals.rs:9 y candidate.rs:58 como
 *   contador, pero no participa en la combinación de scores.
 */
export const POSITIVE_WEIGHTS = {
  favorite: 0.66, // param.rs:320
  reply: 5.0, // param.rs:321
  retweet: 1.0, // param.rs:334
  quote: 5.0, // param.rs:370
  share: 2.0, // param.rs:356
  shareViaDm: 5.0, // param.rs:358
  shareViaCopyLink: 20.0, // param.rs:364
  followAuthor: 4.0, // param.rs:384
  click: 0.3, // param.rs:347
  openLink: 0.2, // param.rs:348
  photoExpand: 0.05, // param.rs:336
  videoOpen: 0.02, // param.rs:342
  dwell: 0.05, // param.rs:369
  quotedClick: 0.05, // param.rs:372
  postUnexplored: 0.015, // param.rs:390 (solo in-network, xai-value-model/scoring.rs:85-90)
} as const satisfies Record<PositiveAction, number>;

export const NEGATIVE_WEIGHTS = {
  notInterested: -52.272, // param.rs:415
  blockAuthor: -31.2, // param.rs:421
  muteAuthor: -58.8, // param.rs:427
  report: -234.0, // param.rs:432
  notDwelled: -0.02, // param.rs:434
} as const satisfies Record<NegativeAction, number>;

/**
 * Pesos proxy. NO son pesos del algoritmo de X. No aparecen en
 * `home-mixer/params/param.rs` ni en `xai-value-model/weights.rs`.
 * Son sustitutos aproximados que esta herramienta usa para cubrir parte del
 * espacio de pesos positivos que el CSV de Analytics deja sin observar.
 *
 * Los proxies NO elevan la cobertura: estiman. La cobertura mide lo que se
 * observa del algoritmo, y un peso inventado no observa nada. Ver la nota de
 * `proxiedWeight` en scoring.ts.
 *
 * - bookmarks: no aparece en el struct `ValueModelWeights`
 *   (xai-value-model/weights.rs:7-47), así que no tiene peso. Distinto de
 *   `profile_click`, que sí está en el struct puesto a 0.0. El CSV lo expone
 *   y lo usamos como proxy de share_via_copy_link (20.0, inobservable).
 *
 *   El 6.0 es un juicio, no una medición: nadie ha medido qué fracción de
 *   share_via_copy_link captura un bookmark. Por debajo del 20.0 que
 *   sustituye, por encima de las acciones baratas (click 0.3).
 *
 * Los proxies se mantienen separados del score real (algoScore) y van en un
 * score aparte (approxScore). Las comparaciones estadísticas de cohortes
 * usan solo algoScore, nunca approxScore.
 */
export const PROXY_WEIGHTS = {
  bookmarks: 6.0,
} as const;

/** Boost aplicado a `reply` cuando el espectador y el autor se siguen mutuamente. param.rs:322-327 */
export const BIDIRECTIONAL_FOLLOW_REPLY_BOOST = 15.0;

/**
 * Peso continuo del dwell time. param.rs:401-406. Se suma al score
 * (xai-value-model/scoring.rs:112) pero queda fuera de positive_sum
 * (xai-value-model/weights.rs:50-70). Lo mismo vale para
 * cont_click_dwell_time (0.4, param.rs:407-412), que esta herramienta no
 * declara porque el CSV no expone el tiempo tras el clic.
 */
export const CONT_DWELL_TIME_WEIGHT = 0.006;

/**
 * Suma de los pesos positivos, replicando el cálculo de `positive_sum`
 * en xai-value-model/weights.rs:50-70: incluye post_unexplored y los pesos a
 * cero (que no alteran la suma), y excluye los continuos cont_dwell_time y
 * cont_click_dwell_time.
 *
 * Valor: 43.345
 */
export const POSITIVE_SUM: number = Object.values(POSITIVE_WEIGHTS).reduce(
  (acc, w) => acc + w,
  0,
);

/** vm-ranker/params.rs:175-180 */
export const AUTHOR_DIVERSITY_DECAY = 0.5;
/** vm-ranker/params.rs:181-186 */
export const AUTHOR_DIVERSITY_FLOOR = 0.25;
/** vm-ranker/params.rs:211-216 */
export const OON_WEIGHT_FACTOR = 0.75;
/** vm-ranker/params.rs:205-210 */
export const TOPIC_OON_WEIGHT_FACTOR = 0.5;

/**
 * Multiplicador de diversidad por autor para el k-ésimo post del mismo
 * autor dentro de un slate.
 *
 * xai-value-model/scoring.rs:183-185
 *   (1.0 - floor) * decay_factor.powf(exponent) + floor
 */
export function diversityMultiplier(k: number): number {
  return (
    (1 - AUTHOR_DIVERSITY_FLOOR) * Math.pow(AUTHOR_DIVERSITY_DECAY, k) +
    AUTHOR_DIVERSITY_FLOOR
  );
}
