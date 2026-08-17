# x-algorithm-audit

Auditoría de una cuenta de X (Twitter) contra los pesos de ranking publicados
por xAI el 13 de agosto de 2026 en su repositorio abierto. Sube el CSV de
Account Analytics (`analytics.x.com`, Export data) y la herramienta devuelve,
sin enviar el CSV a ningún servidor:

- **AlgoScore** de cada post. Réplica del `positive_sum` del ranker real.
- **AlgoScore+**. Score aproximado que añade proxies para las señales de alto
  peso que el CSV no desglosa. Los proxies no son pesos del algoritmo. Solo
  aparece como columna si el CSV trae bookmarks; sin ellos sería idéntico al
  AlgoScore.
- **Cobertura observacional**. Fracción del espacio de pesos positivos medible
  desde el CSV. Los proxies NO la aumentan: estiman, no observan.
- **Peso estimado por proxy**. Cuánto vale en el algoritmo la señal que se
  está aproximando a ciegas. No es un porcentaje ni se suma a la cobertura.
- **Hallazgos priorizados**. Los de cohorte llevan test no paramétrico
  (Mann-Whitney U, p < 0.05 corregida por comparaciones múltiples, mínimo 8
  posts por grupo); el resto son agregados con suelo de muestra, sin test.
- **Prompt copiable** listo para pegar en un LLM y obtener un diagnóstico
  estructurado en 10 secciones.

El cálculo se hace en el navegador. Ningún endpoint recibe el CSV.

---

## Fuente oficial de los pesos

Los pesos son una transcripción literal del código publicado por xAI bajo
licencia Apache 2.0:

- Repositorio: <https://github.com/xai-org/x-algorithm>
- Fichero de pesos: `home-mixer/params/param.rs`
- Combinación de scores: `home-mixer/scorers/ranking_scorer.rs`
- Struct `ScoringWeights`: `ranking_scorer.rs:18-58`
- `positive_sum`, `negative_sum`, `total_sum`: `ranking_scorer.rs:105-128`
- Multiplicador de diversidad por autor: `ranking_scorer.rs:643-645`
- Parámetros de diversidad y OON: `param.rs:228-271`

La sincronización es **manual**: los tests fijan los pesos transcritos, así
que ningún cambio local pasa desapercibido, pero nada lee `param.rs` en tiempo
de ejecución. Si xAI cambia un peso, hay que actualizarlo a mano aquí.

---

## Pesos positivos (transcripción de `param.rs`)

| Acción                  | Peso   | Campo del algoritmo         | Referencia        |
| ----------------------- | ------ | --------------------------- | ----------------- |
| Favorite / Like         | 0.5    | `FavoriteWeight`            | `param.rs:308`    |
| Reply                   | 5.0    | `ReplyWeight`               | `param.rs:309`    |
| Reply con follow mutuo  | +15.0  | `BidirectionalFollowReplyWeightBoost` | `param.rs:311-315` (lleva la reply a 20.0) |
| Retweet / Repost        | 1.0    | `RetweetWeight`             | `param.rs:322`    |
| PhotoExpand             | 0.05   | `PhotoExpandWeight`         | `param.rs:323`    |
| VideoOpen               | 0.05   | `VideoOpenWeight`           | `param.rs:329`    |
| Click                   | 0.4    | `ClickWeight`               | `param.rs:335`    |
| OpenLink                | 0.2    | `OpenLinkWeight`            | `param.rs:336`    |
| ProfileClick            | 0.0    | `ProfileClickWeight`        | `param.rs:337`    |
| VQV (video_qual_view)   | 0.05   | `VqvWeight`                 | `param.rs:343`    |
| Share generico          | 2.0    | `ShareWeight`               | `param.rs:344`    |
| ShareViaDm              | 5.0    | `ShareViaDmWeight`          | `param.rs:345`    |
| ShareViaCopyLink        | 20.0   | `ShareViaCopyLinkWeight`    | `param.rs:351`    |
| Dwell                   | 0.0    | `DwellWeight`               | `param.rs:357`    |
| Quote                   | 5.0    | `QuoteWeight`               | `param.rs:358`    |
| QuotedClick             | 0.05   | `QuotedClickWeight`         | `param.rs:359`    |
| QuotedVQV               | 0.0    | `QuotedVqvWeight`           | `param.rs:365`    |
| FollowAuthor            | 4.0    | `FollowAuthorWeight`        | `param.rs:371`    |
| PostUnexplored          | 0.02   | `PostUnexploredWeight`      | `param.rs:377`    |
| ContDwellTime           | 0.004  | `ContDwellTimeWeight`       | `param.rs:401` (continuo, fuera de `positive_sum`) |
| ContClickDwellTime      | 0.0    | `ContClickDwellTimeWeight`  | `param.rs:407`    |
| ContActiveSecs5mResidualNorm | 0.0 | `ContActiveSecs5mResidualNormWeight` | `param.rs:443` |

