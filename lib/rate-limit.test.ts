import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  checkRateLimit,
  resetRateLimits,
  rateLimitEntryCount,
  MAX_REQUESTS,
  WINDOW_MS,
  SWEEP_THRESHOLD,
} from "./rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    resetRateLimits();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("permite hasta MAX_REQUESTS en la ventana", () => {
    for (let i = 0; i < MAX_REQUESTS; i++) {
      expect(checkRateLimit("1.1.1.1").allowed).toBe(true);
    }
  });

  it("bloquea la petición siguiente", () => {
    for (let i = 0; i < MAX_REQUESTS; i++) checkRateLimit("1.1.1.1");
    const r = checkRateLimit("1.1.1.1");
    expect(r.allowed).toBe(false);
    expect(r.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("aísla las IPs entre sí", () => {
    for (let i = 0; i < MAX_REQUESTS; i++) checkRateLimit("1.1.1.1");
    expect(checkRateLimit("2.2.2.2").allowed).toBe(true);
  });

  it("vuelve a permitir cuando la ventana pasa", () => {
    for (let i = 0; i < MAX_REQUESTS; i++) checkRateLimit("1.1.1.1");
    expect(checkRateLimit("1.1.1.1").allowed).toBe(false);
    vi.advanceTimersByTime(WINDOW_MS + 1000);
    expect(checkRateLimit("1.1.1.1").allowed).toBe(true);
  });

  it("barre las IPs caducadas una vez el mapa supera SWEEP_THRESHOLD", () => {
    for (let i = 0; i < SWEEP_THRESHOLD; i++) {
      checkRateLimit(`10.0.0.${i}`);
    }
    expect(rateLimitEntryCount()).toBe(SWEEP_THRESHOLD);

    // Todas las entradas anteriores quedan fuera de la ventana.
    vi.advanceTimersByTime(WINDOW_MS + 1000);

    // Esta petición dispara el barrido oportunista antes de registrarse.
    checkRateLimit("nueva-ip");

    expect(rateLimitEntryCount()).toBe(1);
  });
});
