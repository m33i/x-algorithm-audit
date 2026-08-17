"use client";

import { useMemo } from "react";
import { median, quantile } from "@/lib/stats";
import type { AnalysisReport } from "@/lib/findings";
import type { CohortComparison } from "@/lib/cohorts";

/**
 * Tres gráficos, y solo tres. Cada uno responde una pregunta que el usuario se
 * hace de verdad:
 *
 *   1. ¿Rindo parejo o vivo de dos posts? -> histograma
 *   2. ¿Qué posts vio mucha gente sin que pasara nada? -> scatter
 *   3. ¿Qué formato me funciona? -> cohortes
 *
 * El heatmap hora x día se retiró a propósito: con el export nativo nunca se
 * llegaba a pintar (`Date` viene sin hora), con CSV enriquecido son 168 celdas
 * que exigen cientos de posts para no salir vacías, y respondía lo mismo que
 * las cohortes `hora` y `dia`, que sí llevan test estadístico. Enseñar la
 * versión sin test de un resultado ya contrastado solo invita a leer ruido.
 */

/** Etiqueta natural + qué se está comparando, por id interno de cohorte. */
const COHORT_COPY: Record<string, { title: string; hint: string }> = {
  link: {
    title: "Posts con algo adjunto vs. posts de solo texto",
    hint: "X acorta a t.co tanto los enlaces como las imágenes, así que los dos caen en el mismo grupo: esto compara «lleva algo pegado» contra «solo texto».",
  },
  media: {
    title: "Con media vs. sin media",
    hint: "Casi nunca sale: el CSV no trae columna de media y no se puede detectar de forma fiable.",
  },
  reply: {
    title: "Tus respuestas vs. tus posts originales",
    hint: "Compara lo que publicas contestando a otros con lo que publicas de cero.",
  },
  hashtag: {
    title: "Con hashtag vs. sin hashtag",
    hint: "Compara los posts que llevan al menos una almohadilla con los que no llevan ninguna.",
  },
  hora: {
    title: "Franja horaria",
    hint: "Madrugada, mañana, tarde y noche en la hora local de tu navegador.",
  },
  dia: {
    title: "Día de la semana",
    hint: "Compara el día de publicación de cada post.",
  },
  longitud: {
    title: "Longitud del post",
    hint: "Cuartiles de longitud calculados sobre tus propios posts, no umbrales fijos.",
  },
};

/** Redondea un múltiplo a algo legible: 2,4× en vez de 2,3871×. */
function times(a: number, b: number): string | null {
  if (b <= 0 || a <= 0) return null;
  const r = a / b;
  if (!Number.isFinite(r)) return null;
  return `${r.toFixed(1).replace(".", ",")}×`;
}

/**
 * Traduce un p-valor a la frase que de verdad significa, sin el atajo
 * incorrecto de «hay un 3% de probabilidad de que sea casualidad».
 */
function pInWords(p: number): string {
  const pct = p * 100;
  const shown = pct < 0.1 ? "menos del 0,1%" : `el ${pct.toFixed(1).replace(".", ",")}%`;
  return `Si en realidad no hubiera ninguna diferencia entre los grupos, una separación así o mayor saldría por azar ${shown} de las veces.`;
}

/** Cabecera común: titular en lenguaje normal, nota técnica debajo en gris. */
function CardHeader({
  question,
  reading,
  method,
}: {
  question: string;
  reading: string;
  method: string;
}) {
  return (
    <>
      <h2 className="font-semibold">{question}</h2>
      <p className="mt-1.5 text-sm text-neutral-600 dark:text-neutral-400">{reading}</p>
      <p className="mt-1.5 text-xs text-neutral-500">{method}</p>
    </>
  );
}

const CARD = "rounded-lg border border-neutral-200 p-5 dark:border-neutral-800";