### `positive_sum` = 43.32

Réplica literal de `ranking_scorer.rs:105-126`. Suma de todos los pesos
positivos distintos de cero, incluyendo `post_unexplored` (0.02) y excluyendo
`cont_dwell_time` (peso continuo, se aplica aparte). `profile_click` (0.0),
`dwell` (0.0), `quoted_vqv` (0.0) y `cont_click_dwell_time` (0.0) aparecen en
la suma del código pero no alteran el total.

---

## Pesos negativos (transcripción de `param.rs`)

| Acción         | Peso    | Campo del algoritmo   | Referencia     |
| -------------- | ------- | --------------------- | -------------- |
| NotInterested  | -43.2   | `NotInterestedWeight` | `param.rs:451` |
| BlockAuthor    | -31.2   | `BlockAuthorWeight`   | `param.rs:457` |
| MuteAuthor     | -58.8   | `MuteAuthorWeight`    | `param.rs:463` |
| Report         | -234.0  | `ReportWeight`        | `param.rs:468` |
| NotDwelled     | -0.02   | `NotDwelledWeight`    | `param.rs:470` |

### `negative_sum` = 367.22

Réplica de `ranking_scorer.rs:127`:
`-(not_interested + block + mute + report + not_dwelled)`.

Ninguno de estos pesos es observable desde el CSV de Analytics ni desde la
API v2 pública, salvo señales parciales. La herramienta lo indica en lugar de
inventarlos.

---

## Multiplicador de diversidad por autor

`ranking_scorer.rs:643-645`:

```
diversity_multiplier(decay, floor, k) = (1 - floor) * decay^k + floor
```

Con `AuthorDiversityDecay = 0.5` y `AuthorDiversityFloor = 0.25`
(`param.rs:228-238`):

| k (k-esimo post del mismo autor en un slate) | Multiplicador |
| --- | --- |
| 0 | 1.0 |
| 1 | 0.625 |
| 2 | 0.4375 |
| 3 | 0.34375 |
| 4 | 0.296875 |
| >= ~50 | 0.25 (suelo) |

El audit estima el multiplicador perdido por publicar en rafaga (varios posts
en menos de 1 hora). Es una estimacion: el decay se aplica sobre el slate del
feed de cada usuario, no sobre el historico de publicacion.

### Pesos OON (out-of-network)

- `OonWeightFactor = 0.75` (`param.rs:247-251`). Multiplica los pesos de posts
  fuera de la red del espectador.
- `TopicOonWeightFactor = 0.5` (`param.rs:267-271`). Idem para topicos OON.

No se aplican en el audit porque el CSV no expone a quien se le sirvio cada
post. Se documentan por completitud.

---

## Como se calcula el AlgoScore

### La formula del ranker

`param.rs:283-293` advierte que los pesos multiplican probabilidades predichas,
no contadores brutos. La probabilidad base de un Report es mas de 1000x mas
baja que la de un Like, por eso su peso es tan alto.

Para replicar eso con datos observados (no predicciones del modelo), esta
herramienta usa la probabilidad empirica:

```
P(accion) = accion / impresiones

AlgoScore = suma( peso_i * P(accion_i) )
          = suma( peso_i * accion_i / impresiones )
```

Convierte contadores en probabilidades por espectador, que es lo que hace
comparables dos posts de alcance muy distinto.

Cuidado con exagerar lo que eso significa. La normalizacion afin que el ranker
aplica despues (`ranking_scorer.rs:555-558`) si preserva el orden, pero el
AlgoScore **no** es monotonamente equivalente al score del ranker: cubre ~30%
de los pesos positivos y 0% de los negativos, sustituye las probabilidades que
predice el modelo por tasas empiricas a posteriori, y no aplica los
multiplicadores de diversidad ni de OON. La equivalencia vale para la parte
observable del positive_sum, bajo el supuesto de que la tasa empirica aproxima
la probabilidad predicha. Lo que importa es el orden relativo entre TUS posts,
no el numero ni su relacion con el score real.

