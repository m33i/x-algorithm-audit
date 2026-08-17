export function HowItWorks() {
  return (
    <section className="mx-auto mt-16 max-w-2xl space-y-6 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
      <div>
        <h2 className="mb-2 font-semibold text-neutral-900 dark:text-neutral-100">
          Cómo obtener el CSV
        </h2>
        <p>
          Entra en analytics.x.com, elige el periodo que quieras analizar y pulsa
          &ldquo;Export data&rdquo;. Cuantos más posts, más hallazgos: por debajo
          de 8 posts por grupo esta herramienta no concluye nada.
        </p>
      </div>

      <div>
        <h2 className="mb-2 font-semibold text-neutral-900 dark:text-neutral-100">
          Cómo se calcula
        </h2>
        <p>
          El 13 de agosto de 2026 xAI publicó el código que rankea el For You. Los
          pesos están en <code>home-mixer/params/param.rs</code>. Esta herramienta
          los aplica a tus posts.
        </p>
        <p className="mt-3">
          El propio código advierte de un malentendido: los pesos multiplican{" "}
          <em>probabilidades predichas</em>, no contadores brutos, y llama
          incorrecta la lectura de que &ldquo;un report cancela 468 likes&rdquo;.
          Por eso aquí cada acción se divide entre las impresiones, que es lo que
          convierte un contador en una probabilidad empírica.
        </p>
        <p className="mt-3 font-mono text-xs">
          AlgoScore = Σ ( peso × acción / impresiones )
        </p>
      </div>

      <div>
        <h2 className="mb-2 font-semibold text-neutral-900 dark:text-neutral-100">
          Lo que no se puede medir
        </h2>
        <p>
          El CSV solo deja observar un 30% del espacio de pesos positivos. El peso
          individual más alto del sistema —compartir copiando el enlace, 20.0— no
          es observable desde fuera, igual que las quotes, los DMs y todas las
          señales negativas. Ninguna herramienta puede medirlos. Esta lo dice.
        </p>
      </div>
    </section>
  );
}
