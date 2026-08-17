"use client";

import { FindingCard } from "./FindingCard";
import { PostTable } from "./PostTable";
import { Diagnosis } from "./Diagnosis";
import { XLogo } from "./XLogo";
import { Visualizations } from "./Visualizations";
import type { AnalysisReport } from "@/lib/findings";

interface Props {
  report: AnalysisReport;
  skippedRows: number;
  onReset: () => void;
}

/**
 * Tile de cabecera. La explicación va en dos niveles a propósito: `children`
 * cuenta qué significa el número para quien escribe los posts, y `method` deja
 * el cómo se calcula en una línea aparte, para quien quiera comprobarlo. El
 * detalle largo vive en /readme, no aquí.
 */
function StatCard({
  label,
  value,
  method,
  children,
}: {
  label: string;
  value: string;
  method: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1 font-mono text-2xl">{value}</p>
      <p className="mt-2 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
        {children}
      </p>
      <p className="mt-auto pt-3 text-[11px] leading-relaxed text-neutral-400 dark:text-neutral-500">
        {method}
      </p>
    </div>
  );
}

export function Report({ report, skippedRows, onReset }: Props) {
  const posts = report.posts;

  return (
    <div className="space-y-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <span className="sr-only">X Algorithm Audit</span>
            <XLogo className="h-[0.78em] w-[0.78em]" />
            <span aria-hidden="true">Algorithm Audit</span>
          </h1>
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
        <StatCard
          label="AlgoScore mediano"
          value={report.medianAlgoScore.toFixed(4)}
          method="Suma de peso × acción ÷ impresiones, con los pesos publicados en home-mixer/params/param.rs."
        >
          Cuántas acciones caras (responder, citar, compartir fuera de X,
          seguirte; un like casi no cuenta) provoca un post tuyo normal{" "}
          <strong className="font-medium">por cada persona que lo ve</strong>, no
          en total: por eso uno con 200 impresiones puede puntuar más que otro
          con 20.000. La mitad de tus posts queda por encima.
        </StatCard>

        <StatCard
          label="Cobertura"
          value={`${(report.coverage * 100).toFixed(0)}%`}
          method="Pesos observables desde el CSV ÷ positive_sum (43.32)."
        >
          La parte de todo lo que el algoritmo premia que el CSV deja ver. Fuera
          quedan copiar tu enlace y pegarlo en otro sitio (20.0, el peso más
          alto que existe), los mensajes directos, las citas y todos los
          castigos: un post tuyo puede estar funcionando por vías que aquí no
          aparecen.
          {report.proxiedWeight > 0 && (
            <>
              {" "}
              Aparte, tus bookmarks <em>estiman</em> una señal que vale{" "}
              {report.proxiedWeight.toFixed(1)}. Es una hipótesis sin medir: no
              suma aquí ni entra en ninguna comparación.
            </>
          )}
        </StatCard>

        <StatCard
          label="Hallazgos"
          value={String(report.findings.length)}
          method="Cohortes: Mann-Whitney U, p < 0.05 corregida por comparaciones múltiples, mínimo 8 posts por grupo. Ordenados por severidad."
        >
          Puntos débiles con evidencia suficiente para nombrarlos. Los que
          comparan grupos pasan un test estadístico; el resto son cuentas sobre
          tus datos, con mínimo de muestra pero sin test. Lo que no llega al
          listón <strong className="font-medium">no se enseña</strong>: una
          lista corta significa datos limpios, no una cuenta sin problemas.
        </StatCard>
      </section>

      <Visualizations report={report} />

      <section>
        <h2 className="text-lg font-semibold">Puntos débiles</h2>
        <p className="mb-4 mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Ordenados por severidad. Cada uno trae la evidencia con sus números y
          el enlace a la línea del código de X que lo respalda.
        </p>
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
        <h2 className="text-lg font-semibold">Tus posts</h2>
        <p className="mb-4 mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Todos tus posts con su puntuación. Ordénalos por AlgoScore y mira qué
          tienen en común los de arriba: ahí está el patrón que conviene
          repetir.
        </p>
        <PostTable posts={posts} />
      </section>

      <Diagnosis report={report} posts={posts} />
    </div>
  );
}