### Que acciones son observables desde el CSV

El CSV de Account Analytics expone estas columnas. La herramienta las mapea a
acciones del algoritmo:

| Columna CSV            | Accion del algoritmo | Peso  |
| ---------------------- | -------------------- | ----- |
| `impressions`          | (denominador)        | -     |
| `likes`                | favorite             | 0.5   |
| `replies`              | reply                | 5.0   |
| `reposts` / `retweets` | retweet              | 1.0   |
| `shares`               | share                | 2.0   |
| `new follows`          | followAuthor         | 4.0   |
| `detail expands` + `permalink clicks` | click | 0.4 (se suman bajo un solo peso, sin duplicar) |
| `url clicks`           | openLink             | 0.2   |
| `media views`          | photoExpand          | 0.05 (una sola vez, no triplica para video_open + vqv) |
| `bookmarks`            | - (ausente del struct) | 0.0 en el AlgoScore. Proxy 6.0 en el AlgoScore+ |
| `profile visits`       | profileClick (0.0 en el struct) | 0.0, sin proxy |
| `engagements`, `hashtag clicks` | -          | informativo, sin peso |

### `quote` (peso real 5.0)

`QuoteWeight = 5.0` (`param.rs:358`). El CSV nativo de Account Analytics no
expone `quote_count`, asi que el peso real de quote queda fuera del AlgoScore
por defecto. La X API v2 lo expone como `public_metrics.quote_count`. Si
enriqueces el CSV con una columna `quote_count` (alias aceptados: `quotecount`,
`quotes`, `quote`), la herramienta activa el peso real 5.0. Sin esa columna,
quote cuenta como no observable.

### Acciones no observables desde el CSV

Estas señales las pondera el algoritmo pero ningun CSV ni API publica las
desglosa para tus posts:

| Accion              | Peso  | Por que no es observable |
| ------------------- | ----- | ------------------------ |
| `shareViaCopyLink`  | 20.0  | El `shares` del CSV es un agregado. X no desglosa Copy Link vs DM vs otros. Tiene codigos internos en las URLs de share, pero no los expone. |
| `shareViaDm`        | 5.0   | Idem. |
| `quotedClick`       | 0.05  | Requiere contexto del feed del espectador. |
| `postUnexplored`    | 0.02  | Solo in-network. Requiere contexto del slate. |
| `contDwellTime`     | 0.004 | El CSV no expone dwell time por post. |
| Todas las negativas | -     | No se desglosan por post para creadores. |
| `reply` con boost bidireccional | +15.0 (a 20.0) | Requiere saber si el espectador te sigue mutuamente. |

La herramienta lista estas limitaciones de forma explicita.

### Cobertura observacional

```
cobertura = (pesos reales cuyas columnas estan presentes) / positive_sum
```

- CSV nativo completo (sin `quote_count`): 13.15 / 43.32 ~= 30%
- CSV enriquecido con `quote_count`: 18.15 / 43.32 ~= 42%

Es lo que se puede medir contra el algoritmo. El resto es ruido o invencion.

---

## Proxies (no son pesos del algoritmo)

Esta seccion es la parte que NO es transcripcion del codigo de xAI. Los
proxies son una adicion de esta herramienta para acotar la parte inobservable
del algoritmo. Estan separados del score real en todos los sitios donde
aparecen: `ScoreBreakdown.algoScore` (real) vs `ScoreBreakdown.approxScore`
(con proxies). Las comparaciones estadisticas de cohortes usan solo
`algoScore`, nunca `approxScore`.

`AnalysisReport.coverage` mide solo lo observado de verdad y los proxies no
la tocan. `AnalysisReport.proxiedWeight` dice, aparte, cuanto vale en el
algoritmo la señal que se esta estimando.

### Que es un proxy

Un proxy es una señal que el CSV expone y que el algoritmo no pondera
directamente, pero que esta correlacionada con una señal de alto peso que el
algoritmo si pondera y que el CSV no desglosa. La herramienta usa el proxy como
sustituto aproximado de la señal inobservable.

### Proxies usados

| Proxy       | Columna CSV  | Sustituye a              | Peso real del sustituto | Peso proxy |
| ----------- | ------------ | ------------------------ | ----------------------- | ---------- |
| Bookmarks   | `bookmarks`  | `shareViaCopyLink`       | 20.0                    | 6.0        |

### Justificacion del proxy bookmarks

