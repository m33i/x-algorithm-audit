"use client";

import { useCallback, useState } from "react";

interface Props {
  onFile: (text: string) => void;
  onError: (message: string) => void;
  error: string | null;
}

/**
 * Tope de tamaño. Un export de Analytics ronda los 350 bytes por post, así
 * que 25 MB son ~75.000 posts: inalcanzable para un export real, de modo
 * que nadie con una cuenta muy activa se come un rechazo falso.
 *
 * No filtra por tipo a propósito: `file.type` viene vacío o como
 * application/vnd.ms-excel según el sistema, y el parser ya devuelve un
 * error claro con cualquier fichero que no sea el CSV. Esto solo evita que
 * soltar un vídeo por error congele la pestaña.
 */
const MAX_BYTES = 25 * 1024 * 1024;

export function Dropzone({ onFile, onError, error }: Props) {
  const [dragging, setDragging] = useState(false);

  const read = useCallback(
    (file: File) => {
      if (file.size > MAX_BYTES) {
        const mb = (file.size / 1024 / 1024).toFixed(1);
        onError(
          `Ese fichero pesa ${mb} MB y el tope son 25 MB. Un export de Analytics no llega ni a 1 MB, así que probablemente no sea el CSV.`,
        );
        return;
      }
      const reader = new FileReader();
      reader.onload = () => onFile(String(reader.result));
      reader.onerror = () =>
        onError("No se ha podido leer el fichero. Inténtalo de nuevo.");
      reader.readAsText(file);
    },
    [onFile, onError],
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
        className={`flex h-48 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition focus-within:ring-2 focus-within:ring-neutral-900 dark:focus-within:ring-neutral-100 ${
          dragging
            ? "border-neutral-900 bg-neutral-100 dark:border-neutral-100 dark:bg-neutral-800"
            : "border-neutral-300 dark:border-neutral-700"
        }`}
      >
        <input
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
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
