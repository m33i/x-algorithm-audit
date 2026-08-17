/**
 * Rate limiting por IP con ventana deslizante, en memoria del runtime.
 *
 * No sobrevive a un redeploy ni se comparte entre instancias. Es suficiente
 * para lo que protege: que nadie te vacíe la API key a base de refrescar.
 */

export const MAX_REQUESTS = 5;
export const WINDOW_MS = 60 * 60 * 1000;

const hits = new Map<string, number[]>();

export function checkRateLimit(ip: string): {
  allowed: boolean;
  retryAfterSeconds: number;
} {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);

  if (recent.length >= MAX_REQUESTS) {
    hits.set(ip, recent);
    const oldest = recent[0];
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((WINDOW_MS - (now - oldest)) / 1000),
    };
  }

  recent.push(now);
  hits.set(ip, recent);
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Solo para tests. */
export function resetRateLimits(): void {
  hits.clear();
}
