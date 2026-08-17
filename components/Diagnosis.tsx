"use client";

import { useEffect, useRef, useState } from "react";
import type { AnalysisReport } from "@/lib/findings";
import type { ScoredPost } from "@/lib/cohorts";
import { buildDiagnosisPayload, buildDiagnosisPrompt } from "@/lib/diagnose-prompt";

export function Diagnosis({
  report,
  posts,
}: {
  report: AnalysisReport;
  posts: ScoredPost[];
}) {
  const promptText = buildDiagnosisPrompt(buildDiagnosisPayload(report, posts));
  const [copied, setCopied] = useState<boolean | null>(null);
  const autoCopiedRef = useRef(false);

  // Auto-copia al portapapeles la primera vez que el componente se monta,
  // para que el usuario ya tenga el prompt listo al llegar a esta sección.
  // Si falla (permisos del navegador, contexto sin Clipboard API), dejamos
  // el botón manual como fallback y no mostramos "Copiado".
  useEffect(() => {
    if (autoCopiedRef.current) return;
    autoCopiedRef.current = true;

    const text = promptText;
    const tryAuto = async () => {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
          setCopied(true);
        } else {
          fallbackCopy(text);
          setCopied(true);
        }
      } catch {
        setCopied(false);
      }
    };
    void tryAuto();
  }, [promptText]);

  async function copyPrompt() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(promptText);
      } else {
        fallbackCopy(promptText);
      }
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold">Prompt para tu LLM</h2>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            Lo hemos copiado a tu portapapeles. Pégalo en el chat de Gemini,
            Claude, GPT o el LLM que prefieras. Devuelve un diagnóstico con 10
            secciones: resumen ejecutivo, priorización por impacto, análisis de
            cohortes, reescrituras del bucket &ldquo;peor&rdquo;, plan de
            acción y métricas de seguimiento. El CSV no se envía: solo
            agregados y una muestra de 15 posts.
          </p>
        </div>
        <button
          onClick={copyPrompt}
          className="shrink-0 rounded bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
        >
          {copied === null
            ? "Copiar al portapapeles"
            : copied
              ? "Copiado"
              : "Copiar al portapapeles"}
        </button>
      </div>

      {copied === false && (
        <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
          La auto-copia no pudo completarse en este navegador. Usa el botón de
          arriba o selecciona el texto del cuadro manualmente.
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

/** Fallback para contextos sin Clipboard API (HTTP antiguo, iframes). */
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