`shareViaCopyLink` tiene peso 20.0, el mas alto del sistema, y no es
observable desde el CSV. `bookmarks` si lo expone el CSV, y guardar un post
para leerlo o compartirlo despues es la intencion observable mas cercana a
copiar el enlace.

Precision que importa: `bookmarks` **no aparece** en el struct
`ScoringWeights` (`ranking_scorer.rs:18-58`), asi que no tiene peso. Eso no
es lo mismo que tener peso 0.0, que es el caso de `profile_click`, que si
esta en el struct puesto a cero.

El peso proxy es 6.0 y es un **juicio**, no una medicion. Nadie ha medido que
fraccion de `shareViaCopyLink` captura un bookmark, y no existe ninguna
fuente que fije ese numero. Se eligio por debajo del 20.0 que sustituye para
no sobreponderar una hipotesis, y por encima de los pesos de acciones baratas
(click 0.4) para reflejar que guardar señala intencion alta. Es discutible;
lo que no es admisible es presentarlo como un dato del algoritmo.

### Por que los proxies NO suman a la cobertura

Seria tentador reportar "(13.15 + 6.0) / 43.32 ~= 44% de cobertura". Es
incorrecto y se elimino de la herramienta.

El denominador 43.32 es la suma de los pesos reales, y su composicion incluye
`shareViaCopyLink: 20.0`. El 6.0 del proxy **no es un componente de esos
43.32**. Sumarlo al numerador mezcla unidades: el cociente deja de ser
fraccion de nada real e infla la cobertura con un numero inventado,
justamente en la metrica cuya funcion es demostrar honestidad.

Lo que se reporta:

- `coverage` = pesos reales observados / 43.32. CSV nativo: **~30%**. CSV
  enriquecido con `quote_count`: **~42%** (ahi si sube, porque `quote` es un
  peso real del algoritmo, no un proxy).
- `proxiedWeight` = peso real de la señal que se esta estimando. Con
  bookmarks presentes: **20.0**. No es un porcentaje.

### Limitaciones de los proxies

- No son el score del ranker. No predicen el futuro.
- No sustituyen a copy-link real. Solo lo aproximan sin forma de validarlo.
- No entran en las cohortes ni en los hallazgos. Eso se hace con `algoScore`.
- No aumentan la cobertura reportada.

---

## Calculos extra (no estan en el codigo de X)

Todo lo siguiente es adicional al ranker real. Esta separado en la UI y en los
tipos. Las comparaciones estadisticas de cohortes usan siempre `algoScore` (el
real), nunca `approxScore`.

### 1. AlgoScore+ y pesos proxy

Descrito arriba, en la seccion Proxies.

### 2. Ratio replies / likes

No es un peso del algoritmo. Es un indicador de composicion del engagement.
Como `reply` pesa 10x `favorite` (5.0 vs 0.5), y hasta 40x con el boost
bidireccional, un ratio replies/likes por debajo del 5% sugiere cultivo de
likes baratos en vez de replies caros. El audit emite un hallazgo de severidad
alta si se da ese patron con muestra suficiente.

Referencia a los pesos reales: `param.rs:308-310`.

### 3. Cohortes con test U de Mann-Whitney

El audit agrupa los posts por:

- Presencia de enlace acortado. **Con un CSV nativo esto compara "posts con
  algo adjunto" contra "posts de solo texto", no "con enlace" contra "sin
  enlace"** — ver la advertencia de abajo.
- Presencia de media. Con un CSV nativo esta cohorte siempre sale con muestra
  insuficiente, por el mismo motivo.
- Reply vs original.
- Presencia de hashtags.
- Franja horaria (madrugada, mañana, tarde, noche). Solo existe si el CSV trae
  hora — ver la advertencia de abajo.
- Dia de la semana.
- Longitud (cuartiles Q1, medio, Q3).

Para cada cohorte con dos grupos de n >= 8, aplica el test U de Mann-Whitney
(no parametrico, apropiado para distribuciones de cola pesada) con correccion
por empates y correccion de continuidad, y reporta p a dos colas. Solo marca
una cohorte como significativa si p < 0.05.

No esta en el codigo de X. Es estadistica sobre los posts del usuario, para
distinguir patron real de ruido.

#### Advertencia: el export nativo no trae hora del dia

La columna `Date` del CSV de Account Analytics trae la fecha sin la hora, asi
que todos los posts se parsean a medianoche. Cuando `findings.ts` detecta que
no hay informacion horaria (`hasTimeOfDay`), suprime tres cosas en vez de
fabricarlas:

