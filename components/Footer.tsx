/**
 * Pie global. Va en el layout, así que sale en todas las páginas.
 *
 * Dice dos cosas y para: que esto no es de X, y de dónde salen los pesos.
 * Lo segundo tiene que estar aquí y no solo en el repo, porque los pesos
 * transcritos de xAI se compilan dentro del bundle que descarga cada
 * visitante.
 */
export function Footer() {
  return (
    <footer className="mt-auto border-t border-neutral-200 dark:border-neutral-800">
      <p className="mx-auto max-w-3xl px-6 py-6 text-xs leading-relaxed text-neutral-500 dark:text-neutral-500">
        Herramienta independiente, no afiliada a X Corp. ni a xAI. Pesos de
        ranking transcritos de{" "}
        <a
          href="https://github.com/xai-org/x-algorithm"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          xai-org/x-algorithm
        </a>{" "}
        (xAI,{" "}
        <a
          href="https://www.apache.org/licenses/LICENSE-2.0"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          Apache 2.0
        </a>
        ). Tu CSV no sale del navegador.
      </p>
    </footer>
  );
}
