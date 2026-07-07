import type { FreeProxyItem, FreeProxySyncResult, FreeProxyProvider } from "./types";
import { isPrivateHost } from "@/shared/network/outboundUrlGuard";
import { parseBulkImportText } from "@/app/(dashboard)/dashboard/settings/components/parseBulkProxyImport";

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_CONSECUTIVE_FAILURES = 5;

/**
 * Default proxy list URLs keyed by protocol.
 * The key determines the protocol for all entries fetched from the URLs in that group.
 * The publiclists provider is always enabled and does not require any env configuration.
 */
const DEFAULT_URLS: Record<string, string[]> = {
  http: ["https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt"],
  socks5: ["https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt"],
};

/**
 * Generic provider for plain-text proxy lists (host:port or URL format, one per line).
 * Protocol is determined by the key in DEFAULT_URLS — no env vars needed.
 * Always enabled. Reuses parseBulkImportText() for consistent parsing.
 */
export class PubliclistsProvider implements FreeProxyProvider {
  readonly id = "publiclists" as const;
  readonly name = "Public Lists";

  private consecutiveFailures = 0;

  isEnabled(): boolean {
    return true;
  }

  async sync(): Promise<FreeProxySyncResult> {
    if (this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      return {
        fetched: 0,
        added: 0,
        updated: 0,
        errors: [`Circuit breaker open: ${this.consecutiveFailures} consecutive failures`],
      };
    }

    const { upsertFreeProxy } = await import("../db/freeProxies");
    const errors: string[] = [];
    let added = 0;
    let updated = 0;
    let fetched = 0;

    try {
      for (const [protocol, urls] of Object.entries(DEFAULT_URLS)) {
        for (const url of urls) {
          const urlLabel = url.split("/").pop() || url;
          try {
            const res = await fetch(url, { signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS) });

            if (!res.ok) {
              const text = await res.text().catch(() => "");
              errors.push(`${urlLabel}: HTTP ${res.status} - ${text.slice(0, 100)}`);
              continue;
            }

            const rawText = await res.text();
            const { entries, errors: parseErrors } = parseBulkImportText(rawText);

            // Surface parse errors with context
            if (parseErrors.length > 0) {
              const sample = parseErrors.slice(0, 3).map((e) => `line ${e.line}: ${e.reason}`);
              errors.push(`${urlLabel}: ${parseErrors.length} parse errors (${sample.join("; ")})`);
            }

            for (const entry of entries) {
              if (isPrivateHost(entry.host)) {
                errors.push(`${urlLabel}: skipped private/loopback host ${entry.host}`);
                continue;
              }

              // Use parsed type if valid, otherwise use the protocol from the URL group key
              const type = entry.type || protocol;

              const item: FreeProxyItem = {
                source: "publiclists",
                host: entry.host,
                port: entry.port,
                type: type as FreeProxyItem["type"],
                countryCode: entry.region || null,
                qualityScore: null, // Plain-text lists don't provide quality scores
                latencyMs: null,
                anonymity: null,
                lastValidated: new Date().toISOString(),
              };

              const result = await upsertFreeProxy(item);
              if (result.action === "created") added++;
              else updated++;
              fetched++;
            }
          } catch (err) {
            errors.push(`${urlLabel}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }

      // Reset circuit breaker on any success
      if (fetched > 0) {
        this.consecutiveFailures = 0;
      } else {
        this.consecutiveFailures++;
      }
    } catch (err) {
      this.consecutiveFailures++;
      errors.push(err instanceof Error ? err.message : String(err));
    }

    return { fetched, added, updated, errors };
  }

  async list(filters: {
    protocol?: string;
    country?: string;
    minQuality?: number;
    limit?: number;
  }): Promise<FreeProxyItem[]> {
    const { listFreeProxies } = await import("../db/freeProxies");
    const records = await listFreeProxies({
      sources: ["publiclists"],
      protocol: filters.protocol,
      country: filters.country,
      minQuality: filters.minQuality,
      limit: filters.limit,
    });
    return records.map((r) => ({
      source: r.source,
      host: r.host,
      port: r.port,
      type: r.type as FreeProxyItem["type"],
      countryCode: r.countryCode,
      qualityScore: r.qualityScore,
      latencyMs: r.latencyMs,
      anonymity: r.anonymity,
      lastValidated: r.lastValidated,
    }));
  }
}
