import { parseBulkImportText } from "@/app/(dashboard)/dashboard/settings/components/parseBulkProxyImport";
import { checkProxy } from "./proxyChecker";
import { upsertProxy } from "@/lib/localDb";
import { fisherYatesShuffle } from "@/shared/utils/shuffleDeck";

const downloadProxies = async (url: string): Promise<string> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download proxies from ${url}: ${response.statusText}`);
  }
  return response.text();
};

async function runTest() {
  const [httpText, socks5Text] = await Promise.all([
    downloadProxies("https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt"),
    downloadProxies("https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt"),
  ]);

  const { entries: httpEntries } = parseBulkImportText(httpText);
  const { entries: socks5Entries } = parseBulkImportText(socks5Text);

  const entries = [
    ...httpEntries.map((e) => ({ ...e, type: "http" as const })),
    ...socks5Entries.map((e) => ({ ...e, type: "socks5" as const })),
  ];

  console.log("Total entries parsed:", entries.length);

  for (const entry of fisherYatesShuffle(entries)) {
    console.log(`Checking proxy: ${entry.host}:${entry.port}`);

    const result = await checkProxy(entry);
    if (!result.working) {
      const status =
        result.http.statusCode !== null
          ? ` (HTTP ${result.http.statusCode})`
          : result.https.statusCode !== null
            ? ` (HTTPS ${result.https.statusCode})`
            : "";
      console.log(
        `❌ ${result.protocol}://${entry.host}:${entry.port}${status}: ${result.http.error ?? result.https.error}`
      );
      continue;
    }

    console.log(
      `✅ ${result.protocol}://${entry.host}:${entry.port}\n [HTTP] ${result.http.statusCode} - "${result.http.title}"\n [HTTPS] ${result.https.statusCode} - "${result.https.title}"`
    );

    const { proxy, action } = await upsertProxy({
      name: `${entry.host}:${entry.port}`,
      type: result.protocol,
      host: entry.host,
      port: Number(entry.port),
      source: "bulk-check",
      status: "active",
    });

    console.log(`💾 Saved (${action}): ${proxy?.id ?? "?"} ${entry.host}:${entry.port}`);
    break;
  }
}

runTest().catch(console.error);