export function Visualizations({ report }: { report: AnalysisReport }) {
  const posts = report.posts;

  // --- Histograma de AlgoScore: consistencia y concentración ---
  const hist = useMemo(() => {
    const scores = posts.map((p) => p.algoScore);
    if (scores.length === 0) return null;
    const min = 0;
    // Si todos los scores son 0, `max` sería 0 y binSize 0 -> índices NaN y
    // una línea de mediana en `left: NaN%`. Se fuerza un rango mínimo.
    const max = Math.max(...scores) * 1.05 || 1;
    const bins = 20;
    const binSize = (max - min) / bins;
    const counts = new Array(bins).fill(0);
    for (const s of scores) {
      const idx = Math.min(bins - 1, Math.floor((s - min) / binSize));
      counts[idx]++;
    }
    const med = median(scores);
    const p90 = quantile(scores, 0.9);
    return {
      counts,
      maxCount: Math.max(...counts),
      min,
      max,
      binSize,
      med,
      p90,
      // Cuánto separa a tu mejor décimo de tu post normal. Alto = vives de
      // unos pocos aciertos; bajo = rindes parejo.
      spread: times(p90, med),
    };
  }, [posts]);

  // --- Scatter impresiones vs AlgoScore ---
  const wastedIds = useMemo(
    () => new Set(report.wastedPostIds),
    [report.wastedPostIds],
  );

  const scatter = useMemo(() => {
    if (posts.length < 2) return null;
    const imps = posts.map((p) => p.row.impressions);
    const scores = posts.map((p) => p.algoScore);
    const logMin = Math.log10(Math.max(1, Math.min(...imps)));
    // Con impresiones idénticas logMin === logMax y toda división por su
    // diferencia da NaN: cada punto acabaría en `left: NaN%`.
    const rawLogMax = Math.log10(Math.max(...imps));
    const logMax = rawLogMax > logMin ? rawLogMax : logMin + 1;
    const scoreMin = 0;
    const scoreMax = Math.max(...scores) * 1.1 || 1;
    const p90Imp = quantile(imps, 0.9);
    const p25Score = quantile(scores, 0.25);

    const points = posts.map((p) => {
      const x = ((Math.log10(p.row.impressions) - logMin) / (logMax - logMin)) * 100;
      const y = 100 - ((p.algoScore - scoreMin) / (scoreMax - scoreMin)) * 100;
      // Se consume el conjunto que decidió `findings.ts`, con sus guardas.
      const wasted = wastedIds.has(p.row.id);
      return { x, y, wasted, id: p.row.id, imp: p.row.impressions, score: p.algoScore };
    });

    const p90X = ((Math.log10(p90Imp) - logMin) / (logMax - logMin)) * 100;
    const p25Y = 100 - ((p25Score - scoreMin) / (scoreMax - scoreMin)) * 100;

    return { points, p90X, p25Y, logMin, logMax, p90Imp, p25Score };
  }, [posts, wastedIds]);

  const wastedCount = report.wastedPostIds.length;

  // --- Cohortes significativas ---
  const sigCohorts = report.cohorts.filter(
    (c) => c.significant && c.groups.length >= 2,
  );

  return (
    <div className="space-y-8">
      {/* Histograma + Scatter */}
      <div className="grid gap-4 lg:grid-cols-2">
        {hist && (
          <div className={`${CARD} flex flex-col`}>
            <CardHeader
              question="¿Vives de unos pocos posts?"
              reading={
                hist.spread
                  ? `Tu mejor 10% de posts puntúa ${hist.spread} lo que puntúa tu post mediano. Cuanto más se estire esa cola a la derecha, más depende tu cuenta de aciertos sueltos en vez de un método repetible.`
                  : "Cada barra es un tramo de puntuación, y su altura es cuántos posts caen ahí."
              }
              method={`${posts.length} posts. Línea roja: la mediana (${hist.med.toFixed(4)}), la mitad de tus posts queda a cada lado. Línea verde: el percentil 90 (${hist.p90.toFixed(4)}), donde empieza tu mejor décimo.`}
            />
            {/* Barras contiguas: convención del histograma, y hace que la
                línea de mediana caiga exacta sobre su bin. */}
            {/* flex-1 para que el gráfico coma el alto sobrante y las dos
                tarjetas de la fila terminen a la misma altura. */}
            <div className="relative mt-6 flex min-h-40 flex-1 items-end">
              {hist.counts.map((c, i) => (
                <div
                  key={i}
                  className="flex-1 border-r border-white bg-neutral-400 last:border-r-0 dark:border-neutral-950 dark:bg-neutral-600"
                  style={{ height: `${(c / hist.maxCount) * 100}%` }}
                  title={`Puntuación entre ${(hist.min + i * hist.binSize).toFixed(4)} y ${(hist.min + (i + 1) * hist.binSize).toFixed(4)} · ${c} post${c === 1 ? "" : "s"}`}
                />
              ))}
              <div
                className="absolute top-0 h-full w-px bg-emerald-500"
                style={{ left: `${(hist.p90 / hist.max) * 100}%` }}
              >
                <span className="absolute -top-5 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                  top 10%
                </span>
              </div>
              <div
                className="absolute top-0 h-full w-px bg-rose-500"
                style={{ left: `${(hist.med / hist.max) * 100}%` }}
              >
                <span className="absolute -top-5 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium text-rose-500">
                  mediana
                </span>
              </div>
            </div>
            <div className="mt-1.5 flex justify-between text-[10px] text-neutral-400">
              <span>← tus posts que menos puntúan</span>
              <span>los que más →</span>
            </div>
          </div>
        )}

        {scatter && (
          <div className={`${CARD} flex flex-col`}>
            <CardHeader
              question="¿Alcance desaprovechado?"
              reading={
                wastedCount > 0
                  ? `Los ${wastedCount} puntos rojos de la esquina inferior derecha son tus posts caros: llegaron a mucha gente y casi nadie hizo nada que el algoritmo pague. Es el peor sitio donde estar, porque el ranker aprende de esa conversión.`
                  : "Cada punto es un post. Cuanto más a la derecha, más gente lo vio; cuanto más arriba, más acciones de peso generó por cada impresión. Ahora mismo no hay posts marcados como alcance desperdiciado."
              }
              method={`Eje X: impresiones en escala logarítmica (cada tramo igual multiplica por diez). Eje Y: AlgoScore. Se marca en rojo lo que cae a la vez por encima del percentil 90 de impresiones (${Math.round(scatter.p90Imp).toLocaleString("es")}) y por debajo del percentil 25 de score (${scatter.p25Score.toFixed(4)}).`}
            />
            <div className="relative mt-6 min-h-56 flex-1 border-b border-l border-neutral-200 dark:border-neutral-700">
              {/* Zona wasted reach */}
              {scatter.p90X < 100 && scatter.p25Y < 100 && (
                <>
                  <div
                    className="absolute rounded-sm bg-rose-500/5"
                    style={{
                      left: `${scatter.p90X}%`,
                      top: `${scatter.p25Y}%`,
                      right: 0,
                      bottom: 0,
                    }}
                  />
                  <span
                    className="pointer-events-none absolute right-1 bottom-1 max-w-[45%] text-right text-[10px] leading-tight text-rose-500/70"
                    aria-hidden="true"
                  >
                    mucho alcance,
                    <br />
                    poca acción
                  </span>
                </>
              )}
              {/* Línea P90 impresiones */}
              {scatter.p90X > 0 && scatter.p90X < 100 && (
                <div
                  className="absolute top-0 h-full w-px bg-neutral-300 dark:bg-neutral-700"
                  style={{ left: `${scatter.p90X}%` }}
                />
              )}
              {/* Línea P25 score */}
              {scatter.p25Y > 0 && scatter.p25Y < 100 && (
                <div
                  className="absolute left-0 h-px w-full bg-neutral-300 dark:bg-neutral-700"
                  style={{ top: `${scatter.p25Y}%` }}
                />
              )}
              {/* Puntos */}
              {scatter.points.map((p) => (
                <div
                  key={p.id}
                  title={`${p.imp.toLocaleString("es")} impresiones · AlgoScore ${p.score.toFixed(4)}${p.wasted ? " · alcance desperdiciado" : ""}`}
                  // Semitransparente para que el solapamiento muestre densidad.
                  className={`absolute h-1.5 w-1.5 rounded-full ${
                    p.wasted
                      ? "bg-rose-500"
                      : "bg-neutral-500/40 dark:bg-neutral-400/40"
                  }`}
                  style={{
                    left: `calc(${p.x}% - 3px)`,
                    top: `calc(${p.y}% - 3px)`,
                  }}
                />
              ))}
            </div>
            <div className="mt-1.5 flex justify-between text-[10px] text-neutral-400">
              <span>{Math.round(Math.pow(10, scatter.logMin)).toLocaleString("es")} impresiones</span>
              <span>{Math.round(Math.pow(10, scatter.logMax)).toLocaleString("es")} impresiones</span>
            </div>
          </div>
        )}
      </div>

      {/* Barras de cohortes significativas */}
      {sigCohorts.length > 0 && (
        <div className={CARD}>
          <CardHeader
            question="¿Qué tipo de post te funciona mejor?"
            reading="Cada bloque parte tus posts en grupos y compara la puntuación mediana de cada uno. Solo aparecen aquí las divisiones donde la diferencia es lo bastante grande y consistente como para no ser casualidad."
            method="Mann-Whitney U (compara medianas sin asumir que los datos sigan una campana), p < 0.05, mínimo 8 posts por grupo. Es un patrón de tu cuenta, no una regla del algoritmo: correlación no es causalidad."
          />
          <div className="mt-6 space-y-7">
            {sigCohorts.map((c) => (
              <CohortBlock key={c.id} cohort={c} />
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

/** Un bloque de cohorte: titular con la diferencia ya interpretada + barras. */
function CohortBlock({ cohort }: { cohort: CohortComparison }) {
  const copy = COHORT_COPY[cohort.id] ?? { title: cohort.id, hint: "" };
  const groups = cohort.groups; // ordenados de menor a mayor mediana
  const worst = groups[0];
  const best = groups[groups.length - 1];
  const maxScore = best.medianScore;
  const gap = times(best.medianScore, worst.medianScore);

  // El dato que más convence: si el grupo ganador no tuvo más alcance, la
  // diferencia no viene de cuánta gente lo vio, sino de qué hizo esa gente.
  const sameReach = best.medianImpressions <= worst.medianImpressions;

  return (
    <div>
      <p className="text-sm font-medium">{copy.title}</p>
      {gap && (
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          <strong className="font-medium text-neutral-900 dark:text-neutral-100">
            {best.label}
          </strong>{" "}
          puntúa {gap} lo que puntúa <strong className="font-medium">{worst.label}</strong>
          {sameReach
            ? ", y encima con igual o menos alcance: la diferencia no está en cuánta gente lo vio, sino en lo que hizo al verlo."
            : "."}
        </p>
      )}
      <p className="mt-1 text-xs text-neutral-500">
        {copy.hint} {pInWords(cohort.pScore ?? 1)}
        {cohort.comparisons > 1 &&
          ` Ojo: aquí había ${cohort.comparisons} parejas posibles y se enseña la más separada, así que el p ya viene penalizado por ello (Bonferroni). Confírmalo en el próximo export antes de reorganizar nada.`}
      </p>

      <div className="mt-3 space-y-1.5">
        {groups.map((g) => {
          const isBest = g === best;
          const isWorst = g === worst;
          const width = maxScore > 0 ? (g.medianScore / maxScore) * 100 : 0;
          return (
            <div key={g.label} className="flex items-center gap-3 text-xs">
              <span className="w-32 shrink-0 truncate text-neutral-600 dark:text-neutral-400">
                {g.label}
              </span>
              <div className="h-4 flex-1 overflow-hidden rounded-sm bg-neutral-100 dark:bg-neutral-900">
                <div
                  className={`h-full rounded-sm ${
                    isBest
                      ? "bg-emerald-500"
                      : isWorst
                        ? "bg-rose-400"
                        : "bg-neutral-400 dark:bg-neutral-600"
                  }`}
                  style={{ width: `${width}%` }}
                  title={`${g.label}: AlgoScore mediano ${g.medianScore.toFixed(4)} · ${Math.round(g.medianImpressions).toLocaleString("es")} impresiones medianas · ${g.n} posts`}
                />
              </div>
              <span className="w-16 shrink-0 text-right font-mono text-neutral-500">
                {g.medianScore.toFixed(4)}
              </span>
              <span className="w-24 shrink-0 text-right text-neutral-400">
                {Math.round(g.medianImpressions).toLocaleString("es")} imp.
              </span>
              <span className="w-14 shrink-0 text-right text-neutral-400">
                {g.n} posts
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
