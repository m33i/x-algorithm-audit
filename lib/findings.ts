import {
  scoreAll,
  compareBinary,
  compareGroups,
  linkCohort,
  MIN_GROUP_SIZE,
  type CohortComparison,
  type ScoredPost,
} from "./cohorts";
import { median, quantile } from "./stats";
import { datasetCoverage, datasetProxiedWeight } from "./scoring";
import { diversityMultiplier, POSITIVE_WEIGHTS } from "./weights";
import type { PostRow } from "./types";

/**
 * El único módulo donde vive la interpretación. `cohorts.ts` produce
 * estadística sin opinión; aquí se convierte en opinión sin recalcular nada.
 */

export type Severity = "alta" | "media" | "baja";

export interface Finding {
  id: string;
  title: string;
  severity: Severity;
  /** Los números crudos, con su n. */
  evidence: string;
  /** Qué dice el código de X y por qué esto ocurre. */
  explanation: string;
  /** Qué hacer al respecto. */
  action: string;
  /** fichero:línea del repo de xai-org/x-algorithm que respalda la explicación. */
  codeRef: string;
}

export interface AnalysisReport {
  postCount: number;
  /** Los posts puntuados, para la tabla y para la muestra del diagnóstico. */
  posts: ScoredPost[];
  medianAlgoScore: number;
  /** Cobertura real: pesos del algoritmo observables desde el CSV / positive_sum. */
  coverage: number;
  /**
   * Peso REAL del algoritmo que los proxies intentan estimar (20.0 de
   * share_via_copy_link si hay bookmarks). No es una cobertura ni se suma
   * a `coverage`: son magnitudes distintas.
   */
  proxiedWeight: number;
  cohorts: CohortComparison[];
  findings: Finding[];
  burstPenalty: { burstCount: number; estimatedLoss: number };
  /**
   * El export nativo trae `Date` sin hora, así que todo cae a medianoche.
   * Cuando es false se suprimen el hallazgo de ráfagas, la cohorte horaria y
   * el eje de horas del heatmap.
   */
  hasTimeOfDay: boolean;
  /**
   * Ids que señala `wasted-reach`, o vacío si no se emitió. Se expone para
   * que la UI no reimplemente el criterio sin sus guardas.
   */
  wastedPostIds: string[];
}

const SEVERITY_ORDER: Record<Severity, number> = { alta: 0, media: 1, baja: 2 };

/** Ventana dentro de la que dos posts compiten por el mismo slate. */
const BURST_WINDOW_MS = 60 * 60 * 1000;

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function ratio(a: number, b: number): string {
  if (b === 0) return "∞";
  return `${(a / b).toFixed(2)}x`;
}

/**
 * Detecta ráfagas y estima el multiplicador de diversidad perdido.
 *
 * El decay se aplica sobre el slate del feed, no sobre el histórico, así
 * que esto es una **estimación** del coste de publicar seguido, no una
 * medición de lo que realmente pasó.
 */
function analyzeBursts(posts: ScoredPost[]): {
  burstCount: number;
  estimatedLoss: number;
} {
  const sorted = [...posts].sort(
    (a, b) => a.row.date.getTime() - b.row.date.getTime(),
  );

  let burstCount = 0;
  let estimatedLoss = 0;
  let k = 0;

  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].row.date.getTime() - sorted[i - 1].row.date.getTime();
    if (gap <= BURST_WINDOW_MS) {
      k++;
      burstCount++;
      estimatedLoss += 1 - diversityMultiplier(k);
    } else {
      k = 0;
    }
  }

  return { burstCount, estimatedLoss };
}

/**
 * Cohorte por longitud. Los cuartiles se calculan una sola vez y se
 * cierran sobre el callback: calcularlos dentro haría el agrupamiento
 * O(n² log n).
 */
function lengthCohort(posts: ScoredPost[]): CohortComparison {
  const lengths = posts.map((p) => p.features.length);
  const q1 = quantile(lengths, 0.25);
  const q3 = quantile(lengths, 0.75);
  return compareGroups(posts, "longitud", (p) => {
    if (p.features.length <= q1) return "cortos";
    if (p.features.length >= q3) return "largos";
    return "medios";
  });
}

