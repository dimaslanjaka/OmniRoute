import { test } from "node:test";
import assert from "node:assert/strict";

test("publiclists provider", async (t) => {
  const { PubliclistsProvider } = await import("@/lib/freeProxyProviders/publiclists");

  await t.test("should be always enabled", () => {
    const provider = new PubliclistsProvider();
    assert.equal(provider.isEnabled(), true);
  });

  await t.test("should assign protocol from DEFAULT_URLS key", async () => {
    const { resetDbInstance } = await import("@/lib/db/core");

    const originalFetch = globalThis.fetch;
    let callCount = 0;

    globalThis.fetch = (async () => {
      callCount++;
      return {
        ok: true,
        text: async () => "1.1.1.1:80\n2.2.2.2:443",
      } as any;
    }) as any;

    try {
      const provider = new PubliclistsProvider();
      const result = await provider.sync();

      // Should have fetched from both the http and socks5 DEFAULT_URLS
      assert.equal(callCount, 2, "should fetch from both http and socks5 URL groups");
      // Should have fetched and stored proxies
      assert.ok(result.fetched > 0, "should have fetched proxies");
    } finally {
      globalThis.fetch = originalFetch;
      resetDbInstance();
    }
  });

  await t.test("should skip private/loopback hosts", async () => {
    const { resetDbInstance } = await import("@/lib/db/core");

    const originalFetch = globalThis.fetch;
    const mockProxyList = `
# Comment line
127.0.0.1:8080
192.168.1.1:3128
10.0.0.1:1080
1.1.1.1:80
8.8.8.8:443
`;

    globalThis.fetch = (async () => ({
      ok: true,
      text: async () => mockProxyList,
    })) as any;

    try {
      const provider = new PubliclistsProvider();
      const result = await provider.sync();

      assert.ok(
        result.errors.some((e) => e.includes("private/loopback")),
        "should report skipped private IPs"
      );
    } finally {
      globalThis.fetch = originalFetch;
      resetDbInstance();
    }
  });

  await t.test("should normalize protocol in parsed entries", async () => {
    const { resetDbInstance } = await import("@/lib/db/core");

    const originalFetch = globalThis.fetch;
    const mockProxyList = `
1.1.1.1:80
2.2.2.2|host|2222
`;

    globalThis.fetch = (async () => ({
      ok: true,
      text: async () => mockProxyList,
    })) as any;

    try {
      const provider = new PubliclistsProvider();
      const result = await provider.sync();

      assert.ok(result.fetched > 0, "should have fetched proxies");
      assert.equal(result.added + result.updated, result.fetched, "all proxies should be inserted");
    } finally {
      globalThis.fetch = originalFetch;
      resetDbInstance();
    }
  });

  await t.test("should track per-URL errors and continue syncing", async () => {
    const { resetDbInstance } = await import("@/lib/db/core");

    const originalFetch = globalThis.fetch;
    let callCount = 0;

    globalThis.fetch = (async (url: string) => {
      callCount++;
      if (url.includes("socks5.txt")) {
        return { ok: true, text: async () => "1.1.1.1:80\n2.2.2.2:443" } as any;
      }
      return { ok: false, status: 404, text: async () => "Not Found" } as any;
    }) as any;

    try {
      const provider = new PubliclistsProvider();
      const result = await provider.sync();

      // Should have attempted both URL groups
      assert.equal(callCount, 2, "should attempt all URL groups");
      // Should have succeeded with the socks5 URL even though http failed
      assert.ok(result.fetched > 0, "should have fetched from successful URL");
      assert.ok(result.errors.length > 0, "should report error from failed URL");
    } finally {
      globalThis.fetch = originalFetch;
      resetDbInstance();
    }
  });

  await t.test("should implement list() to query database", async () => {
    const { resetDbInstance } = await import("@/lib/db/core");

    try {
      const provider = new PubliclistsProvider();
      const result = await provider.list({ protocol: "http", limit: 10 });

      assert.ok(Array.isArray(result), "list() should return array");
      for (const item of result) {
        assert.equal(item.source, "publiclists", "all items should have source=publiclists");
      }
    } finally {
      resetDbInstance();
    }
  });

  await t.test("should return correct FreeProxySyncResult structure", async () => {
    const { resetDbInstance } = await import("@/lib/db/core");

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({
      ok: true,
      text: async () => "1.1.1.1:80",
    })) as any;

    try {
      const provider = new PubliclistsProvider();
      const result = await provider.sync();

      assert.ok(typeof result.fetched === "number", "fetched should be number");
      assert.ok(typeof result.added === "number", "added should be number");
      assert.ok(typeof result.updated === "number", "updated should be number");
      assert.ok(Array.isArray(result.errors), "errors should be array");
    } finally {
      globalThis.fetch = originalFetch;
      resetDbInstance();
    }
  });
});
