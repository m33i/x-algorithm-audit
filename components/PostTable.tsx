"use client";

import { useMemo, useState } from "react";
import type { ScoredPost } from "@/lib/cohorts";

type SortKey = "algoScore" | "impressions" | "date";

export function PostTable({ posts }: { posts: ScoredPost[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("algoScore");
  const [asc, setAsc] = useState(false);

  const sorted = useMemo(() => {
    const value = (p: ScoredPost) =>
      sortKey === "algoScore"
        ? p.algoScore
        : sortKey === "impressions"
          ? p.row.impressions
          : p.row.date.getTime();
    return [...posts].sort((a, b) => (asc ? value(a) - value(b) : value(b) - value(a)));
  }, [posts, sortKey, asc]);

  function header(key: SortKey, label: string) {
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
    <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
      <table className="w-full text-sm">
        <thead className="border-b border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Post</th>
            {header("algoScore", "AlgoScore")}
            {header("impressions", "Impresiones")}
            {header("date", "Fecha")}
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
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
  );
}
