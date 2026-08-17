"use client";

import { useCallback, useState } from "react";

interface Props {
  onFile: (text: string) => void;
  error: string | null;
}

export function Dropzone({ onFile, error }: Props) {
  const [dragging, setDragging] = useState(false);

  const read = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => onFile(String(reader.result));
      reader.readAsText(file);
    },
    [onFile],
  );

  return (
    <div className="w-full max-w-xl">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) read(file);
        }}
        className={`flex h-48 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition ${
          dragging
            ? "border-neutral-900 bg-neutral-100 dark:border-neutral-100 dark:bg-neutral-800"
            : "border-neutral-300 dark:border-neutral-700"
        }`}
      >
        <input
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) read(file);
          }}
        />
        <p className="font-medium">Suelta aquí tu CSV de X Analytics</p>
        <p className="mt-2 text-sm text-neutral-500">
          O haz clic para elegirlo. El fichero no sale de tu navegador.
        </p>
      </label>

      {error && (
        <p className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}
    </div>
  );
}
