/**
 * Unit tests for proxy validator pure functions.
 *
 * Covers: isPathSafe, isPathAllowed, createSafeHeaders
 *
 * These are security-critical functions — every attack vector
 * blocked by the proxy must have a corresponding test case here.
 */

import { describe, it, expect } from "vitest";
import {
  isPathSafe,
  isPathAllowed,
  createSafeHeaders,
  ALLOWED_METHODS,
  HOP_BY_HOP_HEADERS,
} from "@/lib/api/proxy-validators";

// ── isPathSafe ────────────────────────────────────────────────────────────────

describe("isPathSafe", () => {
  describe("returns true for valid paths", () => {
    it.each([
      ["/auth/login"],
      ["/templates"],
      ["/templates/abc-123"],
      ["/certificates/generate"],
      ["/organizations/me"],
      ["/delivery/integrations"],
      ["/users/me"],
    ])("allows %s", (path) => {
      expect(isPathSafe(path)).toBe(true);
    });
  });

  describe("blocks path traversal patterns", () => {
    it("blocks .. (double dot)", () => {
      expect(isPathSafe("/../etc/passwd")).toBe(false);
      expect(isPathSafe("/templates/../../etc/secret")).toBe(false);
    });

    it("blocks %2e%2e (URL-encoded double dot — lowercase)", () => {
      expect(isPathSafe("/%2e%2e/secret")).toBe(false);
    });

    it("blocks %2E%2E (URL-encoded double dot — uppercase)", () => {
      expect(isPathSafe("/%2E%2E/secret")).toBe(false);
    });
  });

  describe("blocks double slashes", () => {
    it("blocks // (double slash bypass)", () => {
      expect(isPathSafe("//etc/passwd")).toBe(false);
      expect(isPathSafe("/auth//login")).toBe(false);
    });
  });

  describe("blocks null bytes", () => {
    it("blocks %00 (URL-encoded null byte)", () => {
      expect(isPathSafe("/templates%00evil")).toBe(false);
    });

    it("blocks \\0 (raw null byte)", () => {
      expect(isPathSafe("/templates\0evil")).toBe(false);
    });
  });

  describe("blocks backslashes", () => {
    it("blocks \\ (literal backslash)", () => {
      expect(isPathSafe("/templates\\evil")).toBe(false);
    });

    it("blocks %5c (URL-encoded backslash — lowercase)", () => {
      expect(isPathSafe("/templates%5cevil")).toBe(false);
    });

    it("blocks %5C (URL-encoded backslash — uppercase)", () => {
      expect(isPathSafe("/templates%5Cevil")).toBe(false);
    });
  });
});

// ── isPathAllowed ─────────────────────────────────────────────────────────────

describe("isPathAllowed", () => {
  describe("returns true for allowed path prefixes", () => {
    it.each([
      ["/auth/login"],
      ["/auth/logout"],
      ["/templates"],
      ["/templates/abc-123"],
      ["/organizations/me"],
      ["/users/me"],
      ["/certificates/generate"],
      ["/import-jobs"],
      ["/import-jobs/abc/data"],
      ["/billing/overview"],
      ["/billing/invoices"],
      ["/verification/verify"],
      ["/dashboard/stats"],
      ["/catalog/categories"],
      ["/delivery/integrations"],
      ["/delivery/templates"],
      ["/industries"],
      ["/webhooks/stripe"],
    ])("allows %s", (path) => {
      expect(isPathAllowed(path)).toBe(true);
    });
  });

  describe("returns false for paths not in the allowlist", () => {
    it.each([
      ["/internal/admin"],
      ["/debug"],
      ["/metrics"],
      ["/health"],
      ["/admin/users"],
      ["/secret"],
      ["/supabase"],
      ["/postgres"],
      ["/redis"],
    ])("blocks %s", (path) => {
      expect(isPathAllowed(path)).toBe(false);
    });
  });

  describe("handles paths without leading slash", () => {
    it("normalizes path without leading slash", () => {
      expect(isPathAllowed("auth/login")).toBe(true);
      expect(isPathAllowed("templates")).toBe(true);
    });
  });

  describe("handles exact matches without trailing slash", () => {
    it("matches /import-jobs (no trailing slash)", () => {
      expect(isPathAllowed("/import-jobs")).toBe(true);
    });

    it("matches /industries (no trailing slash)", () => {
      expect(isPathAllowed("/industries")).toBe(true);
    });

    it("matches /templates (no trailing slash)", () => {
      expect(isPathAllowed("/templates")).toBe(true);
    });
  });
});

