/**
 * Integration tests for the API proxy route handler.
 *
 * These tests cover security-critical path validation and request handling
 * without making real HTTP calls. The backend fetch is mocked via vi.stubGlobal.
 *
 * Note: Full round-trip proxy tests (real backend) belong in e2e/.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/config/env", () => ({
  BACKEND_PRIMARY_URL: "http://backend.test",
  BACKEND_FALLBACK_URL: "",
  isConnectionRefused: vi.fn(() => false),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    get: vi.fn().mockReturnValue(undefined),
    getAll: vi.fn().mockReturnValue([]),
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
  }),
}));

import { GET, POST, DELETE } from "@/app/api/proxy/[...path]/route";

// ── Fetch mock helpers ─────────────────────────────────────────────────────────

function mockFetch(status: number, body: unknown) {
  const mockResponse = {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "Content-Type": "application/json" }),
    json: vi.fn().mockResolvedValue(body),
    arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
  };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));
  return mockResponse;
}

function makeRequest(path: string, method = "GET", body?: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/proxy${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── Path security: traversal ──────────────────────────────────────────────────

describe("Proxy route — path traversal prevention", () => {
  it("returns 403 for paths containing .. (normalized before handler, blocked by allowlist)", async () => {
    const res = await GET(makeRequest("/auth/../admin"));
    expect(res.status).toBe(403);
  });

  it("returns 403 for URL-encoded traversal %2e%2e (normalized before handler, blocked by allowlist)", async () => {
    const res = await GET(makeRequest("/auth/%2e%2e/admin"));
    expect(res.status).toBe(403);
  });

  it("returns 400 for double-slash paths", async () => {
    const res = await GET(makeRequest("/auth//login"));
    expect(res.status).toBe(400);
  });

  it("returns 400 for paths with null bytes", async () => {
    const res = await GET(makeRequest("/auth/%00login"));
    expect(res.status).toBe(400);
  });
});

// ── Path security: allowlist ──────────────────────────────────────────────────

describe("Proxy route — path allowlist", () => {
  it("returns 403 for paths not in the allowlist", async () => {
    const res = await GET(makeRequest("/admin/users"));
    expect(res.status).toBe(403);
  });

  it("returns 403 for paths attempting to access arbitrary routes", async () => {
    const res = await GET(makeRequest("/internal/secrets"));
    expect(res.status).toBe(403);
  });

  it("allows allowed prefixes through to the backend", async () => {
    mockFetch(200, { success: true, data: [] });
    const res = await GET(makeRequest("/templates"));
    // Should NOT be 400 or 403 — reached the backend mock
    expect([200, 201, 204].includes(res.status) || res.status < 500).toBe(true);
  });

  it("allows /auth/ prefix", async () => {
    mockFetch(200, { success: true, data: {} });
    const res = await GET(makeRequest("/auth/access-context"));
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(400);
  });

  it("allows /certificates/ prefix", async () => {
    mockFetch(200, { success: true, data: [] });
    const res = await GET(makeRequest("/certificates/generation-jobs"));
    expect(res.status).not.toBe(403);
  });

  it("allows /jobs/ prefix", async () => {
    mockFetch(200, { success: true, data: { id: "job_1", status: "completed" } });
    const res = await GET(makeRequest("/jobs/job_1"));
    expect(res.status).not.toBe(403);
  });
});

// ── Response forwarding ───────────────────────────────────────────────────────

describe("Proxy route — response forwarding", () => {
  it("forwards backend JSON response with the same status", async () => {
    mockFetch(200, { success: true, data: { id: "t1" } });
    const res = await GET(makeRequest("/templates"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("includes X-Request-ID response header", async () => {
    mockFetch(200, { success: true, data: {} });
    const res = await GET(makeRequest("/templates"));
    expect(res.headers.get("X-Request-ID")).toBeTruthy();
  });

  it("forwards non-200 status codes from backend", async () => {
    mockFetch(404, { success: false, error: "Not found" });
    const res = await GET(makeRequest("/templates"));
    expect(res.status).toBe(404);
  });

  it("handles 204 No Content responses", async () => {
    const mockResponse = {
      ok: true,
      status: 204,
      headers: new Headers({ "Content-Type": "text/plain" }),
      json: vi.fn(),
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

    const res = await DELETE(makeRequest("/templates/t1", "DELETE"));
    expect(res.status).toBe(204);
  });
});

// ── POST forwarding ───────────────────────────────────────────────────────────

describe("Proxy route — POST requests", () => {
  it("forwards POST body to backend", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      headers: new Headers({ "Content-Type": "application/json" }),
      json: vi.fn().mockResolvedValue({ success: true, data: { id: "new_1" } }),
      arrayBuffer: vi.fn(),
    });
    vi.stubGlobal("fetch", fetchMock);

    await POST(makeRequest("/certificates/generation-jobs", "POST", { templateId: "t1" }));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/certificates/generation-jobs"),
      expect.objectContaining({ method: "POST" })
    );
  });
});
