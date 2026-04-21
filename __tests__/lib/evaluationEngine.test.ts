import { describe, it, expect, vi, beforeEach } from "vitest";
import { createEvalEngine, type EvalEngineConfig } from "@/lib/evaluation-engine";

vi.mock("@/lib/llm-client", () => ({
  openRouterChat: vi.fn().mockResolvedValue({ ok: false, content: null, emptyContent: true }),
}));

vi.mock("@/lib/evaluationLogger", () => ({
  appendEvaluationLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/db", () => ({
  dbMarkSeen: vi.fn(),
}));

vi.mock("@/lib/rateLimit", () => ({
  extractIp: () => "127.0.0.1",
  isRateLimited: () => false,
}));

vi.mock("@/lib/eval-cache", () => ({
  getCached: () => null,
  setCache: vi.fn(),
  jobTextHash: (s: string) => s.slice(0, 16).padEnd(16, "0"),
}));

function makeConfig(overrides?: Partial<EvalEngineConfig>): EvalEngineConfig {
  return {
    mode: "sidehustle",
    getSystemPrompt: () => "test system prompt",
    repairPrompt: "repair",
    validate: (parsed) => ({ ok: true, result: parsed }),
    validateLoose: (parsed) => parsed,
    buildLogMeta: () => undefined,
    getGermanCheckText: () => "",
    cacheNamespace: `test_${Date.now()}_${Math.random()}`,
    globalStoreKey: `__test_${Date.now()}_${Math.random()}`,
    ...overrides,
  };
}

describe("createEvalEngine", () => {
  it("returns GET and POST handlers", () => {
    const engine = createEvalEngine(makeConfig());
    expect(typeof engine.GET).toBe("function");
    expect(typeof engine.POST).toBe("function");
    expect(typeof engine.evaluateWithPolicy).toBe("function");
  });

  it("uses mode-specific config", () => {
    const sidehustle = createEvalEngine(makeConfig({ mode: "sidehustle" }));
    const quickCash = createEvalEngine(makeConfig({ mode: "quick_cash" }));
    expect(sidehustle).not.toBe(quickCash);
    expect(typeof sidehustle.POST).toBe("function");
    expect(typeof quickCash.POST).toBe("function");
  });

  it("isolates job stores between engines", () => {
    const engineA = createEvalEngine(makeConfig({ globalStoreKey: `__iso_a_${Date.now()}` }));
    const engineB = createEvalEngine(makeConfig({ globalStoreKey: `__iso_b_${Date.now()}` }));
    expect(engineA).not.toBe(engineB);
  });
});

describe("GET handler", () => {
  it("returns 400 when jobId is missing", async () => {
    const engine = createEvalEngine(makeConfig());
    const req = new Request("http://localhost/api/evaluate");
    const res = await engine.GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("jobId");
  });

  it("returns 404 for unknown jobId", async () => {
    const engine = createEvalEngine(makeConfig());
    const req = new Request("http://localhost/api/evaluate?jobId=nonexistent");
    const res = await engine.GET(req);
    expect(res.status).toBe(404);
  });
});

describe("POST handler", () => {
  beforeEach(() => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key-123");
  });

  it("returns 400 for invalid JSON body", async () => {
    const engine = createEvalEngine(makeConfig());
    const req = new Request("http://localhost/api/evaluate", {
      method: "POST",
      body: "not json",
    });
    const res = await engine.POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when jobText is empty", async () => {
    const engine = createEvalEngine(makeConfig());
    const req = new Request("http://localhost/api/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobText: "" }),
    });
    const res = await engine.POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 202 with jobId for async requests", async () => {
    const engine = createEvalEngine(makeConfig());
    const jobText = "A".repeat(100);
    const req = new Request("http://localhost/api/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobText, async: true }),
    });
    const res = await engine.POST(req);
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(typeof body.jobId).toBe("string");
  });

  it("deduplicates in-flight async jobs with same text", async () => {
    const engine = createEvalEngine(makeConfig());
    const jobText = "B".repeat(100);

    const req1 = new Request("http://localhost/api/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobText, async: true }),
    });
    const res1 = await engine.POST(req1);
    const body1 = await res1.json();

    const req2 = new Request("http://localhost/api/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobText, async: true }),
    });
    const res2 = await engine.POST(req2);
    const body2 = await res2.json();

    expect(body1.jobId).toBe(body2.jobId);
  });

  it("async job is pollable via GET after creation", async () => {
    const engine = createEvalEngine(makeConfig());
    const jobText = "C".repeat(100);

    const postReq = new Request("http://localhost/api/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobText, async: true }),
    });
    const postRes = await engine.POST(postReq);
    const { jobId } = await postRes.json();

    const getReq = new Request(`http://localhost/api/evaluate?jobId=${jobId}`);
    const getRes = await engine.GET(getReq);
    expect(getRes.status).toBe(200);
    const body = await getRes.json();
    expect(body.jobId).toBe(jobId);
    expect(["queued", "running", "done", "error"]).toContain(body.status);
  });

  it("returns 500 when OPENROUTER_API_KEY is missing", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const engine = createEvalEngine(makeConfig());
    const jobText = "D".repeat(100);
    const req = new Request("http://localhost/api/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobText }),
    });
    const res = await engine.POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("OPENROUTER_API_KEY");
  });
});
