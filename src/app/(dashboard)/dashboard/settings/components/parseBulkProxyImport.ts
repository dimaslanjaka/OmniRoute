/**
 * Pure parser for the proxy bulk-import textarea.
 *
 * Supported line formats (one proxy per line):
 *   1. Pipe-delimited:    NAME|HOST|PORT[|USERNAME|PASSWORD|TYPE|REGION|STATUS|NOTES]
 *   2. URL-prefixed:      [socks5://][http://][https://][user:pass@]HOST:PORT
 *   3. Auth-less short:   HOST:PORT  → name is auto-generated as "Imported HOST:PORT"
 *
 * Lines starting with # and blank lines are skipped.
 */

export type ParsedProxyEntry = {
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
  type: string;
  region: string;
  status: string;
  notes: string;
};

export type ParseError = {
  line: number;
  reason: string;
};

export const VALID_PROXY_TYPES = new Set(["http", "https", "socks5"]);
export const VALID_PROXY_STATUSES = new Set(["active", "inactive"]);

export function parseBulkImportText(text: string): {
  entries: ParsedProxyEntry[];
  errors: ParseError[];
  skipped: number;
} {
  const lines = text.split("\n");
  const entries: ParsedProxyEntry[] = [];
  const errors: ParseError[] = [];
  let skipped = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw || raw.startsWith("#")) {
      skipped++;
      continue;
    }

    const lineNum = i + 1;

    // Auth-less shorthand or URL-prefixed proxy: no pipe characters.
    if (!raw.includes("|")) {
      // URL-prefixed form: [scheme://][user:pass@]host[:port]
      // Examples:
      //   http://54.153.56.243:80
      //   http://auth:pass@127.0.0.1:8080
      //   socks5://user:pass@1.1.1.1:443
      //   socks5://46.62.45.223:3128
      const urlMatch = raw.match(/^(socks[45]|https?):\/\/([^\s/]+)$/);
      if (urlMatch) {
        const scheme = urlMatch[1].toLowerCase();
        const authority = urlMatch[2];
        const atIdx = authority.lastIndexOf("@");
        let username = "";
        let password = "";
        let hostPort = authority;
        if (atIdx >= 0) {
          const userInfo = authority.slice(0, atIdx);
          hostPort = authority.slice(atIdx + 1);
          const colonUser = userInfo.indexOf(":");
          if (colonUser >= 0) {
            username = userInfo.slice(0, colonUser);
            password = userInfo.slice(colonUser + 1);
          } else {
            username = userInfo;
          }
        }
        const portIdx = hostPort.lastIndexOf(":");
        if (portIdx <= 0) {
          errors.push({ line: lineNum, reason: "bulkImportErrorInvalidPort" });
          continue;
        }
        const host = hostPort.slice(0, portIdx).trim();
        const portStr = hostPort.slice(portIdx + 1).trim();
        const port = Number(portStr);
        if (!host) {
          errors.push({ line: lineNum, reason: "bulkImportErrorMissingHost" });
          continue;
        }
        if (!portStr || isNaN(port) || port < 1 || port > 65535) {
          errors.push({ line: lineNum, reason: "bulkImportErrorInvalidPort" });
          continue;
        }
        const type = scheme === "socks4" ? "socks5" : scheme; // socks4 → fall through as socks5 family
        if (!VALID_PROXY_TYPES.has(type)) {
          errors.push({ line: lineNum, reason: "bulkImportErrorInvalidType" });
          continue;
        }
        entries.push({
          name: `Imported ${host}:${portStr}`,
          host,
          port,
          username,
          password,
          type,
          region: "",
          status: "active",
          notes: "",
        });
        continue;
      }

      // user-info style without scheme: "user:pass@host:port" is not valid.
      if (raw.includes("@")) {
        errors.push({ line: lineNum, reason: "bulkImportErrorMissingHost" });
        continue;
      }
      const colonIdx = raw.lastIndexOf(":");
      if (colonIdx > 0) {
        const host = raw.slice(0, colonIdx).trim();
        const portStr = raw.slice(colonIdx + 1).trim();
        const port = Number(portStr);
        if (!host) {
          errors.push({ line: lineNum, reason: "bulkImportErrorMissingHost" });
          continue;
        }
        if (!portStr || isNaN(port) || port < 1 || port > 65535) {
          errors.push({ line: lineNum, reason: "bulkImportErrorInvalidPort" });
          continue;
        }
        entries.push({
          name: `Imported ${host}:${portStr}`,
          host,
          port,
          username: "",
          password: "",
          type: "http",
          region: "",
          status: "active",
          notes: "",
        });
        continue;
      }
      errors.push({ line: lineNum, reason: "bulkImportErrorMissingHost" });
      continue;
    }

    // Full pipe-delimited format: NAME|HOST|PORT[|USERNAME|PASSWORD|TYPE|REGION|STATUS|NOTES]
    const parts = raw.split("|").map((p) => p.trim());
    const [name, host, portStr, username, password, type, region, status, notes] = parts;

    if (!name) {
      errors.push({ line: lineNum, reason: "bulkImportErrorMissingName" });
      continue;
    }
    if (!host) {
      errors.push({ line: lineNum, reason: "bulkImportErrorMissingHost" });
      continue;
    }
    const port = Number(portStr);
    if (!portStr || isNaN(port) || port < 1 || port > 65535) {
      errors.push({ line: lineNum, reason: "bulkImportErrorInvalidPort" });
      continue;
    }
    const normalizedType = (type || "socks5").toLowerCase();
    if (!VALID_PROXY_TYPES.has(normalizedType)) {
      errors.push({ line: lineNum, reason: "bulkImportErrorInvalidType" });
      continue;
    }
    const normalizedStatus = (status || "active").toLowerCase();
    if (!VALID_PROXY_STATUSES.has(normalizedStatus)) {
      errors.push({ line: lineNum, reason: "bulkImportErrorInvalidStatus" });
      continue;
    }

    entries.push({
      name,
      host,
      port,
      username: username || "",
      password: password || "",
      type: normalizedType,
      region: region || "",
      status: normalizedStatus,
      notes: notes || "",
    });
  }

  return { entries, errors, skipped };
}
