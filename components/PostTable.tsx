"use client";

import { useMemo, useState } from "react";
import type { ScoredPost } from "@/lib/cohorts";

type SortKey = "algoScore" | "approxScore" | "impressions" | "date";

export function PostTable({ posts }: { posts: ScoredPost[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("algoScore");
  const [asc, setAsc] = useState(false);
  const [limit, setLimit] = useState(10);

  const sorted = useMemo(() => {
    const value = (p: ScoredPost) =>
      sortKey === "algoScore"
        ? p.algoScore
        : sortKey === "approxScore"
          ? p.approxScore
          : sortKey === "impressions"
            ? p.row.impressions
            : p.row.date.getTime();
    return [...posts].sort((a, b) => (asc ? value(a) - value(b) : value(b) - value(a)));
  }, [posts, sortKey, asc]);

  const visible = sorted.slice(0, limit);
  const hasMore = sorted.length > limit;

  // Sin columna de bookmarks en el CSV, approxScore === algoScore y la columna
  // AlgoScore+ sería una copia exacta al lado: ruido, y encima confuso.
  const hasProxy = useMemo(
    () => posts.some((p) => p.approxScore !== p.algoScore),
    [posts],
  );

  function header(key: SortKey, label: string, hint?: string) {
    const active = sortKey === key;
    const ariaSort: "ascending" | "descending" | "none" = !active
      ? "none"
      : asc
        ? "ascending"
        : "descending";

    return (
      <th aria-sort={ariaSort} className="px-3 py-2 text-right font-medium">
        <button
          type="button"
          title={hint}
          onClick={() => {
            if (active) setAsc(!asc);
            else {
              setSortKey(key);
              setAsc(false);
            }
          }}
          className="cursor-pointer select-none"
        >
          {label} {active ? (asc ? "↑" : "↓") : ""}
        </button>
      </th>
    );
  }

  return (
    <div className="space-y-3">
      {hasProxy && (
        <p className="text-xs leading-relaxed text-neutral-500">
          <strong className="font-medium text-neutral-700 dark:text-neutral-300">
            AlgoScore
          </strong>{" "}
          usa solo pesos transcritos del código de X, y es el que se compara en
          todo lo demás.{" "}
          <strong className="font-medium text-neutral-700 dark:text-neutral-300">
            AlgoScore+
          </strong>{" "}
          le suma una estimación a partir de tus bookmarks, con un peso de 6.0
          que nos hemos inventado nosotros para tapar un hueco del CSV. Sirve
          para ordenar y mirar; no es el score del ranker ni entra en ningún
          test.
        </p>
      )}
      <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Post</th>
              {header(
                "algoScore",
                "AlgoScore",
                "Solo pesos transcritos del código de X. Es el número que usan todas las comparaciones estadísticas.",
              )}
              {hasProxy &&
                header(
                  "approxScore",
                  "AlgoScore+",
                  "AlgoScore más una estimación de bookmarks con un peso de 6.0 inventado por esta herramienta. No es el score del ranker y no se usa para comparar nada.",
                )}
              {header("impressions", "Impresiones")}
              {header("date", "Fecha")}
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => (
              <tr key={p.row.id} className="border-b border-neutral-100 dark:border-neutral-900">
                <td className="max-w-md px-3 py-2">
                  <span className="line-clamp-2 text-neutral-700 dark:text-neutral-300">
                    {p.row.text || <em className="text-neutral-400">sin texto</em>}
                  </span>
                  <span className="mt-1 flex gap-2 text-xs text-neutral-400">
                    {p.features.hasLink && <span>link</span>}
                    {p.features.hasMedia && <span>media</span>}
                    {p.features.isReply && <span>reply</span>}
                    <span>{p.features.length} car.</span>
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-mono">{p.algoScore.toFixed(4)}</td>
                {hasProxy && (
                  <td className="px-3 py-2 text-right font-mono text-neutral-500">
                    {p.approxScore.toFixed(4)}
                  </td>
                )}
                <td className="px-3 py-2 text-right font-mono">
                  {p.row.impressions.toLocaleString("es")}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap text-neutral-500">
                  {p.row.date.toLocaleDateString("es")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasMore && (
        <div className="flex items-center justify-between text-xs text-neutral-500">
          <span>
            Mostrando {visible.length} de {sorted.length} posts
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setLimit((n) => n + 10)}
              className="rounded border border-neutral-300 px-3 py-1.5 font-medium text-neutral-900 dark:border-neutral-700 dark:text-neutral-100"
            >
              Ver 10 mas
            </button>
            <button
              onClick={() => setLimit(sorted.length)}
              className="underline underline-offset-2"
            >
              Ver todos
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
