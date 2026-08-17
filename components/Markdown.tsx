"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renderizador de Markdown a JSX con estilo consistente con el resto de la
 * app. Cliente porque react-markdown lo es.
 */
export function Markdown({ content }: { content: string }) {
  return (
    <div className="prose-xaa">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mt-10 mb-4 text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-8 mb-3 text-xl font-semibold text-neutral-900 dark:text-neutral-100">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-6 mb-2 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className="my-3 leading-relaxed text-neutral-700 dark:text-neutral-300">
              {children}
            </p>
          ),
          ul: ({ children }) => (
            <ul className="my-3 list-disc space-y-1 pl-6 text-neutral-700 dark:text-neutral-300">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-3 list-decimal space-y-1 pl-6 text-neutral-700 dark:text-neutral-300">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-neutral-900 underline underline-offset-2 dark:text-neutral-100"
            >
              {children}
            </a>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-neutral-900 dark:text-neutral-100">
              {children}
            </strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          code: ({ children, className }) => {
            const isBlock = className?.includes("language-");
            if (isBlock) {
              return (
                <code className="block font-mono text-xs">{children}</code>
              );
            }
            return (
              <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="my-4 overflow-x-auto rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-xs dark:border-neutral-800 dark:bg-neutral-900">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="my-4 overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="border-b border-neutral-300 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900">
              {children}
            </thead>
          ),
          th: ({ children }) => (
            <th className="px-3 py-2 text-left font-semibold text-neutral-900 dark:text-neutral-100">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-neutral-100 px-3 py-2 text-neutral-700 dark:border-neutral-900 dark:text-neutral-300">
              {children}
            </td>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-4 border-l-4 border-neutral-300 pl-4 italic text-neutral-600 dark:border-neutral-700 dark:text-neutral-400">
              {children}
            </blockquote>
          ),
          hr: () => (
            <hr className="my-8 border-neutral-200 dark:border-neutral-800" />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
