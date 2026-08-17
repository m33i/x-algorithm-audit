/**
 * Estadística no paramétrica para comparar cohortes de posts.
 *
 * Las distribuciones de engagement tienen cola pesada: un solo post viral
 * desplaza la media y produce conclusiones falsas. Por eso todo aquí
 * trabaja sobre medianas y rangos, nunca sobre medias.
 */

export function median(xs: number[]): number {
  if (xs.length === 0) throw new Error("median: array vacío");
  const s = [...xs].sort((x, y) => x - y);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

/** Cuantil con interpolación lineal. `q` en [0, 1]. */
export function quantile(xs: number[], q: number): number {
  if (xs.length === 0) throw new Error("quantile: array vacío");
  if (q < 0 || q > 1) throw new Error("quantile: q fuera de [0, 1]");
  const s = [...xs].sort((x, y) => x - y);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return s[lo];
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

/** Función error, aproximación de Abramowitz & Stegun 7.1.26. */
function erf(x: number): number {
  // erf(0) = 0 es una identidad exacta. La aproximación de A&S la viola por
  // ~1e-9 (sus cinco coeficientes suman 0.999999999, no 1), y ese error se
  // propaga a p = 0.999999999 en vez de 1 cuando dos grupos son idénticos.
  // El caso especial restaura la identidad y no toca el resto del dominio.
  if (x === 0) return 0;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * ax);
  const y =
    1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return sign * y;
}

/** Función de distribución acumulada de la normal estándar. */
export function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/**
 * Test U de Mann-Whitney (suma de rangos) con aproximación normal,
 * corrección por empates y corrección de continuidad.
 *
 * Devuelve `p` a dos colas. No paramétrico: apropiado para datos de
 * engagement, que no son normales ni de lejos.
 */
export function mannWhitneyU(
  a: number[],
  b: number[],
): { u: number; z: number; p: number } {
  const n1 = a.length;
  const n2 = b.length;
  if (n1 === 0 || n2 === 0) throw new Error("mannWhitneyU: grupo vacío");

  // Rangos sobre la muestra combinada, promediando los empates.
  const combined = [
    ...a.map((v) => ({ v, group: 0 as const })),
    ...b.map((v) => ({ v, group: 1 as const })),
  ].sort((x, y) => x.v - y.v);

  const ranks = new Array<number>(combined.length);
  const tieGroupSizes: number[] = [];
  let i = 0;
  while (i < combined.length) {
    let j = i;
    while (j + 1 < combined.length && combined[j + 1].v === combined[i].v) j++;
    const avgRank = (i + j + 2) / 2; // rangos 1-indexados
    for (let k = i; k <= j; k++) ranks[k] = avgRank;
    if (j > i) tieGroupSizes.push(j - i + 1);
    i = j + 1;
  }

  let r1 = 0;
  for (let k = 0; k < combined.length; k++) {
    if (combined[k].group === 0) r1 += ranks[k];
  }

  const u1 = r1 - (n1 * (n1 + 1)) / 2;
  const u2 = n1 * n2 - u1;
  const u = Math.min(u1, u2);

  const n = n1 + n2;
  const mu = (n1 * n2) / 2;
  const tieCorrection =
    tieGroupSizes.reduce((acc, t) => acc + (t * t * t - t), 0) / (n * (n - 1));
  const variance = ((n1 * n2) / 12) * (n + 1 - tieCorrection);

  // Sin varianza no hay señal: todos los valores están empatados.
  if (variance <= 0) return { u, z: 0, p: 1 };

  const sigma = Math.sqrt(variance);
  const z = Math.max(0, Math.abs(u - mu) - 0.5) / sigma;
  const p = 2 * (1 - normalCdf(z));

  return { u, z, p };
}
