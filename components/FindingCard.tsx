"use client";

import { useState } from "react";
import type { Finding } from "@/lib/findings";
import { REPO } from "./Code";

const SEVERITY_STYLES: Record<Finding["severity"], string> = {
  alta: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
  media: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  baja: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
};

export function FindingCard({ finding }: { finding: Finding }) {
  const [open, setOpen] = useState(false);

  return (
    <article className="rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
      <div className="flex items-start justify-between gap-4">
        <h3 className="font-semibold">{finding.title}</h3>
        <span
          className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium uppercase ${SEVERITY_STYLES[finding.severity]}`}
        >
          {finding.severity}
        </span>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
        {finding.explanation}
      </p>
      <p className="mt-3 text-sm font-medium">{finding.action}</p>

      <button
        onClick={() => setOpen(!open)}
        className="mt-4 text-xs text-neutral-500 underline underline-offset-2"
      >
        {open ? "Ocultar evidencia" : "Ver evidencia"}
      </button>

      {open && (
        <div className="mt-3 space-y-2 rounded bg-neutral-50 p-3 text-xs dark:bg-neutral-900">
          <p className="text-neutral-700 dark:text-neutral-300">{finding.evidence}</p>
          <p className="font-mono text-neutral-500">
            <a
              href={`${REPO}${finding.codeRef.split(":")[0]}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              {finding.codeRef}
            </a>
          </p>
        </div>
      )}
    </article>
  );
}
