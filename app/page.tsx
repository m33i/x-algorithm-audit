"use client";

import { useState } from "react";
import { Dropzone } from "@/components/Dropzone";
import { HowItWorks } from "@/components/HowItWorks";
import { Report } from "@/components/Report";
import { parseAnalyticsCsv, CsvParseError } from "@/lib/csv";
import { analyze, type AnalysisReport } from "@/lib/findings";

export default function Home() {
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [error, setError] = useState<string | null>(null);

  function handleFile(text: string) {
    setError(null);
    try {
      const parsed = parseAnalyticsCsv(text);
      if (parsed.rows.length === 0) {
        setError(
          "No se ha podido leer ningún post con impresiones de ese CSV. ¿Es el export de Account Analytics?",
        );
        return;
      }
      setSkipped(parsed.skippedRows);
      setReport(analyze(parsed.rows));
    } catch (e) {
      if (e instanceof CsvParseError) setError(e.message);
      else setError("No se ha podido procesar el fichero.");
    }
  }

  if (report) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-12">
        <Report
          report={report}
          skippedRows={skipped}
          onReset={() => {
            setReport(null);
            setSkipped(0);
          }}
        />
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-4xl flex-col items-center px-6 py-20">
      <h1 className="text-3xl font-bold tracking-tight">x-algorithm-audit</h1>
      <p className="mt-3 max-w-lg text-center text-neutral-600 dark:text-neutral-400">
        Puntúa tus posts con los pesos de ranking que xAI publicó el 13 de
        agosto de 2026.
      </p>

      <div className="mt-10 flex justify-center">
        <Dropzone onFile={handleFile} onError={setError} error={error} />
      </div>

      <HowItWorks />
    </main>
  );
}
