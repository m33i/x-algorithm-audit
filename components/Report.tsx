"use client";

import { FindingCard } from "./FindingCard";
import { PostTable } from "./PostTable";
import { Diagnosis } from "./Diagnosis";
import { Visualizations } from "./Visualizations";
import type { AnalysisReport } from "@/lib/findings";

interface Props {
  report: AnalysisReport;
  skippedRows: number;
  onReset: () => void;
}

export function Report({ report, skippedRows, onReset }: Props) {
  const posts = report.posts;

  return (
    <div className="space-y-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Auditoría</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {report.postCount} posts analizados
            {skippedRows > 0 && ` · ${skippedRows} filas descartadas por falta de datos`}
          </p>
        </div>
        <button onClick={onReset} className="text-sm underline underline-offset-2">
          Analizar otro CSV
        </button>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <p className="text-xs uppercase text-neutral-500">AlgoScore mediano</p>
          <p className="mt-1 font-mono text-2xl">{report.medianAlgoScore.toFixed(4)}</p>
          <p className="mt-2 text-xs text-neutral-500">
            Score promedio por espectador. Replicacion del positive_sum del
            ranker de X (param.rs). Mas alto = mas acciones de peso por
            impresion.
          </p>
        </div>
        <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <p className="text-xs uppercase text-neutral-500">Cobertura</p>
          <p className="mt-1 font-mono text-2xl">
            {(report.coverage * 100).toFixed(0)}%
          </p>
          <p className="mt-2 text-xs text-neutral-500">
            Del espacio de pesos positivos (43.32) es medible desde el CSV.
            El resto son señales inobservables: copiar el enlace, DMs, quotes
            y todas las negativas.
          </p>
          {report.proxiedWeight > 0 && (
            <p className="mt-2 text-xs text-neutral-500">
              Además se <em>estima</em> por proxy una señal que vale{" "}
              {report.proxiedWeight.toFixed(1)} del algoritmo, usando los
              bookmarks como sustituto. Es una hipótesis sin medir, así que no
              suma a la cobertura de arriba ni entra en las comparaciones
              estadísticas.
            </p>
          )}
        </div>
        <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <p className="text-xs uppercase text-neutral-500">Hallazgos</p>
          <p className="mt-1 font-mono text-2xl">{report.findings.length}</p>
          <p className="mt-2 text-xs text-neutral-500">
            Patrones con evidencia estadistica (Mann-Whitney U, p &lt; 0.05,
            minimo 8 posts por grupo). Ordenados por severidad.
          </p>
        </div>
      </section>

      <Visualizations report={report} />

      <section>
        <h2 className="mb-4 text-lg font-semibold">Puntos débiles</h2>
        {report.findings.length === 0 ? (
          <p className="rounded-lg border border-neutral-200 p-5 text-sm text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
            No hay hallazgos con evidencia suficiente. Hace falta un mínimo de
            8 posts por grupo y p &lt; 0.05 para emitir cualquier conclusión.
          </p>
        ) : (
          <div className="space-y-4">
            {report.findings.map((f) => (
              <FindingCard key={f.id} finding={f} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">Tus posts</h2>
        <PostTable posts={posts} />
      </section>

      <Diagnosis report={report} posts={posts} />
    </div>
  );
}
