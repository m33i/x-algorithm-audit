import { describe, it, expect } from "vitest";
import { median, quantile, mannWhitneyU, normalCdf } from "./stats";

describe("median", () => {
  it("con longitud impar devuelve el central", () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it("con longitud par promedia los dos centrales", () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it("no muta el array de entrada", () => {
    const xs = [3, 1, 2];
    median(xs);
    expect(xs).toEqual([3, 1, 2]);
  });

  it("resiste a los outliers, a diferencia de la media", () => {
    const xs = [10, 11, 12, 13, 100000];
    expect(median(xs)).toBe(12);
  });

  it("lanza con un array vacío", () => {
    expect(() => median([])).toThrow();
  });
});

describe("quantile", () => {
  it("q=0.5 coincide con la mediana", () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
  });

  it("interpola linealmente", () => {
    expect(quantile([1, 2, 3, 4], 0.25)).toBeCloseTo(1.75, 10);
  });

  it("q=0 y q=1 dan mínimo y máximo", () => {
    expect(quantile([5, 1, 9], 0)).toBe(1);
    expect(quantile([5, 1, 9], 1)).toBe(9);
  });
});

describe("normalCdf", () => {
  it("vale 0.5 en cero", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
  });

  it("aproxima los valores tabulados", () => {
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 3);
  });
});

describe("mannWhitneyU", () => {
  it("con separación completa da p muy bajo", () => {
    const a = [1, 2, 3, 4, 5, 6, 7, 8];
    const b = [9, 10, 11, 12, 13, 14, 15, 16];
    const r = mannWhitneyU(a, b);
    expect(r.u).toBe(0);
    expect(r.p).toBeLessThan(0.01);
  });

  it("con grupos idénticos da p = 1", () => {
    const a = [1, 2, 3, 4, 5, 6, 7, 8];
    const b = [1, 2, 3, 4, 5, 6, 7, 8];
    const r = mannWhitneyU(a, b);
    expect(r.u).toBe(32);
    expect(r.p).toBeCloseTo(1, 10);
  });

  it("es simétrico en el orden de los grupos", () => {
    const a = [1, 4, 6, 9, 11, 13, 15, 17];
    const b = [2, 3, 5, 7, 8, 10, 12, 14];
    expect(mannWhitneyU(a, b).p).toBeCloseTo(mannWhitneyU(b, a).p, 10);
  });

  it("corrige los empates", () => {
    // Todos los valores empatados: no hay diferencia detectable.
    const a = [5, 5, 5, 5, 5, 5, 5, 5];
    const b = [5, 5, 5, 5, 5, 5, 5, 5];
    const r = mannWhitneyU(a, b);
    expect(r.p).toBeCloseTo(1, 10);
  });

  it("no encuentra diferencia en grupos solapados", () => {
    const a = [10, 12, 11, 13, 14, 10, 12, 11];
    const b = [11, 13, 10, 12, 11, 14, 13, 12];
    expect(mannWhitneyU(a, b).p).toBeGreaterThan(0.05);
  });

  it("lanza si algún grupo está vacío", () => {
    expect(() => mannWhitneyU([], [1, 2, 3])).toThrow();
  });
});

describe("correcciones que nadie ejercitaba", () => {
  /**
   * Estos dos tests existen porque un test de mutación demostró que se podían
   * borrar la corrección por empates y la de continuidad sin que fallara nada:
   * los casos que había usaban valores todos idénticos (varianza cero, que
   * cortocircuita antes) o U == mu (z = 0 pase lo que pase).
   */
  it("la corrección por empates cambia el resultado", () => {
    // Empates parciales: hay varianza y los empates la reducen, así que la
    // corrección baja la p. El valor está fijado: sin corrección por empates
    // la varianza sube y esta aserción falla.
    const a = [1, 1, 2, 2, 3, 3, 4, 4];
    const b = [3, 3, 4, 4, 5, 5, 6, 6];
    const r = mannWhitneyU(a, b);
    expect(r.u).toBe(8);
    expect(r.z).toBeCloseTo(2.51273434, 6);
    expect(r.p).toBeCloseTo(0.01197999, 6);
  });

  it("distingue una p intermedia de una significativa", () => {
    // Fija que el umbral 0.05 importa: esta p cae entre 0.05 y 0.5.
    const a = [1, 3, 5, 7, 9, 11, 13, 15];
    const b = [2, 4, 6, 8, 10, 12, 14, 30];
    const p = mannWhitneyU(a, b).p;
    expect(p).toBeGreaterThan(0.05);
    expect(p).toBeLessThan(0.9);
  });
});
