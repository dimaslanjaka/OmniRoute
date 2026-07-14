import axios, { AxiosRequestConfig } from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";
import { HttpProxyAgent } from "http-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import {
  parseBulkImportText,
  ParsedProxyEntry,
} from "../app/(dashboard)/dashboard/settings/components/parseBulkProxyImport";

// ─── TYPES ─────────────────────────────────────────────────────
export interface ProxyConfig {
  httpUrl: string;
  httpTitle: string;
  httpsUrl: string;
  httpsTitle: string;
  timeout: number;
  maxRedirects: number;
}

export interface ProxyCheckResult {
  proxy: string;
  protocol: string;
  working: boolean;
  httpOnly: boolean;
  http: { ok: boolean; statusCode: number | null; title: string; error: string | null };
  https: { ok: boolean; statusCode: number | null; title: string; error: string | null };
}

export interface ParsedProxy {
  protocol: string;
  proxyUrl: string;
  raw: string;
}

// ─── DEFAULT CONFIG ────────────────────────────────────────────
export const DEFAULT_CONFIG: ProxyConfig = {
  httpUrl: "http://httpforever.com/",
  httpTitle: "HTTP Forever — A reliably insecure connection",
  httpsUrl: "https://www.google.com",
  httpsTitle: "google",
  timeout: 15000,
  maxRedirects: 5,
};

// ─── HELPERS ───────────────────────────────────────────────────
export function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match ? match[1].trim().toLowerCase() : "";
}

export function entryToParsedProxy(proxyStr: string, entry: ParsedProxyEntry): ParsedProxy {
  const auth = entry.username ? `${entry.username}:${entry.password}@` : "";
  const isHttpLike = entry.type === "http" || entry.type === "https";
  const proxyUrl = isHttpLike
    ? `${entry.type}://${auth}${entry.host}:${entry.port}`
    : `socks://${auth}${entry.host}:${entry.port}`;

  return { protocol: entry.type, proxyUrl, raw: proxyStr };
}

export function createProxyAgents(parsed: ParsedProxy) {
  const { protocol, proxyUrl } = parsed;

  if (protocol === "socks4" || protocol === "socks5") {
    const agent = new SocksProxyAgent(proxyUrl);
    return { httpAgent: agent, httpsAgent: agent };
  }

  return {
    httpAgent: new HttpProxyAgent(proxyUrl),
    httpsAgent: new HttpsProxyAgent(proxyUrl),
  };
}

// ─── CORE CHECKER ──────────────────────────────────────────────
export type CheckProxyInput = string | ParsedProxyEntry;

export async function checkProxy(
  proxyData: CheckProxyInput,
  config: Partial<ProxyConfig> = {}
): Promise<ProxyCheckResult> {
  const cfg: ProxyConfig = { ...DEFAULT_CONFIG, ...config };

  const proxyLabel =
    typeof proxyData === "string" ? proxyData : `${proxyData.host}:${proxyData.port}`;

  const result: ProxyCheckResult = {
    proxy: proxyLabel,
    protocol: "",
    working: false,
    httpOnly: false,
    http: { ok: false, statusCode: null, title: "", error: null },
    https: { ok: false, statusCode: null, title: "", error: null },
  };

  let parsed: ParsedProxy;
  try {
    let entry: ParsedProxyEntry;
    if (typeof proxyData === "string") {
      const { entries, errors } = parseBulkImportText(proxyData);
      if (entries.length === 0) {
        const reason = errors[0]?.reason ?? `Could not parse proxy: ${proxyData}`;
        throw new Error(reason);
      }
      entry = entries[0];
    } else {
      entry = proxyData;
    }
    parsed = entryToParsedProxy(proxyLabel, entry);
    result.protocol = parsed.protocol;
  } catch (err) {
    result.http.error = (err as Error).message;
    return result;
  }

  const { httpAgent, httpsAgent } = createProxyAgents(parsed);

  const axiosConfig: AxiosRequestConfig = {
    timeout: cfg.timeout,
    responseType: "text",
    maxRedirects: cfg.maxRedirects,
    validateStatus: () => true,
  };

  // Step 1: Check HTTP site
  try {
    const res = await axios.get(cfg.httpUrl, { ...axiosConfig, httpAgent });
    const title = extractTitle(res.data as string);
    result.http.title = title;
    result.http.statusCode = res.status;

    if (!title.includes(cfg.httpTitle.toLowerCase())) {
      result.http.error = `Title mismatch: got "${title}", expected to contain "${cfg.httpTitle.toLowerCase()}"`;
      return result;
    }

    result.http.ok = true;
  } catch (err) {
    const axiosError = err as { response?: { status?: number }; message: string };
    result.http.error = axiosError.message;
    result.http.statusCode = axiosError.response?.status ?? null;
    return result;
  }

  // Step 2: Check HTTPS site
  try {
    const res = await axios.get(cfg.httpsUrl, { ...axiosConfig, httpsAgent });
    const title = extractTitle(res.data as string);
    result.https.title = title;
    result.https.statusCode = res.status;

    if (!title.includes(cfg.httpsTitle)) {
      result.https.error = `Title mismatch: got "${title}", expected to contain "${cfg.httpsTitle}"`;
      result.httpOnly = true;
      return result;
    }

    result.https.ok = true;
    result.working = true;
  } catch (err) {
    result.httpOnly = true;
    result.https.error = (err as Error).message;
    result.https.statusCode = (err as any).response?.status ?? null;
  }

  return result;
}

// ─── BATCH CHECKER ─────────────────────────────────────────────
export async function checkProxies(
  proxies: CheckProxyInput[],
  config?: Partial<ProxyConfig>
): Promise<ProxyCheckResult[]> {
  return Promise.all(proxies.map((p) => checkProxy(p, config)));
}
