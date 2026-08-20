/**
 * Unit tests for backend URL resolution and connection-error classification.
 *
 * GARDEN-38: the dev-only Railway fallback and the pre-send error check that
 * decides whether a failed request is safe to re-send.
 */

import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * BACKEND_FALLBACK_URL is resolved at module load, so each case needs a fresh
 * import with the environment already stubbed.
 */
async function loadEnv(overrides: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(overrides)) {
    vi.stubEnv(key, value);
  }
  return import("@/lib/config/env");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

// ── Dev-only Railway fallback ─────────────────────────────────────────────────

describe("BACKEND_FALLBACK_URL", () => {
  it("defaults to the deployed backend in development — no configuration needed", async () => {
    const env = await loadEnv({
      NODE_ENV: "development",
      BACKEND_FALLBACK_URL: undefined,
    });
    expect(env.BACKEND_FALLBACK_URL).toBe("https://api.digicertificates.in/api/v1");
  });

  it("is empty in a production build, so no fallback can be attempted", async () => {
    const env = await loadEnv({
      NODE_ENV: "production",
      BACKEND_FALLBACK_URL: undefined,
    });
    expect(env.BACKEND_FALLBACK_URL).toBe("");
  });

  it("ignores an explicit BACKEND_FALLBACK_URL in a production build", async () => {
    const env = await loadEnv({
      NODE_ENV: "production",
      BACKEND_FALLBACK_URL: "https://someone-elses-api.test/api/v1",
    });
    expect(env.BACKEND_FALLBACK_URL).toBe("");
  });

  it("honours an explicit override outside production", async () => {
    const env = await loadEnv({
      NODE_ENV: "development",
      BACKEND_FALLBACK_URL: "https://api-staging.up.railway.app/api/v1",
    });
    expect(env.BACKEND_FALLBACK_URL).toBe("https://api-staging.up.railway.app/api/v1");
  });

  it("can be switched off in development with an empty override", async () => {
    const env = await loadEnv({
      NODE_ENV: "development",
      BACKEND_FALLBACK_URL: "",
    });
    expect(env.BACKEND_FALLBACK_URL).toBe("");
  });
});

// ── Pre-send classification ───────────────────────────────────────────────────

describe("isPreSendConnectionError", () => {
  function fetchError(code?: string): TypeError {
    const error = new TypeError("fetch failed");
    if (code !== undefined) {
      (error as TypeError & { cause?: unknown }).cause = { code };
    }
    return error;
  }

  it.each(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"])(
    "treats %s as pre-send — the request provably never left",
    async (code) => {
      const env = await loadEnv({});
      expect(env.isPreSendConnectionError(fetchError(code))).toBe(true);
    },
  );

  it("does NOT treat a bare ECONNRESET as pre-send — it may have been acted on", async () => {
    const env = await loadEnv({});
    expect(env.isPreSendConnectionError(fetchError("ECONNRESET"))).toBe(false);
  });

  it.each(["ECONNABORTED", "ETIMEDOUT", "EPIPE", "UND_ERR_SOCKET"])(
    "does NOT treat %s as pre-send",
    async (code) => {
      const env = await loadEnv({});
      expect(env.isPreSendConnectionError(fetchError(code))).toBe(false);
    },
  );

  it("does not match on message text alone — a bare 'fetch failed' proves nothing", async () => {
    const env = await loadEnv({});
    expect(env.isPreSendConnectionError(fetchError())).toBe(false);
    expect(env.isPreSendConnectionError(new TypeError("ECONNREFUSED somewhere"))).toBe(false);
  });

  it("returns false for non-Error values", async () => {
    const env = await loadEnv({});
    expect(env.isPreSendConnectionError("ECONNREFUSED")).toBe(false);
    expect(env.isPreSendConnectionError(null)).toBe(false);
    expect(env.isPreSendConnectionError(undefined)).toBe(false);
  });

  it("is strictly narrower than isConnectionRefused", async () => {
    const env = await loadEnv({});
    const ambiguous = fetchError("ECONNRESET");
    // The broad check matches anything containing "fetch failed" — which is why
    // it must not be used to gate a re-send of a non-idempotent request.
    expect(env.isConnectionRefused(ambiguous)).toBe(true);
    expect(env.isPreSendConnectionError(ambiguous)).toBe(false);
  });
});