- La cohorte de franja horaria, que compararia cuatro grupos identicos.
- El hallazgo de publicacion en rafaga, que sin horas contaria como
  simultaneos todos los posts de un mismo dia.
- Cualquier lectura de rendimiento por hora en la interfaz.

No es que la cohorte "no salga": es una supresion deliberada. Enriquecer el
CSV con marcas de tiempo desde la X API v2 reactiva las tres.

#### Advertencia: la media no es detectable desde un CSV nativo

Verificado contra un export real de 457 posts. Sus 17 cabeceras son: `Post
id`, `Date`, `Post text`, `Post Link`, `Impressions`, `Likes`, `Engagements`,
`Bookmarks`, `Shares`, `New follows`, `Replies`, `Reposts`, `Profile visits`,
`Detail Expands`, `URL Clicks`, `Hashtag Clicks`, `Permalink Clicks`.

**No hay ninguna columna de media.** Y X ya no emite `pic.x.com` en el texto:
en ese mismo export habia 391 `t.co` y cero `pic.x.com`. Como X acorta a
`t.co` tanto los enlaces externos como los adjuntos, un post con imagen es
indistinguible de un post con enlace.

Se probo usar `URL Clicks > 0` como discriminador y no separa: de 370 posts
con `t.co`, 71 tenian cero clics — indistinguibles de un enlace que nadie
clico. Ademas 7 posts sin `t.co` registraban clics.

Consecuencias, que la herramienta declara en vez de disimular:

- `hasMedia` es siempre `false` con un CSV nativo.
- La cohorte `media` sale siempre con muestra insuficiente. No significa que
  la cuenta no publique imagenes: significa que no se pueden detectar.
- El filtro de `linkCohort` que excluye posts con media no excluye nada, asi
  que el hallazgo describe explicitamente que compara "algo adjunto" contra
  "solo texto", y atribuye el efecto tanto a `open_link` (0.2) como a
  `photo_expand` (0.05), que apuntan en la misma direccion.

Enriquecer el CSV con una columna de media desde la X API reactiva el filtro
y separa los dos efectos.

#### Como lo distingue el algoritmo de X (y por que nosotros no)

Merece la pena entenderlo, porque explica que el limite es de acceso al dato,
no de ingenio, y descarta buscar heuristicas mejores.

X no lo infiere del texto. Cada post candidato lleva un campo booleano
explicito:

```rust
// home-mixer/models/candidate.rs:50
pub has_media: Option<bool>,
```

Lo rellena un servicio dedicado, no un parser:
`candidate_hydrators/media_info_hydrator.rs` consulta un
`MediaInfoCacheClient` que devuelve un `TweetMediaInfo` con el flag ya
resuelto y las duraciones de video. X pregunta a su propia base de datos de
media.

Y ese booleano llega al modelo tal cual:

```rust
// home-mixer/models/candidate.rs:195-200
tweet_bool_features: Some(TweetBoolFeatures {
    has_media: self.has_media.unwrap_or(false),
    is_retweet: self.retweeted_tweet_id.is_some(),
    is_quote:   self.quoted_tweet_id.is_some(),
    is_reply:   self.in_reply_to_tweet_id.is_some(),
    ..Default::default()
}),
```

Los cuatro booleanos salen de identificadores estructurados, no del texto.
Phoenix no adivina si hay una imagen: se lo dicen.

El `t.co` es lo que queda cuando el post se **renderiza a texto**. La
informacion estructurada —que entidad era ese enlace acortado— se pierde en
esa proyeccion, y el CSV de Analytics solo entrega la proyeccion. Por eso
ninguna heuristica sobre el texto o sobre los contadores la recupera.

La via real es la X API v2 con `expansions=attachments.media_keys` o
`tweet.fields=entities`, que devuelve `urls` y `media` como entidades
separadas: el mismo dato que el servicio interno le pasa al ranker. Esta
herramienta no la usa porque no quiere exigir credenciales de API. El limite
se declara en vez de estimarse.

### 4. Estimacion del multiplicador de diversidad perdido por rafaga

`ranking_scorer.rs:643-645` aplica el multiplicador `(1 - 0.25) * 0.5^k + 0.25`
al k-esimo post del mismo autor en un slate. El audit cuenta cuantos posts se
publicaron a menos de 1 hora del anterior y estima el multiplicador perdido
acumulado.

