"use client";

import { FindingCard } from "./FindingCard";
import { PostTable } from "./PostTable";
import { Diagnosis } from "./Diagnosis";
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
          <h1 className="text-2xl font-bold">Tu auditoría</h1>
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
        </div>
        <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <p className="text-xs uppercase text-neutral-500">Cobertura del score</p>
          <p className="mt-1 font-mono text-2xl">
            {(report.coverage * 100).toFixed(0)}%
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            del espacio de pesos positivos es observable desde el CSV
          </p>
        </div>
        <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <p className="text-xs uppercase text-neutral-500">Hallazgos</p>
          <p className="mt-1 font-mono text-2xl">{report.findings.length}</p>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">Puntos débiles</h2>
        {report.findings.length === 0 ? (
          <p className="rounded-lg border border-neutral-200 p-5 text-sm text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
            No hay ningún hallazgo con evidencia suficiente. Esta herramienta exige
            al menos 8 posts por grupo y p &lt; 0.05 antes de afirmar nada. Con más
            posts en el CSV es probable que aparezcan patrones.
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
