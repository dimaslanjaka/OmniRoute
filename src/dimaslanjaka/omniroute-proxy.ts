import { fisherYatesShuffle } from "@/shared/utils/shuffleDeck";
import { resolveOmniRouteBaseUrl } from "@/shared/utils/resolveOmniRouteBaseUrl";
import fs from "fs";
import path from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ProxyItem {
  id: string;
  name: string;
  type: string;
  host: string;
  port: number;
  username: string;
  password: string;
  region: string | null;
  notes: string | null;
  status: string;
  source: string;
  family: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProxyListResult {
  items: ProxyItem[];
  total: number;
  socks5Enabled: boolean;
}

export interface ProxyTestResult {
  success: boolean;
  publicIp: string;
  latencyMs: number;
  proxyUrl: string;
  error?: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const __dirname = new URL(".", import.meta.url).pathname;
const baseUrl = resolveOmniRouteBaseUrl();
const dashboardReferrer = `${baseUrl}/dashboard/system/proxy?tab=proxy-pool`;

function loadCookie(): string {
  const cookiePath = path.join(__dirname, "cookies.txt");
  try {
    const content = fs.readFileSync(cookiePath, "utf-8").trim();
    return content.length > 0 ? content : getDefaultCookie();
  } catch {
    return getDefaultCookie();
  }
}

function getDefaultCookie(): string {
  return "_ga=GA1.1.613318025.1752913609;__next_hmr_refresh_hash__=9d2bc882121e15179f017423e202873ab844f17baec2b017;_ga_BG75CLNJZ1=GS2.1.s1780464837$o5$g1$t1780465586$j60$l0$h0;_ga_LC959F603F=GS2.1.s1782811310$o68$g1$t1782815345$j60$l0$h0;auth_token=eyJhbGciOiJIUzI1NiJ9.eyJhdXRoZW50aWNhdGVkIjp0cnVlLCJleHAiOjE3ODU0OTk5MjR9.-62WYQLuI3LY8-lYWHQGYPViHKXsxj_3cpXAJrriclE";
}

const HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:153.0) Gecko/20100101 Firefox/153.0",
  Accept: "*/*",
  "Accept-Language": "en-US,en;q=0.9",
  "Content-Type": "application/json",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-origin",
  Priority: "u=0",
  "X-Requested-With": "XMLHttpRequest",
  Authorization: "Bearer sk-c2aafb0983f2f86b-95318f-145b88dc",
  Cookie: loadCookie(),
};

// ─── Functions ──────────────────────────────────────────────────────────────

export interface AddProxyOptions {
  name: string;
  host: string;
  port: number;
  username?: string;
  password?: string;
  type?: string;
  status?: string;
  family?: string;
  region?: string | null;
  notes?: string | null;
}

export async function addProxy(options: AddProxyOptions): Promise<ProxyItem> {
  const {
    name,
    host,
    port,
    username = "",
    password = "",
    type = "http",
    status = "active",
    family = "auto",
    region = null,
    notes = null,
  } = options;

  const res = await fetch(`${baseUrl}/api/settings/proxies`, {
    credentials: "include",
    headers: HEADERS,
    referrer: dashboardReferrer,
    body: JSON.stringify({
      name,
      type,
      host,
      port,
      region,
      notes,
      status,
      family,
      username,
      password,
    }),
    method: "POST",
  });

  if (!res.ok) {
    throw new Error(`Failed to add proxy: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

export interface TestProxyOptions {
  proxyId: string;
  host: string;
  port: number;
  username?: string;
  password?: string;
  type?: string;
}

export async function testProxy(options: TestProxyOptions): Promise<ProxyTestResult> {
  const { proxyId, host, port, username = "", password = "", type = "http" } = options;

  const res = await fetch(`${baseUrl}/api/settings/proxy/test`, {
    credentials: "include",
    headers: HEADERS,
    referrer: dashboardReferrer,
    body: JSON.stringify({
      proxyId,
      proxy: { type, host, port, username, password },
    }),
    method: "POST",
  });

  if (!res.ok) {
    throw new Error(`Failed to test proxy: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

export async function deleteProxy(proxyId: string): Promise<void> {
  const res = await fetch(`${baseUrl}/api/settings/proxies?id=${proxyId}&force=1`, {
    credentials: "include",
    headers: HEADERS,
    referrer: dashboardReferrer,
    method: "DELETE",
  });

  if (!res.ok) {
    throw new Error(`Failed to delete proxy: ${res.status} ${res.statusText}`);
  }
}

export async function listProxies(): Promise<ProxyListResult> {
  const res = await fetch(`${baseUrl}/api/settings/proxies`, {
    credentials: "include",
    headers: HEADERS,
    referrer: dashboardReferrer,
  });

  if (!res.ok) {
    throw new Error(`Failed to list proxies: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const list = await listProxies();
  console.log("Current proxies:", list.items.length);

  for (const proxy of fisherYatesShuffle(list.items)) {
    console.log(`Checking proxy ${proxy.name} (${proxy.type}://${proxy.host}:${proxy.port})...`);

    try {
      const testResult = await testProxy({
        proxyId: proxy.id,
        host: proxy.host,
        port: proxy.port,
        username: proxy.username,
        password: proxy.password,
        type: proxy.type,
      });

      console.log(`  Test result:`, testResult);

      if (!testResult.success) {
        console.warn(`  Proxy test failed for ${proxy.name}: ${testResult.error}`);
        await deleteProxy(proxy.id);
      }
    } catch (err) {
      console.error(`  Test failed:`, err);
    }
  }
}

main().catch(console.error);