Es una estimacion, no una medicion: el decay se aplica sobre el slate del feed
de cada espectador, no sobre el historico. Se usa solo para emitir un hallazgo
de rafaga, no para cambiar el AlgoScore.

Con el export nativo este hallazgo no se emite nunca, porque sin hora del dia
todos los posts de una misma fecha parecerian publicados a la vez. Ver la
advertencia sobre la columna `Date`.

### 5. Deteccion de alcance desperdiciado

Identifica posts en el decil alto de impresiones (P90) que caen en el cuartil
bajo de AlgoScore (P25). Solo se emite el hallazgo si hay dispersion real de
impresiones (P90 >= 2 * mediana) y al menos 2 posts cumplen el criterio. Sin
dispersion, "decil alto" no significa nada.

No esta en el codigo de X. Es un patron empirico sobre la cuenta del usuario.

### 6. Muestra de posts para el LLM

Los buckets `"mejor"` y `"peor"` son siempre los 5 posts de cada extremo por
AlgoScore. Ese 5 no es estetico: son los que disparan las reescrituras del
prompt, asi que subirlo sube el trabajo que se le pide al LLM. El bucket
`"mediano"` se lleva el resto del presupuesto, hasta 120 posts o 60.000
caracteres de texto, lo que se agote antes.

Por debajo de ese tope la muestra son *todos* los posts de la cuenta. Por
encima, el relleno se reparte de forma uniforme a lo largo del ranking de
AlgoScore en vez de coger los primeros que caigan, para que cubra todo el
rango. El payload incluye `sampleIsComplete` para que el LLM sepa si esta
viendo la cuenta entera o una muestra: con una muestra tiene prohibido inferir
proporciones globales ("el 40% de tus posts lleva enlace" seria el 40% de la
muestra, no de la cuenta).

El prompt es autocontenido: rol, contexto del algoritmo con los pesos reales
citados, ejemplos del nivel de detalle esperado, estructura obligatoria de
salida y el payload JSON con agregados, hallazgos, cohortes y muestra. El LLM
devuelve un diagnostico estructurado en 10 secciones (resumen ejecutivo,
priorizacion por impacto, cohortes significativas, patrones entre mejores y
peores, reescrituras del bucket `"peor"`, limitaciones, plan de accion y
metricas de seguimiento).

El CSV no se envia a ningun servidor, y tampoco conviene adjuntarlo al chat
junto al prompt: si el LLM ve las columnas crudas se pone a recalcular sin
dividir entre impresiones y sin los pesos correctos, y sus numeros acaban
mezclados con los del audit. La muestra va para leer textos, no para hacer
aritmetica con ella.

---

## Lo que esta herramienta no hace

- No llama a la API de X. No tiene clave de API, no la pide, no la usa.
- No envia el CSV a ningun servidor. Todo el calculo es client-side.
- No inventa señales no observables (copy-link shares reales, DMs, dwell time,
  negativas). Lo indica de forma explicita.
- No usa `approxScore` para las comparaciones estadisticas. Solo `algoScore`.
- No predice el score futuro. Solo interpreta el pasado con los pesos actuales.

---

## Como se verifica todo esto

Cada peso, formula y referencia se puede verificar contra el repo oficial de
xAI:

```bash
git clone https://github.com/xai-org/x-algorithm
cd x-algorithm
grep -n "FavoriteWeight" home-mixer/params/param.rs
grep -n "positive_sum" home-mixer/scorers/ranking_scorer.rs
```

Los tests de `lib/weights.test.ts` y `lib/scoring.test.ts` fijan los pesos
transcritos y las sumas, asi que ninguna edicion local pasa desapercibida
(cambiar `favorite` a 0.6 rompe 12 tests).

Lo que **no** hacen: leer `param.rs`. Reafirman los mismos literales que
declara `lib/weights.ts`, asi que si xAI cambiara un peso manana, todos los
tests seguirian en verde. La sincronizacion con el upstream es manual, y esa
es la razon de que cada constante lleve su `fichero:linea`: para que
verificarla a mano cueste diez segundos.

Para reportar discrepancias entre este audit y el codigo oficial, abre un issue
en este repo con la referencia a la linea de `param.rs` o
`ranking_scorer.rs`.

## Licencia

MIT. Los pesos del algoritmo de X son de xAI bajo Apache 2.0
(`github.com/xai-org/x-algorithm`). Esta herramienta es independiente y no
esta afiliada a xAI.
