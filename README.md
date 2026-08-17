# x-algorithm-audit

Auditoría de una cuenta de X (Twitter) contra los pesos de ranking publicados
por xAI el 13 de agosto de 2026 en su repositorio abierto. Sube el CSV de
Account Analytics (`analytics.x.com`, Export data) y la herramienta devuelve,
sin enviar el CSV a ningún servidor:

- **AlgoScore** de cada post. Réplica del `positive_sum` del ranker real.
- **AlgoScore+**. Score aproximado que añade proxies para las señales de alto
  peso que el CSV no desglosa. Los proxies no son pesos del algoritmo.
- **Cobertura observacional**. Fracción del espacio de pesos positivos medible
  desde el CSV sin API.
- **Cobertura efectiva**. La misma cifra añadiendo los proxies.
- **Hallazgos priorizados** con evidencia estadística no paramétrica
  (Mann-Whitney U, p < 0.05, mínimo 8 posts por grupo).
- **Prompt auto-copiado** listo para pegar en un LLM y obtener un diagnóstico
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

Si xAI cambia un peso, esta herramienta lo refleja. Si no, no.

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

### `negative_sum` = 367.24

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

Convierte contadores en probabilidades por espectador. El AlgoScore es
monotonamente equivalente al score real del ranker (que se normaliza despues
con una transformacion afin en `ranking_scorer.rs:555-558`), no identico en
valor absoluto. Lo que importa es el orden entre posts, no el numero.

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
| `bookmarks`            | - (peso real 0.0)    | 0.0 en el AlgoScore. Proxy 6.0 en el AlgoScore+ |
| `profile visits`       | - (peso real 0.0)    | 0.0, sin proxy |
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
(proxy), `AnalysisReport.coverage` (real) vs `AnalysisReport.approxCoverage`
(proxy). Las comparaciones estadisticas de cohortes usan solo `algoScore`,
nunca `approxScore`.

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

`shareViaCopyLink` tiene peso 20.0, el mas alto del sistema. No es observable
desde el CSV. `bookmarks` tiene peso real 0.0 en el algoritmo (no aparece en
`ScoringWeights`), pero el CSV lo expone. Guardar un post para leerlo o
compartirlo despues es la intencion observable mas cercana a copy-link.

El peso proxy es 6.0. Es el punto medio del rango 4 a 8. No es un peso del
algoritmo: es una aproximacion consciente, marcada como tal en todos los
sitios donde aparece (UI, tipos, prompt del LLM, este README).

### Cobertura efectiva con proxies

- CSV nativo + bookmarks: (13.15 + 6.0) / 43.32 ~= 44%
- CSV enriquecido con quote + bookmarks: (18.15 + 6.0) / 43.32 ~= 56%

Se muestra como "44% con proxies" en la cabecera del reporte.

### Limitaciones de los proxies

- No son el score del ranker. No predicen el futuro.
- No sustituyen a copy-link real. Solo lo acotan de forma aproximada.
- No se usan para emitir hallazgos priorizados. Eso se hace con `algoScore`.
- La herramienta indica explicitamente que son proxies, no pesos reales.

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

- Presencia de enlace (excluyendo posts con media para evitar el confound
  t.co).
- Presencia de media.
- Reply vs original.
- Presencia de hashtags.
- Franja horaria (madrugada, mañana, tarde, noche).
- Dia de la semana.
- Longitud (cuartiles Q1, medio, Q3).

Para cada cohorte con dos grupos de n >= 8, aplica el test U de Mann-Whitney
(no parametrico, apropiado para distribuciones de cola pesada) con correccion
por empates y correccion de continuidad, y reporta p a dos colas. Solo marca
una cohorte como significativa si p < 0.05.

No esta en el codigo de X. Es estadistica sobre los posts del usuario, para
distinguir patron real de ruido.

### 4. Estimacion del multiplicador de diversidad perdido por rafaga

`ranking_scorer.rs:643-645` aplica el multiplicador `(1 - 0.25) * 0.5^k + 0.25`
al k-esimo post del mismo autor en un slate. El audit cuenta cuantos posts se
publicaron a menos de 1 hora del anterior y estima el multiplicador perdido
acumulado.

Es una estimacion, no una medicion: el decay se aplica sobre el slate del feed
de cada espectador, no sobre el historico. Se usa solo para emitir un hallazgo
de rafaga, no para cambiar el AlgoScore.

### 5. Deteccion de alcance desperdiciado

Identifica posts en el decil alto de impresiones (P90) que caen en el cuartil
bajo de AlgoScore (P25). Solo se emite el hallazgo si hay dispersion real de
impresiones (P90 >= 2 * mediana) y al menos 2 posts cumplen el criterio. Sin
dispersion, "decil alto" no significa nada.

No esta en el codigo de X. Es un patron empirico sobre la cuenta del usuario.

### 6. Muestra estratificada para el LLM

Toma hasta 5 mejores, 5 peores y 5 medianos posts por AlgoScore, sin solapar
ids, y los envuelve en un prompt autocontenido que se auto-copia al
portapapeles al llegar a esa seccion. El prompt incluye el system prompt de
rol, el contexto del algoritmo (pesos reales citados) y el payload JSON con
agregados, hallazgos, cohortes y muestra. El LLM devuelve un diagnostico
estructurado en 10 secciones (resumen ejecutivo, priorizacion por impacto,
analisis de cohortes significativas, reescrituras del bucket "peor", plan de
accion, metricas de seguimiento, etc.).

El CSV no se envia a ningun servidor. Solo agregados y una muestra de hasta 15
posts recortados a 2000 caracteres.

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

Los tests de `lib/weights.test.ts` y `lib/scoring.test.ts` verifican que los
pesos transcritos y las sumas son exactamente los del codigo fuente. Si xAI
cambia un peso, los tests fallan y la herramienta se actualiza.

Para reportar discrepancias entre este audit y el codigo oficial, abre un issue
en este repo con la referencia a la linea de `param.rs` o
`ranking_scorer.rs`.

## Licencia

MIT. Los pesos del algoritmo de X son de xAI bajo Apache 2.0
(`github.com/xai-org/x-algorithm`). Esta herramienta es independiente y no
esta afiliada a xAI.
