import { readFile } from "node:fs/promises";
import { join } from "node:path";
import Link from "next/link";
import { Markdown } from "@/components/Markdown";

/**
 * Página estática que renderiza el README.md del repo como documentación
 * viva de la web. Server component: lee el fichero en build time y pasa
 * el contenido al cliente que renderiza Markdown.
 */
export default async function ReadmePage() {
  const readmePath = join(process.cwd(), "README.md");
  const content = await readFile(readmePath, "utf8");

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <Link
          href="/"
          className="text-sm text-neutral-500 underline underline-offset-2 hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          Volver
        </Link>
        <a
          href="https://github.com/xai-org/x-algorithm"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-neutral-500 underline underline-offset-2 hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          Repo oficial de xAI
        </a>
      </div>
      <Markdown content={content} />
    </main>
  );
}
