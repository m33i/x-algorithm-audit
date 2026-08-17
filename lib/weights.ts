/**
 * Transcripción literal de los pesos de ranking publicados por xAI.
 *
 * Fuente: github.com/xai-org/x-algorithm, commit c65aa17 (Apache 2.0).
 * Fichero local de referencia: ../x-algorithm/home-mixer/params/param.rs
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
  | "vqv"
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
 *   profile_click        (param.rs:337)
 *   dwell                (param.rs:357)
 *   quoted_vqv           (param.rs:365)
 *   cont_click_dwell_time(param.rs:407)
 *
 * Excluido por no existir en el struct ScoringWeights (ranking_scorer.rs:18-58):
 *   bookmark: aparece en engagement_signals.rs:9 y candidate.rs:58 como
 *   contador, pero no participa en la combinación de scores.
 */
export const POSITIVE_WEIGHTS = {
  favorite: 0.5, // param.rs:308
  reply: 5.0, // param.rs:309
  retweet: 1.0, // param.rs:322
  quote: 5.0, // param.rs:358
  share: 2.0, // param.rs:344
  shareViaDm: 5.0, // param.rs:345
  shareViaCopyLink: 20.0, // param.rs:351
  followAuthor: 4.0, // param.rs:371
  click: 0.4, // param.rs:335
  openLink: 0.2, // param.rs:336
  photoExpand: 0.05, // param.rs:323
  videoOpen: 0.05, // param.rs:329
  vqv: 0.05, // param.rs:343
  quotedClick: 0.05, // param.rs:359
  postUnexplored: 0.02, // param.rs:377 (solo in-network, param.rs:395)
} as const satisfies Record<PositiveAction, number>;

export const NEGATIVE_WEIGHTS = {
  notInterested: -43.2, // param.rs:450
  blockAuthor: -31.2, // param.rs:456
  muteAuthor: -58.8, // param.rs:462
  report: -234.0, // param.rs:468
  notDwelled: -0.02, // param.rs:469
} as const satisfies Record<NegativeAction, number>;

/**
 * Pesos proxy. NO son pesos del algoritmo de X. No aparecen en
 * `home-mixer/params/param.rs` ni en `home-mixer/scorers/ranking_scorer.rs`.
 * Son sustitutos aproximados que esta herramienta usa para cubrir parte del
 * espacio de pesos positivos que el CSV de Analytics deja sin observar.
 *
 * El CSV nativo expone ~30% del positive_sum (OBSERVABLE_MAX = 13.15 de
 * 43.32). Los proxies elevan la cobertura efectiva al añadir señales que el
 * algoritmo pondera pero que el CSV no desglosa.
 *
 * - bookmarks: NO aparece en el struct `ScoringWeights`
 *   (ranking_scorer.rs:18-58), así que no tiene peso en el algoritmo. Ojo a
 *   la diferencia: `profile_click` sí está en el struct, puesto a 0.0; el
 *   bookmark simplemente no está. El CSV de Analytics sí lo expone, y lo
 *   usamos como proxy de share_via_copy_link (peso real 20.0, inobservable),
 *   porque guardar un post para leerlo o compartirlo después es una
 *   intención cercana a copiar el enlace.
 *
 *   El 6.0 es un JUICIO, no una medición ni una constante derivada de
 *   ninguna fuente. Nadie ha medido qué fracción de share_via_copy_link
 *   captura un bookmark. Se eligió por debajo del 20.0 que sustituye para
 *   no sobreponderar una hipótesis, y por encima de los pesos de acciones
 *   baratas (click 0.4) para reflejar que guardar señala intención alta.
 *   Cualquiera puede discutirlo; lo que no se puede es presentarlo como
 *   un dato del algoritmo.
 *
 * Los proxies se mantienen separados del score real (algoScore) y van en un
 * score aparte (approxScore). Las comparaciones estadísticas de cohortes
 * usan solo algoScore, nunca approxScore.
 */
export const PROXY_WEIGHTS = {
  bookmarks: 6.0,
} as const;

/** Suma de los pesos proxy, para calcular la cobertura efectiva. */
export const PROXY_SUM: number = Object.values(PROXY_WEIGHTS).reduce(
  (acc, w) => acc + w,
  0,
);
/** Boost aplicado a `reply` cuando el espectador y el autor se siguen mutuamente. param.rs:310 */
export const BIDIRECTIONAL_FOLLOW_REPLY_BOOST = 15.0;

/** Peso continuo del dwell time. param.rs:401. Fuera de positive_sum en ranking_scorer.rs:105-125. */
export const CONT_DWELL_TIME_WEIGHT = 0.004;

/**
 * Suma de los pesos positivos, replicando el cálculo de `positive_sum`
 * en ranking_scorer.rs:105-125: incluye post_unexplored y los pesos a cero
 * (que no alteran la suma), y excluye cont_dwell_time.
 *
 * Valor: 43.32
 */
export const POSITIVE_SUM: number = Object.values(POSITIVE_WEIGHTS).reduce(
  (acc, w) => acc + w,
  0,
);

/** param.rs:228 */
export const AUTHOR_DIVERSITY_DECAY = 0.5;
/** param.rs:234 */
export const AUTHOR_DIVERSITY_FLOOR = 0.25;
/** param.rs:246 */
export const OON_WEIGHT_FACTOR = 0.75;
/** param.rs:266 */
export const TOPIC_OON_WEIGHT_FACTOR = 0.5;

/**
 * Multiplicador de diversidad por autor para el k-ésimo post del mismo
 * autor dentro de un slate.
 *
 * ranking_scorer.rs:643-645
 *   (1.0 - floor) * decay_factor.powf(exponent) + floor
 */
export function diversityMultiplier(k: number): number {
  return (
    (1 - AUTHOR_DIVERSITY_FLOOR) * Math.pow(AUTHOR_DIVERSITY_DECAY, k) +
    AUTHOR_DIVERSITY_FLOOR
  );
}
