"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AnalysisReport } from "@/lib/findings";
import type { ScoredPost } from "@/lib/cohorts";
import { buildDiagnosisPayload, buildDiagnosisPrompt } from "@/lib/diagnose-prompt";

const COPIED_FEEDBACK_MS = 2000;

type CopyState = "idle" | "copied" | "failed";

export function Diagnosis({
  report,
  posts,
}: {
  report: AnalysisReport;
  posts: ScoredPost[];
}) {
  const payload = useMemo(
    () => buildDiagnosisPayload(report, posts),
    [report, posts],
  );
  const promptText = useMemo(() => buildDiagnosisPrompt(payload), [payload]);

  const [state, setState] = useState<CopyState>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // El acuse vuelve a "idle" solo: si se quedara fijo, el botón parecería
  // muerto al pulsarlo de nuevo.
  const flag = useCallback((next: CopyState) => {
    setState(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (next === "copied") {
      timerRef.current = setTimeout(() => setState("idle"), COPIED_FEEDBACK_MS);
    }
  }, []);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          fallbackCopy(text);
        }
        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  async function copyPrompt() {
    flag((await copy(promptText)) ? "copied" : "failed");
  }

  return (
    <section className="rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold">Prompt para tu LLM</h2>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            Cópialo y pégalo en el chat de Gemini, Claude, GPT o el LLM que
            prefieras. Devuelve un diagnóstico con 10 secciones: resumen
            ejecutivo, priorización por impacto, análisis de cohortes,
            reescrituras de tus peores posts, plan de acción y métricas de
            seguimiento.
          </p>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            No se envía el CSV, solo los agregados ya calculados y el texto de{" "}
            {payload.sampleIsComplete
              ? `tus ${payload.samplePosts.length} posts`
              : `${payload.samplePosts.length} de tus ${payload.postCount} posts`}
            . No le adjuntes el CSV además del prompt: si el LLM ve las columnas
            crudas se pone a recalcular por su cuenta, y sus números no llevan
            ni la división por impresiones ni los pesos correctos.
          </p>
        </div>
        <button
          onClick={copyPrompt}
          aria-live="polite"
          className="shrink-0 rounded bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white transition-colors dark:bg-neutral-100 dark:text-neutral-900"
        >
          {state === "copied" ? "¡Copiado!" : "Copiar"}
        </button>
      </div>

      {state === "failed" && (
        <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
          El navegador bloqueó el acceso al portapapeles. Selecciona el texto
          del cuadro de abajo y cópialo a mano.
        </p>
      )}

      <textarea
        readOnly
        value={promptText}
        onFocus={(e) => e.currentTarget.select()}
        className="mt-4 h-96 w-full resize-y rounded border border-neutral-300 bg-neutral-50 p-3 font-mono text-xs dark:border-neutral-700 dark:bg-neutral-900"
      />
    </section>
  );
}

/** Para contextos sin Clipboard API. */
function fallbackCopy(text: string) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}