// ── createSafeHeaders ─────────────────────────────────────────────────────────

describe("createSafeHeaders", () => {
  function makeHeaders(entries: Record<string, string>): Headers {
    const h = new Headers();
    for (const [k, v] of Object.entries(entries)) h.set(k, v);
    return h;
  }

  it("forwards safe content headers", () => {
    const headers = makeHeaders({
      "Content-Type": "application/json",
      "Accept": "application/json",
      "X-Custom-Header": "value",
    });
    const result = createSafeHeaders(headers, null);
    expect(result.get("content-type")).toBe("application/json");
    expect(result.get("accept")).toBe("application/json");
    expect(result.get("x-custom-header")).toBe("value");
  });

  it("strips hop-by-hop headers", () => {
    const hopByHop = [...HOP_BY_HOP_HEADERS];
    const entries: Record<string, string> = {};
    for (const h of hopByHop) entries[h] = "should-be-removed";
    const headers = makeHeaders(entries);
    const result = createSafeHeaders(headers, null);
    for (const h of hopByHop) {
      expect(result.get(h)).toBeNull();
    }
  });

  it("strips the host header", () => {
    const headers = makeHeaders({ host: "evil.example.com" });
    const result = createSafeHeaders(headers, null);
    expect(result.get("host")).toBeNull();
  });

  it("strips the cookie header", () => {
    const headers = makeHeaders({ cookie: "session=abc; token=xyz" });
    const result = createSafeHeaders(headers, null);
    expect(result.get("cookie")).toBeNull();
  });

  it("injects Authorization Bearer when token is provided", () => {
    const headers = makeHeaders({});
    const result = createSafeHeaders(headers, "my-access-token");
    expect(result.get("Authorization")).toBe("Bearer my-access-token");
  });

  it("does not set Authorization when token is null", () => {
    const headers = makeHeaders({});
    const result = createSafeHeaders(headers, null);
    expect(result.get("Authorization")).toBeNull();
  });

  it("preserves multipart/form-data Content-Type with boundary", () => {
    const boundary = "----WebKitFormBoundaryXYZ";
    const headers = makeHeaders({
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    });
    const result = createSafeHeaders(headers, null);
    expect(result.get("content-type")).toBe(`multipart/form-data; boundary=${boundary}`);
  });

  // GARDEN-39: the route handler re-reads the body with `request.arrayBuffer()`, so the
  // browser's own framing headers describe a body that is no longer the one being sent.
  // Forwarding either makes undici throw UND_ERR_REQ_CONTENT_LENGTH_MISMATCH before any
  // network I/O. fetch recomputes both from the attached body.
  it("strips content-length so fetch recomputes it from the re-read body", () => {
    const headers = makeHeaders({
      "Content-Length": "1234",
      "Content-Type": "application/json",
    });
    const result = createSafeHeaders(headers, null);
    expect(result.get("content-length")).toBeNull();
    // The rest of the request must survive — this strips one header, not the body metadata.
    expect(result.get("content-type")).toBe("application/json");
  });

  it("strips content-encoding, whose presence makes the forwarded length disagree", () => {
    const headers = makeHeaders({
      "Content-Encoding": "gzip",
      "Content-Type": "application/json",
    });
    const result = createSafeHeaders(headers, null);
    expect(result.get("content-encoding")).toBeNull();
    expect(result.get("content-type")).toBe("application/json");
  });

  it("keeps the multipart boundary intact while still stripping the framing headers", () => {
    const boundary = "----WebKitFormBoundaryAbC123";
    const headers = makeHeaders({
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": "98765",
      "Content-Encoding": "gzip",
    });
    const result = createSafeHeaders(headers, null);
    // The boundary is load-bearing: file imports fail without it.
    expect(result.get("content-type")).toBe(`multipart/form-data; boundary=${boundary}`);
    expect(result.get("content-type")).toContain(`boundary=${boundary}`);
    expect(result.get("content-length")).toBeNull();
    expect(result.get("content-encoding")).toBeNull();
  });
});

// ── ALLOWED_METHODS ───────────────────────────────────────────────────────────

describe("ALLOWED_METHODS", () => {
  it.each(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])(
    "includes %s",
    (method) => {
      expect(ALLOWED_METHODS.has(method)).toBe(true);
    },
  );

  it("does not include CONNECT (SSRF vector)", () => {
    expect(ALLOWED_METHODS.has("CONNECT")).toBe(false);
  });

  it("does not include TRACE (XST vector)", () => {
    expect(ALLOWED_METHODS.has("TRACE")).toBe(false);
  });
});
