/**
 * Pure parser for the proxy bulk-import textarea.
 *
 * Supported formats (extracted from noisy textarea data):
 *   1. Pipe-delimited:       NAME|HOST|PORT[|USERNAME|PASSWORD|TYPE|REGION|STATUS|NOTES]
 *   2. URL-prefixed:         [socks5://][http://][https://][user:pass@]HOST:PORT
 *   3. Auth-less short:      HOST:PORT → name auto-generated as "Imported HOST:PORT"
 *   4. Credentials in URL:   user:pass@HOST:PORT (extracted from noisy lines)
 *   5. Protocol-only short:  socks5://HOST:PORT (extracted with regex)
 *
 * Regex extraction mode (when input contains extra metadata):
 *   - Finds all [user:pass@]host:port patterns in each line
 *   - Handles IPv4 addresses with 1-5 digit ports (1-65535)
 *   - Skips lines starting with # and blank lines
 *
 * Examples of noisy input that will be parsed:
 *   206.135.43.62:999 MX-N -         → extracts 206.135.43.62:999
 *   119.93.94.108:8080 PH-N-S! -     → extracts 119.93.94.108:8080
 *   socks5://user:pass@1.1.1.1:443   → extracts all components
 *   http://46.62.45.223:3128         → extracts with http type
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

export const VALID_PROXY_TYPES = new Set(["http", "https", "socks5", "socks4"]);
export const VALID_PROXY_STATUSES = new Set(["active", "inactive"]);

/**
 * Extract proxy patterns from a string (handles noisy data with metadata).
 * Returns array of extracted proxy patterns: [scheme://][user:pass@]host:port
 */
function extractProxyPatterns(line: string): string[] {
  const patterns: string[] = [];

  // Pattern 1: scheme://[user:pass@]host:port
  // Matches: http://1.1.1.1:80, socks5://user:pass@1.1.1.1:443, https://46.62.45.223:3128
  const schemePattern = /(?:socks[45]|https?):\/\/(?:[^\s/@]+@)?[\d.]+:\d+/gi;
  let match;
  while ((match = schemePattern.exec(line)) !== null) {
    patterns.push(match[0]);
  }

  // Pattern 2: user:pass@host:port (no scheme, with credentials)
  // Matches: user:pass@1.1.1.1:80, admin:secret@192.168.1.1:8080
  const credPattern = /(?:[^\s/@]+):(?:[^\s/@]+)@(?:[\d.]+):\d+/g;
  while ((match = credPattern.exec(line)) !== null) {
    if (!patterns.some((p) => p.includes(match![0]))) {
      patterns.push(match[0]);
    }
  }

  // Pattern 3: host:port (no scheme, no credentials)
  // Matches: 1.1.1.1:80, 206.135.43.62:999
  // Only match if not already captured in schemes/creds, and port is in valid range
  const hostPortPattern = /((?:\d{1,3}\.){3}\d{1,3}):(\d{1,5})\b/g;
  while ((match = hostPortPattern.exec(line)) !== null) {
    const port = parseInt(match[2], 10);
    // Only add if port is valid and not already in patterns
    if (port >= 1 && port <= 65535) {
      const hostPort = match[0];
      if (!patterns.some((p) => p.includes(hostPort))) {
        patterns.push(hostPort);
      }
    }
  }

  return patterns;
}

/**
 * Parse a single extracted proxy pattern into components.
 * Returns { scheme, username, password, host, port } or null if invalid.
 */
function parseProxyPattern(pattern: string): {
  scheme: string;
  username: string;
  password: string;
  host: string;
  port: number;
} | null {
  let scheme = "http";
  let username = "";
  let password = "";
  let hostPort = pattern;

  // Extract scheme if present
  const schemeMatch = pattern.match(/^(socks[45]|https?):\/\/(.*)/i);
  if (schemeMatch) {
    scheme = schemeMatch[1].toLowerCase();
    hostPort = schemeMatch[2];
  }

  // Extract credentials if present (user:pass@)
  const atIndex = hostPort.lastIndexOf("@");
  if (atIndex > 0) {
    const userInfo = hostPort.slice(0, atIndex);
    hostPort = hostPort.slice(atIndex + 1);
    const colonIndex = userInfo.indexOf(":");
    if (colonIndex > 0) {
      username = userInfo.slice(0, colonIndex);
      password = userInfo.slice(colonIndex + 1);
    } else {
      username = userInfo;
    }
  }

  // Extract host and port
  const portIndex = hostPort.lastIndexOf(":");
  if (portIndex <= 0) {
    return null;
  }

  const host = hostPort.slice(0, portIndex).trim();
  const portStr = hostPort.slice(portIndex + 1).trim();
  const port = parseInt(portStr, 10);

  if (!host || isNaN(port) || port < 1 || port > 65535) {
    return null;
  }

  // Normalize scheme
  const normalizedScheme = scheme === "socks4" ? "socks5" : scheme === "socks5" ? "socks5" : scheme;

  if (!VALID_PROXY_TYPES.has(normalizedScheme)) {
    return null;
  }

  return { scheme: normalizedScheme, username, password, host, port };
}

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

    // Check if this is pipe-delimited format (contains |)
    if (raw.includes("|")) {
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

      const normalizedType = (type || "http").toLowerCase();
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
      continue;
    }

    // For non-pipe-delimited lines, use regex extraction to find proxy patterns
    const patterns = extractProxyPatterns(raw);

    if (patterns.length === 0) {
      // No patterns found in this line - could be completely malformed
      errors.push({ line: lineNum, reason: "bulkImportErrorMissingHost" });
      continue;
    }

    // Parse each extracted pattern
    for (const pattern of patterns) {
      const parsed = parseProxyPattern(pattern);
      if (!parsed) {
        errors.push({ line: lineNum, reason: "bulkImportErrorInvalidPort" });
        continue;
      }

      const { scheme, username, password, host, port } = parsed;

      entries.push({
        name: `${scheme}://${host}:${port}`,
        host,
        port,
        username,
        password,
        type: scheme,
        region: "",
        status: "active",
        notes: "",
      });
    }
  }

  return { entries, errors, skipped };
}
