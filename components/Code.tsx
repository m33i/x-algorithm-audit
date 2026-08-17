const REPO = "https://github.com/xai-org/x-algorithm/blob/main/";

/**
 * Chip de código. Mismo tratamiento que el `code` inline de Markdown.tsx, para
 * que un identificador se lea igual venga de la UI o del diagnóstico pegado.
 */
const CHIP =
  "rounded border border-neutral-200 bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] text-neutral-800 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200";

/** Identificador o fragmento suelto: `t.co`, `has_media`, `TweetBoolFeatures`. */
export function Code({ children }: { children: React.ReactNode }) {
  return <code className={CHIP}>{children}</code>;
}

/**
 * Ruta del repo de xai-org/x-algorithm, enlazada a la línea exacta.
 *
 * `path` admite el mismo formato que `Finding.codeRef`: `fichero.rs`,
 * `fichero.rs:50` o `fichero.rs:195-200`. GitHub quiere el rango como
 * `#L195-L200`, de ahí la reescritura del guion.
 */
export function CodeRef({ path, label }: { path: string; label?: string }) {
  const [file, lines] = path.split(":");
  const hash = lines ? `#L${lines.replace("-", "-L")}` : "";

  return (
    <a
      href={`${REPO}${file}${hash}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`${CHIP} underline decoration-neutral-300 decoration-dotted underline-offset-2 transition-colors hover:border-neutral-400 hover:bg-neutral-200 dark:decoration-neutral-600 dark:hover:border-neutral-500 dark:hover:bg-neutral-700`}
      title={`Ver ${path} en el repositorio de xAI`}
    >
      {label ?? path}
    </a>
  );
}
