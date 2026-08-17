import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resetRateLimits, checkRateLimit, MAX_REQUESTS } from "@/lib/rate-limit";

const { mockParse } = vi.hoisted(() => ({ mockParse: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(function AnthropicMock() {
    return { messages: { parse: mockParse } };
  }),
}));

vi.mock("@anthropic-ai/sdk/helpers/zod", () => ({
  zodOutputFormat: vi.fn(() => ({})),
}));

// Import después de declarar los mocks: vi.mock se hoistea igualmente,
// pero mantenemos el orden legible de "primero mock, luego sujeto bajo test".
const { POST } = await import("./route");

const validPayload = {
  postCount: 10,
  medianAlgoScore: 0.5,
  coverage: 0.8,
  findings: [],
  cohorts: [],
  samplePosts: [],
};

const validDiagnosis = {
  summary: "Resumen de prueba.",
  priorities: [],
  rewrites: [],
};

function makeRequest(body: unknown = validPayload, headers?: Record<string, string>): Request {
  return new Request("http://localhost/api/diagnose", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/diagnose", () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    resetRateLimits();
    mockParse.mockReset();
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
  });

  it("responde 503 si falta ANTHROPIC_API_KEY", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await POST(makeRequest());
    expect(res.status).toBe(503);
    expect(mockParse).not.toHaveBeenCalled();
  });

  it("responde 400 con un payload inválido", async () => {
    const res = await POST(makeRequest({ postCount: "no-es-un-numero" }));
    expect(res.status).toBe(400);
    expect(mockParse).not.toHaveBeenCalled();
  });

  it("responde 429 con Retry-After cuando se agota el rate limit", async () => {
    // Agota el cubo de la IP "unknown" (sin cabeceras de proxy) directamente,
    // sin depender de que el mock de Anthropic resuelva con éxito 5 veces.
    for (let i = 0; i < MAX_REQUESTS; i++) checkRateLimit("unknown");

    const res = await POST(makeRequest());
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
    expect(mockParse).not.toHaveBeenCalled();
  });

  it("responde 502 cuando el modelo rechaza responder (stop_reason refusal)", async () => {
    mockParse.mockResolvedValue({ stop_reason: "refusal", parsed_output: null });
    const res = await POST(makeRequest());
    expect(res.status).toBe(502);
  });

  it("responde 502 cuando parsed_output llega null", async () => {
    mockParse.mockResolvedValue({ stop_reason: "end_turn", parsed_output: null });
    const res = await POST(makeRequest());
    expect(res.status).toBe(502);
  });

  it("responde 200 con el diagnóstico en el caso feliz", async () => {
    mockParse.mockResolvedValue({
      stop_reason: "end_turn",
      parsed_output: validDiagnosis,
    });
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ diagnosis: validDiagnosis });
  });

  it("responde 500 si el SDK lanza", async () => {
    mockParse.mockRejectedValue(new Error("network boom"));
    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
  });
});
