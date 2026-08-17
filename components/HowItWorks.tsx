export function HowItWorks() {
  return (
    <section className="mx-auto mt-16 max-w-2xl space-y-6 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <p>
          Pesos, fórmula del AlgoScore y cálculos extra:{" "}
          <a
            href="/readme"
            className="font-medium text-neutral-900 underline underline-offset-2 dark:text-neutral-100"
          >
            documentación completa
          </a>
          .
        </p>
      </div>

      <div>
        <h2 className="mb-2 font-semibold text-neutral-900 dark:text-neutral-100">
          Cómo obtener el CSV
        </h2>
        <p>
          Entra en analytics.x.com, elige el periodo y pulsa &ldquo;Export
          data&rdquo;. Hace falta un mínimo de 8 posts por grupo para emitir
          cualquier conclusión.
        </p>
      </div>

      <div>
        <h2 className="mb-2 font-semibold text-neutral-900 dark:text-neutral-100">
          Cómo se calcula
        </h2>
        <p>
          El 13 de agosto de 2026 xAI publicó el código que rankea el For You.
          Los pesos están en <code>home-mixer/params/param.rs</code>. Esta
          herramienta los aplica a tus posts.
        </p>
        <p className="mt-3">
          El código advierte que los pesos multiplican{" "}
          <em>probabilidades predichas</em>, no contadores brutos. Por eso aquí
          cada acción se divide entre las impresiones, que es lo que convierte
          un contador en una probabilidad empírica.
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
          El CSV nativo deja observar un 30% del espacio de pesos positivos. El
          peso más alto del sistema, compartir copiando el enlace (20.0), no es
          observable desde fuera. Tampoco las quotes (si no enriqueces el CSV
          con la API), los DMs ni las señales negativas.
        </p>
        <p className="mt-3">
          Hay una limitación más, y conviene tenerla presente al leer el
          hallazgo de enlaces: <strong>tampoco se puede detectar si un post
          lleva imagen o vídeo</strong>. El CSV no trae ninguna columna de
          media, y X acorta a <code>t.co</code> tanto los enlaces externos
          como los adjuntos, sin nada que los distinga. Por eso la cohorte de
          enlaces compara en realidad &ldquo;posts con algo adjunto&rdquo;
          contra &ldquo;posts de solo texto&rdquo;, y la cohorte de media
          casi siempre sale con muestra insuficiente.
        </p>
      </div>

      <div>
        <h2 className="mb-2 font-semibold text-neutral-900 dark:text-neutral-100">
          Por qué el algoritmo sí puede distinguirlo y nosotros no
        </h2>
        <p>
          Es una asimetría de acceso, no de ingenio, y se ve en el código
          publicado. Cada post que entra al ranker lleva un campo booleano
          explícito, <code>has_media</code>{" "}
          (<code>home-mixer/models/candidate.rs:50</code>), que no se infiere
          del texto: lo rellena un servicio dedicado consultando la propia
          base de datos de media de X{" "}
          (<code>candidate_hydrators/media_info_hydrator.rs</code>).
        </p>
        <p className="mt-3">
          Ese booleano llega al modelo tal cual, dentro de{" "}
          <code>TweetBoolFeatures</code>{" "}
          (<code>candidate.rs:195-200</code>), junto a{" "}
          <code>is_retweet</code>, <code>is_quote</code> e{" "}
          <code>is_reply</code>. Ninguno de los cuatro sale del texto: salen
          de si existen los identificadores correspondientes. Phoenix no
          adivina si hay una imagen: se lo dicen.
        </p>
        <p className="mt-3">
          El <code>t.co</code> es lo que queda cuando el post se{" "}
          <em>renderiza a texto</em>. La información estructurada (qué entidad
          era ese enlace acortado) se pierde en esa proyección, y el CSV de
          Analytics solo nos entrega la proyección. No hay forma de
          reconstruirla desde fuera: se probó usar los clics de URL como
          discriminador y no separa, porque un enlace que nadie clicó es
          indistinguible de una imagen.
        </p>
        <p className="mt-3">
          Lo resolvería la X API v2 con{" "}
          <code>expansions=attachments.media_keys</code>, que devuelve las
          entidades separadas: exactamente el mismo dato que el servicio
          interno le pasa al ranker. Esta herramienta no lo usa porque no
          requiere credenciales de API, y preferimos declarar el límite antes
          que estimarlo con una heurística que no se sostiene.
        </p>
        <p className="mt-3">
          Hay dos formas de reducir esa parte ciega, y conviene no
          confundirlas:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <strong>Quote count</strong> sí <em>aumenta</em> la cobertura: es
            el peso real 5.0 del algoritmo, y se activa si enriqueces el CSV
            con <code>public_metrics.quote_count</code> de la X API v2. Con esa
            columna la cobertura sube del 30% al 42%. Sin ella, queda fuera.
          </li>
          <li>
            <strong>Bookmarks</strong> <em>no</em> aumenta la cobertura: la
            estima. El bookmark no aparece en el struct de pesos del
            algoritmo, así que no tiene peso. Ojo, eso es distinto de valer
            0.0 como <code>profile_click</code>, que sí está en el struct
            puesto a cero. Esta herramienta lo usa como sustituto de
            share_via_copy_link con un peso de 6.0 <strong>inventado por
            nosotros</strong>, porque guardar un post es la intención más
            cercana que el CSV expone.
          </li>
        </ul>
        <p className="mt-3">
          Ese 6.0 es un juicio, no una medición: nadie sabe qué fracción de
          share_via_copy_link captura un bookmark. Por eso las contribuciones
          proxy van en un AlgoScore<sup>+</sup> aparte, nunca se suman al
          porcentaje de cobertura, y nunca entran en las comparaciones
          estadísticas. Sumar un peso inventado a la cobertura la inflaría con
          ficción, que es justo lo contrario de para qué existe esa cifra.
        </p>
      </div>
    </section>
  );
}
