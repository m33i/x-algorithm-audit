"use client";

import { useState } from "react";
import type { AnalysisReport } from "@/lib/findings";
import type { ScoredPost } from "@/lib/cohorts";
import type { Diagnosis as DiagnosisType } from "@/lib/diagnosis-schema";

/** Toma 5 mejores, 5 peores y 5 medianos por AlgoScore. */
function sample(posts: ScoredPost[]) {
  const sorted = [...posts].sort((a, b) => b.algoScore - a.algoScore);
  const mid = Math.floor(sorted.length / 2);
  const pick = (arr: ScoredPost[], bucket: "mejor" | "peor" | "mediano") =>
    arr.map((p) => ({
      bucket,
      text: p.row.text.slice(0, 2000),
      algoScore: p.algoScore,
      impressions: p.row.impressions,
    }));

  return [
    ...pick(sorted.slice(0, 5), "mejor"),
    ...pick(sorted.slice(-5), "peor"),
    ...pick(sorted.slice(Math.max(0, mid - 2), mid + 3), "mediano"),
  ].slice(0, 15);
}

export function Diagnosis({
  report,
  posts,
}: {
  report: AnalysisReport;
  posts: ScoredPost[];
}) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [diagnosis, setDiagnosis] = useState<DiagnosisType | null>(null);
  const [message, setMessage] = useState("");

  async function run() {
    setState("loading");
    try {
      const res = await fetch("/api/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postCount: report.postCount,
          medianAlgoScore: report.medianAlgoScore,
          coverage: report.coverage,
          findings: report.findings,
          cohorts: report.cohorts.map((c) => ({
            id: c.id,
            groups: c.groups,
            pScore: c.pScore,
            significant: c.significant,
            insufficientSample: c.insufficientSample,
          })),
          samplePosts: sample(posts),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Error desconocido." }));
        setMessage(body.error ?? "No se pudo generar el diagnóstico.");
        setState("error");
        return;
      }

      const body = await res.json();
      setDiagnosis(body.diagnosis);
      setState("done");
    } catch {
      setMessage("No se pudo contactar con el servidor.");
      setState("error");
    }
  }

  if (state === "idle") {
    return (
      <div className="rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
        <h2 className="font-semibold">Diagnóstico redactado</h2>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          Envía los agregados de arriba y el texto de 15 de tus posts a Claude para
          obtener el diagnóstico narrado y reescrituras. Tu CSV no se envía.
        </p>
        <button
          onClick={run}
          className="mt-4 rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
        >
          Generar diagnóstico
        </button>
      </div>
    );
  }

  if (state === "loading") {
    return (
      <p className="rounded-lg border border-neutral-200 p-5 text-sm dark:border-neutral-800">
        Redactando el diagnóstico…
      </p>
    );
  }

  if (state === "error") {
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 p-5 text-sm dark:border-red-900 dark:bg-red-950">
        <p>{message}</p>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          Los números de arriba siguen siendo válidos: se calculan en tu navegador.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
        <h2 className="font-semibold">Diagnóstico</h2>
        <p className="mt-3 leading-relaxed">{diagnosis!.summary}</p>
      </div>

      {diagnosis!.priorities.length > 0 && (
        <div className="rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
          <h2 className="font-semibold">Por dónde empezar</h2>
          <ol className="mt-3 space-y-3">
            {diagnosis!.priorities.map((p, i) => (
              <li key={p.findingId} className="text-sm">
                <span className="font-medium">{i + 1}. </span>
                {p.why}
              </li>
            ))}
          </ol>
        </div>
      )}

      {diagnosis!.rewrites.length > 0 && (
        <div className="rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
          <h2 className="font-semibold">Reescrituras</h2>
          <div className="mt-4 space-y-6">
            {diagnosis!.rewrites.map((r, i) => (
              <div key={i} className="space-y-2 text-sm">
                <p className="rounded bg-neutral-50 p-3 text-neutral-500 line-through dark:bg-neutral-900">
                  {r.original}
                </p>
                <p className="rounded bg-neutral-50 p-3 dark:bg-neutral-900">
                  {r.rewritten}
                </p>
                <p className="text-neutral-600 dark:text-neutral-400">{r.rationale}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