export function analyze(rows: PostRow[]): AnalysisReport {
  if (rows.length === 0) {
    throw new Error("analyze: no hay posts que analizar");
  }

  const posts = scoreAll(rows);
  const scores = posts.map((p) => p.algoScore);
  const medianAlgoScore = median(scores);
  const coverage = datasetCoverage(rows);
  const proxiedWeight = datasetProxiedWeight(rows);

  // ¿El CSV trae hora del día, o solo fecha? Si todos los posts caen en el
  // mismo minuto del día, no hay información horaria: el export nativo de
  // Account Analytics trae `Date` sin hora y todo se parsea a medianoche.
  const minutesOfDay = new Set(
    rows.map((r) => r.date.getHours() * 60 + r.date.getMinutes()),
  );
  const hasTimeOfDay = minutesOfDay.size > 1;

  const cohorts: CohortComparison[] = [
    linkCohort(posts),
    compareBinary(posts, "media", ["con media", "sin media"], (p) => p.features.hasMedia),
    compareBinary(posts, "reply", ["replies", "originales"], (p) => p.features.isReply),
    compareBinary(posts, "hashtag", ["con hashtag", "sin hashtag"], (p) => p.features.hashtagCount > 0),
    // La cohorte horaria solo tiene sentido si el CSV trae hora.
    ...(hasTimeOfDay
      ? [
          compareGroups(posts, "hora", (p) => {
            const h = p.features.hourOfDay;
            if (h < 6) return "madrugada (0-5)";
            if (h < 12) return "mañana (6-11)";
            if (h < 18) return "tarde (12-17)";
            return "noche (18-23)";
          }),
        ]
      : []),
    compareGroups(posts, "dia", (p) =>
      ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"][
        p.features.dayOfWeek
      ],
    ),
    lengthCohort(posts),
  ];

  const burstPenalty = analyzeBursts(posts);
  const findings: Finding[] = [];

  // `groups` viene ordenado por mediana, no por etiqueta: hay que mirar cuál
  // de los dos es el de enlaces antes de narrar la dirección.
  const link = cohorts.find((c) => c.id === "link");
  if (link && link.significant && link.groups.length === 2) {
    const [lower, higher] = link.groups;
    const linkGroup =
      lower.label === "con enlace acortado" ? lower : higher;
    const plainGroup = linkGroup === lower ? higher : lower;
    const linkIsWorse = linkGroup === lower;

    const confound =
      `X acorta a t.co tanto los enlaces externos como los adjuntos de media, y el CSV de ` +
      `Analytics no trae columna de media, así que no se pueden separar: el grupo "con enlace ` +
      `acortado" mezcla ambos. Lo que compara este hallazgo es "posts con algo adjunto" frente ` +
      `a "posts de solo texto".`;

    findings.push({
      id: "link-tax",
      title: linkIsWorse
        ? "Tus posts con enlace acortado rinden peor que los de solo texto"
        : "Tus posts con enlace acortado rinden mejor que los de solo texto",
      severity: linkIsWorse ? "alta" : "media",
      evidence:
        `con enlace acortado: mediana de AlgoScore ${linkGroup.medianScore.toFixed(4)} ` +
        `(${linkGroup.medianImpressions.toFixed(0)} impresiones, n=${linkGroup.n}). ` +
        `solo texto: ${plainGroup.medianScore.toFixed(4)} ` +
        `(${plainGroup.medianImpressions.toFixed(0)} impresiones, n=${plainGroup.n}). ` +
        `Diferencia de ${ratio(higher.medianScore, lower.medianScore)} a favor de ` +
        `"${higher.label}", p=${link.pScore!.toFixed(4)}.`,
      explanation: linkIsWorse
        ? `${confound} ` +
          `El mecanismo apunta igual en los dos casos: no hay penalización explícita a URLs en ` +
          `el código de X, pero un adjunto canaliza la atención hacia acciones baratas ` +
          `(open_link pesa ${POSITIVE_WEIGHTS.openLink} y photo_expand ` +
          `${POSITIVE_WEIGHTS.photoExpand}) en vez de hacia reply (${POSITIVE_WEIGHTS.reply}) ` +
          `o share_via_copy_link (${POSITIVE_WEIGHTS.shareViaCopyLink}).`
        : `${confound} ` +
          `En tu cuenta el patrón va en dirección contraria al consejo habitual: los posts con ` +
          `algo adjunto puntúan mejor. No hay ninguna penalización a URLs en el código de X que ` +
          `explique lo contrario, así que no hay nada que corregir aquí. Cuidado con el consejo ` +
          `genérico de "no pongas enlaces": no aplica a estos datos.`,
      action: linkIsWorse
        ? "Prueba a poner el contenido en el propio post y dejar el enlace para una reply. Si " +
          "quieres separar el efecto del enlace del de la imagen, enriquece el CSV con una " +
          "columna de media desde la X API: sin ella los dos van juntos."
        : "No cambies nada por este hallazgo. Si quieres saber si el mérito es del enlace o de " +
          "la imagen, enriquece el CSV con una columna de media desde la X API: sin ella los " +
          "dos van juntos y no se pueden atribuir por separado.",
      codeRef: "home-mixer/params/param.rs:348",
    });
  }

  // 2. Cultivo de likes en vez de replies
  const totalLikes = posts.reduce((a, p) => a + (p.row.likes ?? 0), 0);
  const totalReplies = posts.reduce((a, p) => a + (p.row.replies ?? 0), 0);
  const hasReplyData = posts.some((p) => p.row.replies !== null);
  if (
    posts.length >= MIN_GROUP_SIZE &&
    hasReplyData &&
    totalLikes > 0 &&
    totalReplies / totalLikes < 0.05
  ) {
    findings.push({
      id: "likes-over-replies",
      title: "Estás cultivando likes en vez de replies",
      severity: "alta",
      evidence:
        `${totalReplies} replies frente a ${totalLikes} likes en ${posts.length} posts ` +
        `(${pct(totalReplies / totalLikes)} de ratio).`,
      explanation:
        `Un like pesa ${POSITIVE_WEIGHTS.favorite} y una reply ${POSITIVE_WEIGHTS.reply}: ` +
        `un factor de unos 7.6. Si la reply viene de alguien que te sigue mutuamente, el boost ` +
        `bidireccional la lleva a 20.0, un factor de unos 30. Es el multiplicador más grande ` +
        `que puedes mover con el contenido.`,
      action:
        "Termina los posts con una pregunta concreta y respondible, toma posiciones discutibles " +
        "en vez de consensos, y responde tú a las replies para alimentar el hilo.",
      codeRef: "home-mixer/params/param.rs:320-327",
    });
  }

  // Requiere hora del día: sin ella, los posts del mismo día tienen marca de
  // tiempo idéntica y todos parecerían publicados a la vez.
  const burstShare =
    posts.length > 0 ? burstPenalty.burstCount / posts.length : 0;
  if (
    hasTimeOfDay &&
    posts.length >= MIN_GROUP_SIZE &&
    burstPenalty.burstCount > 0
  ) {
    findings.push({
      id: "burst-cannibalization",
      title: "Publicas en ráfaga y te canibalizas el alcance",
      // Relativa al volumen: `estimatedLoss` crece con el número de posts.
      severity: burstShare > 0.25 ? "alta" : "media",
      evidence:
        `${burstPenalty.burstCount} de ${posts.length} posts (${pct(burstShare)}) se ` +
        `publicaron a menos de una hora del anterior. Suma de multiplicador perdido: ` +
        `${burstPenalty.estimatedLoss.toFixed(2)}, equivalente a ceder el alcance de unos ` +
        `${burstPenalty.estimatedLoss.toFixed(1)} posts.`,
      explanation:
        `El multiplicador del k-ésimo post del mismo autor en un slate es ` +
        `(1 - 0.25) × 0.5^k + 0.25: el segundo post vale un 62.5%, el tercero un 43.75%, ` +
        `y el suelo está en el 25%. Es una estimación: el decay se aplica sobre el slate del ` +
        `feed, no sobre tu histórico.`,
      action: "Espacia los posts al menos una hora. Si tienes varias ideas, hazlas hilo, no ráfaga.",
      codeRef: "xai-value-model/scoring.rs:183-185",
    });
  }

  // 4. Señales de peso cero o inobservables
  const totalProfileVisits = posts.reduce((a, p) => a + (p.row.profileVisits ?? 0), 0);
  const totalBookmarks = posts.reduce((a, p) => a + (p.row.bookmarks ?? 0), 0);
  // profile_click vale 0.0 real y no tiene proxy. bookmarks también vale 0.0
  // real, pero se usa como proxy de share_via_copy_link en approxScore. Aquí
  // reportamos profile_click como señal sin peso ni proxy, y bookmarks como
  // proxy informativo.
  const zeroWeightTotal = totalProfileVisits;
  const scoringTotal = totalLikes + totalReplies;
  if (
    posts.length >= MIN_GROUP_SIZE &&
    zeroWeightTotal > 0 &&
    scoringTotal > 0 &&
    zeroWeightTotal > scoringTotal
  ) {
    findings.push({
      id: "zero-weight-signals",
      title: "Tu señal más frecuente no puntúa en el ranking",
      severity: "media",
      evidence:
        `${totalProfileVisits} visitas al perfil, frente a ` +
        `${totalLikes} likes y ${totalReplies} replies ` +
        `(${totalBookmarks} bookmarks adicionales, usados como proxy de share_via_copy_link).`,
      explanation:
        `profile_click vale 0.0 en la configuración por defecto del algoritmo ` +
        `(param.rs:350). bookmarks tampoco aparece en ValueModelWeights (peso real ` +
        `0.0), pero el CSV lo expone y esta herramienta lo usa como proxy ` +
        `aproximado de share_via_copy_link (peso real 20.0) en el AlgoScore+. ` +
        `Las visitas al perfil no sustituyen ninguna señal ponderada: peso real ` +
        `0.0 y sin proxy.`,
      action:
        "Mide las visitas al perfil como salud de marca, no como objetivo de " +
        "distribución. Los bookmarks sí importan como proxy, pero el algoritmo " +
        "no las pondera directamente.",
      codeRef: "home-mixer/params/param.rs:350 y xai-value-model/weights.rs:7-47",
    });
  }

  // 5. Alcance desperdiciado
  let wastedPostIds: string[] = [];
  if (posts.length >= MIN_GROUP_SIZE) {
    const impressionsP90 = quantile(posts.map((p) => p.row.impressions), 0.9);
    const scoreP25 = quantile(scores, 0.25);
    const medianImpressions = median(posts.map((p) => p.row.impressions));
    // "Decil alto de impresiones" solo significa algo si hay dispersión real.
    // Con impresiones idénticas, p90 == mediana y la condición se cumple para
    // todos. El factor 2 es un juicio: un post necesita al menos el doble del
    // alcance típico para que "el sistema le dio distribución" sea justo.
    const hasSpread = impressionsP90 >= 2 * medianImpressions;
    const wasted = posts.filter(
      (p) => p.row.impressions >= impressionsP90 && p.algoScore <= scoreP25,
    );
    if (hasSpread && wasted.length >= 2) {
      wastedPostIds = wasted.map((p) => p.row.id);
      findings.push({
        id: "wasted-reach",
        title: "Posts que se comieron alcance sin convertirlo",
        severity: "media",
        evidence:
          `${wasted.length} posts en el decil alto de impresiones (≥${impressionsP90.toFixed(0)}) ` +
          `y en el cuartil bajo de AlgoScore (≤${scoreP25.toFixed(4)}).`,
        explanation:
          "El sistema les dio distribución y no la convirtieron. Un post así infla las métricas " +
          "de vanidad mientras el ranker aprende que tu contenido no engancha a quien lo ve.",
        action:
          "Míralos uno a uno: suelen ser posts que se viralizaron por el titular y decepcionaron " +
          "al leerse. Ese patrón es el que baja tu score medio.",
        codeRef: "home-mixer/params/param.rs:295-301",
      });
    }
  }

  // 6-8. Hallazgos derivados de cohortes categóricas significativas
  const cohortTitles: Record<string, { title: string; action: string }> = {
    media: {
      title: "La media cambia tu rendimiento",
      action: "Ajusta el uso de imagen y vídeo hacia la cohorte que rinde mejor.",
    },
    reply: {
      title: "Replies y posts originales rinden distinto",
      action: "Reequilibra el reparto de tu volumen entre ambos formatos.",
    },
    hashtag: {
      title: "Los hashtags cambian tu rendimiento",
      action: "Ajusta el uso de hashtags hacia la cohorte que rinde mejor.",
    },
    hora: { title: "Tu franja horaria importa", action: "Concentra tus publicaciones en la mejor franja." },
    dia: { title: "Tu día de la semana importa", action: "Concentra tus publicaciones en los mejores días." },
    longitud: { title: "La longitud del post importa", action: "Ajusta la longitud hacia la cohorte que rinde mejor." },
  };

  for (const c of cohorts) {
    if (c.id === "link") continue; // ya cubierto arriba con su explicación propia
    if (!c.significant || c.groups.length < 2) continue;
    const meta = cohortTitles[c.id];
    if (!meta) continue;

    const worst = c.groups[0];
    const best = c.groups[c.groups.length - 1];
    findings.push({
      id: `cohort-${c.id}`,
      title: meta.title,
      severity: "baja",
      evidence:
        `Mejor: ${best.label}, mediana ${best.medianScore.toFixed(4)} (n=${best.n}). ` +
        `Peor: ${worst.label}, mediana ${worst.medianScore.toFixed(4)} (n=${worst.n}). ` +
        `Diferencia de ${ratio(best.medianScore, worst.medianScore)}, p=${c.pScore!.toFixed(4)}.`,
      explanation:
        "Comparación de medianas con test U de Mann-Whitney sobre tus propios posts. " +
        "Es un patrón empírico de tu cuenta, no una regla del algoritmo.",
      action: meta.action,
      codeRef: "home-mixer/params/param.rs:295-301",
    });
  }

  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  return {
    postCount: posts.length,
    posts,
    medianAlgoScore,
    coverage,
    proxiedWeight,
    cohorts,
    findings,
    burstPenalty,
    hasTimeOfDay,
    wastedPostIds,
  };
}
