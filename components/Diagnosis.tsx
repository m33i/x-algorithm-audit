"use client";

import { useState } from "react";
import type { AnalysisReport } from "@/lib/findings";
import type { ScoredPost } from "@/lib/cohorts";
import type { Diagnosis as DiagnosisType } from "@/lib/diagnosis-schema";
import {
  buildDiagnosisPayload,
  buildDiagnosisPrompt,
} from "@/lib/diagnose-prompt";

type State = "idle" | "loading" | "done" | "error" | "prompt";

export function Diagnosis({
  report,
  posts,
}: {
  report: AnalysisReport;
  posts: ScoredPost[];
}) {
  const [state, setState] = useState<State>("idle");
  const [diagnosis, setDiagnosis] = useState<DiagnosisType | null>(null);
  const [message, setMessage] = useState("");
  const [promptText, setPromptText] = useState("");
  const [copied, setCopied] = useState(false);

  async function runGemini() {
    setState("loading");
    try {
      const res = await fetch("/api/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildDiagnosisPayload(report, posts)),
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

  function buildPrompt() {
    const payload = buildDiagnosisPayload(report, posts);
    setPromptText(buildDiagnosisPrompt(payload));
    setCopied(false);
    setState("prompt");
  }

  async function copyPrompt() {
    if (!promptText) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(promptText);
      } else {
        // Fallback para contextos sin Clipboard API (HTTP antiguo).
        const ta = document.createElement("textarea");
        ta.value = promptText;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  if (state === "idle") {
    return (
      <div className="rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
        <h2 className="font-semibold">Diagnóstico redactado</h2>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          Envía los agregados de arriba y el texto de 15 de tus posts a Gemini para
          obtener el diagnóstico narrado y reescrituras. Tu CSV no se envía.
        </p>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          ¿Sin clave de Gemini o prefieres otro modelo? Copia el prompt y pégalo
          en el chat de tu LLM favorito.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={runGemini}
            className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
          >
            Generar diagnóstico
          </button>
          <button
            onClick={buildPrompt}
            className="rounded border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900 dark:border-neutral-700 dark:text-neutral-100"
          >
            Copiar prompt para tu LLM
          </button>
        </div>
      </div>
    );
  }

  if (state === "prompt") {
    return (
      <div className="rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
        <div className="flex items-start justify-between gap-4">
          <h2 className="font-semibold">Prompt para tu LLM</h2>
          <div className="flex gap-2">
            <button
              onClick={copyPrompt}
              className="rounded bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
            >
              {copied ? "Copiado ✓" : "Copiar al portapapeles"}
            </button>
            <button
              onClick={() => setState("idle")}
              className="text-xs underline underline-offset-2"
            >
              Volver
            </button>
          </div>
        </div>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          Pégalo en el chat de Gemini, Claude, GPT o el que prefieras. El prompt
          pide una respuesta en JSON con el mismo schema que usa el endpoint.
        </p>
        <textarea
          readOnly
          value={promptText}
          onFocus={(e) => e.currentTarget.select()}
          className="mt-4 h-96 w-full resize-y rounded border border-neutral-300 bg-neutral-50 p-3 font-mono text-xs dark:border-neutral-700 dark:bg-neutral-900"
        />
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
