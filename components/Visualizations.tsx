"use client";

import { useMemo, useState } from "react";
import { median, quantile } from "@/lib/stats";
import type { AnalysisReport } from "@/lib/findings";

const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
// getDay(): 0 = domingo, 1 = lunes, ..., 6 = sábado
// Reordenamos a lunes = 0
function dayIndex(dow: number): number {
  return (dow + 6) % 7;
}

/**
 * Escala de color por opacidad: un solo color base con opacidad proporcional
 * al valor, normalizado contra el máximo. Mínimo 0.08 para que las celdas
 * vacías-but-presente se distingan de las realmente vacías.
 */
function opacityFor(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0.08, Math.min(1, value / max));
}

/**
 * Mínimo de posts por celda para pintar su mediana de score.
 *
 * Una celda con un solo post mostraría el score de ese post como si fuera una
 * mediana: ruido presentado como señal, justo lo que los umbrales del resto
 * del proyecto existen para evitar. No es el n>=8 de las cohortes porque una
 * celda no sostiene una afirmación estadística, solo orienta la vista; pero
 * pintar n=1 sería mentir con color.
 */
const MIN_CELL_POSTS = 3;

const DAY_LABELS = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];

/** Etiquetas legibles para los ids internos de cohorte. */
const COHORT_LABELS: Record<string, string> = {
  link: "Enlace acortado vs solo texto",
  media: "Con media vs sin media",
  reply: "Replies vs originales",
  hashtag: "Con hashtag vs sin hashtag",
  hora: "Franja horaria",
  dia: "Día de la semana",
  longitud: "Longitud del post",
};

export function Visualizations({ report }: { report: AnalysisReport }) {
  const posts = report.posts;
  const [heatMode, setHeatMode] = useState<"score" | "volume">("score");

  // --- Heatmap hora x día ---
  // 7x24 celdas. Valor = mediana de AlgoScore (modo score) o count (modo volume).
  const heat = useMemo(() => {
    type Cell = { score: number | null; count: number };
    type Bucket = { score: number[]; count: number };

    const grid: Cell[][] = Array.from({ length: 7 }, () =>
      Array.from({ length: 24 }, () => ({ score: null as number | null, count: 0 })),
    );

    const buckets: Bucket[][] = Array.from({ length: 7 }, () =>
      Array.from({ length: 24 }, () => ({ score: [] as number[], count: 0 })),
    );

    for (const p of posts) {
      const di = dayIndex(p.features.dayOfWeek);
      const hi = p.features.hourOfDay;
      buckets[di][hi].score.push(p.algoScore);
      buckets[di][hi].count++;
    }

    let maxScore = 0;
    let maxCount = 0;
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        const b = buckets[d][h];
        // Solo se calcula mediana con muestra suficiente. Con menos, la celda
        // existe (tiene count) pero no tiene score que pintar.
        if (b.score.length >= MIN_CELL_POSTS) {
          const m = median(b.score);
          grid[d][h].score = m;
          if (m > maxScore) maxScore = m;
        }
        grid[d][h].count = b.count;
        if (b.count > maxCount) maxCount = b.count;
      }
    }

    return { grid, maxScore, maxCount };
  }, [posts]);

  // --- Fallback: agregado por día, cuando el CSV no trae hora ---
  const byDay = useMemo(() => {
    const buckets: number[][] = Array.from({ length: 7 }, () => []);
    for (const p of posts) buckets[dayIndex(p.features.dayOfWeek)].push(p.algoScore);
    const rows = buckets.map((scores, i) => ({
      label: DAY_LABELS[i],
      n: scores.length,
      score: scores.length >= MIN_CELL_POSTS ? median(scores) : null,
    }));
    const max = Math.max(0, ...rows.map((r) => r.score ?? 0));
    return { rows, max };
  }, [posts]);

  // --- Histograma de AlgoScore ---
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
    const maxCount = Math.max(...counts);
    const med = median(scores);
    return { counts, maxCount, bins, min, max, binSize, med };
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
      // No se reimplementa el criterio: se consume el conjunto que
      // `findings.ts` ya decidió, con sus guardas de dispersión y mínimo de
      // posts. Si el hallazgo no se emitió, no se pinta nada de rojo.
      const wasted = wastedIds.has(p.row.id);
      return { x, y, wasted, id: p.row.id, imp: p.row.impressions, score: p.algoScore };
    });

    const p90X = ((Math.log10(p90Imp) - logMin) / (logMax - logMin)) * 100;
    const p25Y = 100 - ((p25Score - scoreMin) / (scoreMax - scoreMin)) * 100;

    return { points, p90X, p25Y, logMin, logMax, scoreMin, scoreMax, p90Imp, p25Score };
  }, [posts, wastedIds]);

  // --- Cohortes significativas ---
  const sigCohorts = report.cohorts.filter((c) => c.significant && c.groups.length >= 2);

  return (
    <div className="space-y-8">
      {/* Sin hora en el CSV: agregado por día en vez de heatmap */}
      {!report.hasTimeOfDay ? (
        <div className="rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
          <h2 className="font-semibold">Rendimiento por día de la semana</h2>
          <p className="mt-1 text-xs text-neutral-500">
            Mediana de AlgoScore por día. Los días con menos de {MIN_CELL_POSTS}{" "}
            posts se muestran sin barra: no hay muestra para una mediana.
          </p>
          <div className="mt-4 space-y-1.5">
            {byDay.rows.map((r) => (
              <div key={r.label} className="flex items-center gap-3 text-xs">
                <span className="w-20 shrink-0 text-neutral-600 dark:text-neutral-400">
                  {r.label}
                </span>
                <div className="h-4 flex-1 overflow-hidden rounded-sm bg-neutral-100 dark:bg-neutral-900">
                  {r.score !== null && byDay.max > 0 && (
                    <div
                      className="h-full rounded-sm bg-emerald-500"
                      style={{ width: `${(r.score / byDay.max) * 100}%` }}
                    />
                  )}
                </div>
                <span className="w-16 shrink-0 text-right font-mono text-neutral-500">
                  {r.score !== null ? r.score.toFixed(4) : "—"}
                </span>
                <span className="w-12 shrink-0 text-right text-neutral-400">
                  n={r.n}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-4 rounded bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            <strong>No hay heatmap por hora</strong> porque el export de X
            Analytics trae la columna <code>Date</code> sin hora del día: todos
            los posts se parsean a medianoche. Por el mismo motivo se suprimen
            la cohorte de franja horaria y el hallazgo de publicación en
            ráfaga, que sin horas contaría como simultáneos todos los posts de
            un mismo día. Enriquecer el CSV con marcas de tiempo desde la X API
            reactiva las tres cosas.
          </p>
        </div>
      ) : (
      /* Heatmap hora x día */
      <div className="rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold">Heatmap hora x día</h2>
            <p className="mt-1 text-xs text-neutral-500">
              {heatMode === "score"
                ? `Mediana de AlgoScore por franja, solo en celdas con ${MIN_CELL_POSTS}+ posts. Verde intenso = mejor rendimiento.`
                : "Número de posts publicados por franja. Azul intenso = más volumen."}
            </p>
          </div>
          <div className="flex rounded border border-neutral-300 text-xs dark:border-neutral-700">
            <button
              onClick={() => setHeatMode("score")}
              className={`px-3 py-1.5 font-medium ${
                heatMode === "score"
                  ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                  : "text-neutral-600 dark:text-neutral-400"
              }`}
            >
              Score
            </button>
            <button
              onClick={() => setHeatMode("volume")}
              className={`px-3 py-1.5 font-medium ${
                heatMode === "volume"
                  ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                  : "text-neutral-600 dark:text-neutral-400"
              }`}
            >
              Volumen
            </button>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <div className="min-w-[600px]">
            {/* Cabecera de horas */}
            <div className="flex">
              <div className="w-10 shrink-0" />
              {Array.from({ length: 24 }, (_, h) => (
                <div
                  key={h}
                  className="flex-1 text-center text-[10px] text-neutral-400"
                >
                  {h % 3 === 0 ? h : ""}
                </div>
              ))}
            </div>
            {/* Filas por día */}
            {heat.grid.map((row, di) => (
              <div key={di} className="mt-0.5 flex items-center">
                <div className="w-10 shrink-0 text-xs text-neutral-500">
                  {DAYS[di]}
                </div>
                {row.map((cell, hi) => {
                  // En modo score solo se pinta si hay mediana (n >= MIN_CELL_POSTS).
                  // En modo volumen basta con que haya algún post.
                  const paint =
                    heatMode === "score" ? cell.score !== null : cell.count > 0;
                  const value =
                    heatMode === "score" ? cell.score ?? 0 : cell.count;
                  const max = heatMode === "score" ? heat.maxScore : heat.maxCount;
                  const op = paint ? opacityFor(value, max) : 0;
                  const baseColor =
                    heatMode === "score" ? "bg-emerald-500" : "bg-blue-500";
                  const title =
                    cell.count === 0
                      ? `${DAYS[di]} ${hi}:00 · sin posts`
                      : cell.score === null
                        ? `${DAYS[di]} ${hi}:00 · ${cell.count} post${cell.count === 1 ? "" : "s"} · muestra insuficiente para una mediana (mínimo ${MIN_CELL_POSTS})`
                        : `${DAYS[di]} ${hi}:00 · ${cell.count} posts · AlgoScore mediano ${cell.score.toFixed(4)}`;
                  return (
                    <div
                      key={hi}
                      title={title}
                      className={`mx-px h-6 flex-1 rounded-sm ${
                        paint ? baseColor : "bg-neutral-100 dark:bg-neutral-900"
                      }`}
                      style={paint ? { opacity: op } : undefined}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      )}

      {/* Histograma + Scatter */}
      <div className="grid gap-4 lg:grid-cols-2">
        {hist && (
          <div className="rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
            <h2 className="font-semibold">Distribución de AlgoScore</h2>
            <p className="mt-1 text-xs text-neutral-500">
              {posts.length} posts. Línea roja = mediana.
            </p>
            {/* Sin separación entre barras: es la convención del histograma
                (los bins son contiguos) y además hace que el porcentaje de la
                línea de mediana caiga exactamente sobre su bin. Con `gap-px`
                los 19 huecos desplazaban la línea varios puntos. */}
            <div className="relative mt-4 flex h-40 items-end">
              {hist.counts.map((c, i) => (
                <div
                  key={i}
                  className="flex-1 border-r border-white bg-neutral-400 last:border-r-0 dark:border-neutral-950 dark:bg-neutral-600"
                  style={{ height: `${(c / hist.maxCount) * 100}%` }}
                  title={`AlgoScore ${(hist.min + i * hist.binSize).toFixed(4)} – ${(hist.min + (i + 1) * hist.binSize).toFixed(4)} · ${c} post${c === 1 ? "" : "s"}`}
                />
              ))}
              {/* Línea de mediana */}
              <div
                className="absolute top-0 h-full w-px bg-rose-500"
                style={{
                  left: `${((hist.med - hist.min) / (hist.max - hist.min)) * 100}%`,
                }}
              >
                <span className="absolute -top-4 -translate-x-1/2 whitespace-nowrap text-[10px] text-rose-500">
                  {hist.med.toFixed(3)}
                </span>
              </div>
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-neutral-400">
              <span>{hist.min.toFixed(3)}</span>
              <span>{hist.max.toFixed(3)}</span>
            </div>
          </div>
        )}

        {scatter && (
          <div className="rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
            <h2 className="font-semibold">Impresiones vs AlgoScore</h2>
            <p className="mt-1 text-xs text-neutral-500">
              Eje X: impresiones (log). Eje Y: AlgoScore. Puntos rojos = alcance
              desperdiciado (P90 impresiones, P25 score).
            </p>
            <div className="relative mt-4 h-56 border-l border-b border-neutral-200 dark:border-neutral-700">
              {/* Zona wasted reach */}
              {scatter.p90X < 100 && scatter.p25Y < 100 && (
                <div
                  className="absolute rounded-sm bg-rose-500/5"
                  style={{
                    left: `${scatter.p90X}%`,
                    top: `${scatter.p25Y}%`,
                    right: 0,
                    bottom: 0,
                  }}
                />
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
                  title={`Impresiones: ${p.imp.toLocaleString("es")}\nAlgoScore: ${p.score.toFixed(4)}`}
                  // Semitransparente: con cientos de posts los puntos se
                  // solapan, y la opacidad acumulada hace legible la densidad
                  // en vez de una mancha uniforme. Los de alcance
                  // desperdiciado van opacos para que no se pierdan.
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
            <div className="mt-1 flex justify-between text-[10px] text-neutral-400">
              <span>{Math.pow(10, scatter.logMin).toLocaleString("es")}</span>
              <span>{Math.pow(10, scatter.logMax).toLocaleString("es")} imp.</span>
            </div>
          </div>
        )}
      </div>

      {/* Barras de cohortes significativas */}
      {sigCohorts.length > 0 && (
        <div className="rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
          <h2 className="font-semibold">Cohortes significativas</h2>
          <p className="mt-1 text-xs text-neutral-500">
            Diferencia estadísticamente significativa (Mann-Whitney U, p &lt; 0.05).
            Barras proporcionales a la mediana de AlgoScore dentro de cada cohorte.
          </p>
          <div className="mt-4 space-y-5">
            {sigCohorts.map((c) => {
              const maxScore = Math.max(...c.groups.map((g) => g.medianScore));
              return (
                <div key={c.id}>
                  <p className="mb-2 text-sm font-medium">
                    {COHORT_LABELS[c.id] ?? c.id}{" "}
                    <span className="font-normal text-neutral-400">
                      (p = {c.pScore?.toFixed(4)})
                    </span>
                  </p>
                  <div className="space-y-1.5">
                    {c.groups.map((g) => {
                      const isBest = g === c.groups[c.groups.length - 1];
                      const isWorst = g === c.groups[0];
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
                            />
                          </div>
                          <span className="w-16 shrink-0 text-right font-mono text-neutral-500">
                            {g.medianScore.toFixed(4)}
                          </span>
                          <span className="w-8 shrink-0 text-right text-neutral-400">
                            n={g.n}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
