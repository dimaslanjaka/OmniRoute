/**
 * Pure parser for the proxy bulk-import textarea.
 *
 * Supported line formats (one proxy per line):
 *   1. Pipe-delimited:  NAME|HOST|PORT[|USERNAME|PASSWORD|TYPE|REGION|STATUS|NOTES]
 *   2. Shorthand formats (no pipe character):
 *        a. ip:port
 *        b. ip:port:user:pass
 *        c. user:pass@ip:port
 *        d. user:pass:ip:port
 *        e. protocol://ip:port
 *        f. protocol://user:pass@ip:port
 *
 * Protocol header mode:
 *   If a line contains only a bare protocol name (http, https, socks5),
 *   it sets the default type for all subsequent shorthand lines that
 *   don't include an explicit protocol:// prefix. The per-line prefix
 *   always takes precedence over the header default.
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

export const VALID_PROXY_TYPES: Record<string, true> = { http: true, https: true, socks5: true };
export const VALID_PROXY_STATUSES: Record<string, true> = { active: true, inactive: true };

/**
 * True if a string looks like an IPv4 address or a DNS hostname.
 */
function looksLikeHost(s: string): boolean {
  if (!s) return false;
  // IPv4: four dot-separated octets, each 0–255
  const ipParts = s.split(".");
  if (
    ipParts.length === 4 &&
    ipParts.every((o) => /^\d+$/.test(o) && Number(o) >= 0 && Number(o) <= 255)
  ) {
    return true;
  }
  // Hostname: alphanumeric + dots/hyphens, at least one char
  return /^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(s);
}

/**
 * Validate and push an entry from parsed shorthand components.
 * Returns true if an entry was pushed, false if an error was pushed.
 */
function pushShorthandEntry(
  entries: ParsedProxyEntry[],
  errors: ParseError[],
  lineNum: number,
  host: string,
  portStr: string,
  username: string,
  password: string,
  type: string
): boolean {
  if (!host) {
    errors.push({ line: lineNum, reason: "bulkImportErrorMissingHost" });
    return false;
  }
  const port = Number(portStr);
  if (!portStr || isNaN(port) || port < 1 || port > 65535) {
    errors.push({ line: lineNum, reason: "bulkImportErrorInvalidPort" });
    return false;
  }
  const normalizedType = type.toLowerCase();
  if (!VALID_PROXY_TYPES[normalizedType]) {
    errors.push({ line: lineNum, reason: "bulkImportErrorInvalidType" });
    return false;
  }
  entries.push({
    name: `Imported ${host}:${portStr}`,
    host,
    port,
    username,
    password,
    type: normalizedType,
    region: "",
    status: "active",
    notes: "",
  });
  return true;
}

/**
 * Parse a shorthand (non-pipe) proxy line.
 *
 * Recognized formats:
 *   protocol://user:pass@host:port
 *   protocol://host:port
 *   user:pass@host:port
 *   host:port:user:pass
 *   user:pass:host:port
 *   host:port
 */
function parseShorthandLine(
  raw: string,
  lineNum: number,
  defaultType: string,
  entries: ParsedProxyEntry[],
  errors: ParseError[]
): boolean {
  let type = defaultType;
  let working = raw;

  // Check for protocol:// prefix
  const protocolMatch = working.match(/^(https?|socks[45]):\/\/(.+)$/i);
  if (protocolMatch) {
    type = protocolMatch[1].toLowerCase();
    if (type === "socks4") type = "socks5"; // map socks4 to socks5
    working = protocolMatch[2];
  }

  // Check for user:pass@host:port format (after protocol stripped)
  const atIdx = working.indexOf("@");
  if (atIdx > 0) {
    const authPart = working.slice(0, atIdx);
    const hostPart = working.slice(atIdx + 1);
    const credColon = authPart.indexOf(":");
    let username = "";
    let password = "";
    if (credColon > 0) {
      username = authPart.slice(0, credColon).trim();
      password = authPart.slice(credColon + 1).trim();
    } else {
      username = authPart.trim();
    }
    // hostPart is now host:port
    const colonIdx = hostPart.lastIndexOf(":");
    if (colonIdx > 0) {
      const host = hostPart.slice(0, colonIdx).trim();
      const portStr = hostPart.slice(colonIdx + 1).trim();
      return pushShorthandEntry(entries, errors, lineNum, host, portStr, username, password, type);
    }
    errors.push({ line: lineNum, reason: "bulkImportErrorInvalidPort" });
    return false;
  }

  // No @ — split by colon to determine which colon-delimited format
  const colonParts = working.split(":").map((p) => p.trim());

  if (colonParts.length === 2) {
    // host:port
    const [host, portStr] = colonParts;
    return pushShorthandEntry(entries, errors, lineNum, host, portStr, "", "", type);
  }

  if (colonParts.length === 4) {
    // Two possibilities: ip:port:user:pass OR user:pass:ip:port
    // Require the "host" slot to look like an IP/hostname AND the "port" slot to be a valid port.
    const isPort1 =
      /^\d+$/.test(colonParts[1]) && Number(colonParts[1]) >= 1 && Number(colonParts[1]) <= 65535;
    const isPort3 =
      /^\d+$/.test(colonParts[3]) && Number(colonParts[3]) >= 1 && Number(colonParts[3]) <= 65535;
    const hostLooksLikePart0 = looksLikeHost(colonParts[0]);
    const hostLooksLikePart2 = looksLikeHost(colonParts[2]);

    if (hostLooksLikePart0 && isPort1) {
      // ip:port:user:pass
      const [host, portStr, username, password] = colonParts;
      return pushShorthandEntry(entries, errors, lineNum, host, portStr, username, password, type);
    }
    if (hostLooksLikePart2 && isPort3) {
      // user:pass:ip:port
      const [username, password, host, portStr] = colonParts;
      return pushShorthandEntry(entries, errors, lineNum, host, portStr, username, password, type);
    }
    // Can't determine format
    errors.push({ line: lineNum, reason: "bulkImportErrorInvalidPort" });
    return false;
  }

  // No @ and not 2 or 4 colon parts, so it's either host-only or just bare text
  // Check if it looks like a structured host input (has dots, suggesting FQDN or IP)
  if (working.includes(".")) {
    // Looks like a host (FQDN or IP), but no port found
    errors.push({ line: lineNum, reason: "bulkImportErrorInvalidPort" });
  } else {
    // Single word with no dots - too bare to be a valid proxy specification
    errors.push({ line: lineNum, reason: "bulkImportErrorMissingHost" });
  }
  return false;
}

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

  if (!VALID_PROXY_TYPES[normalizedScheme]) {
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
  let defaultType = "socks5";

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw || raw.startsWith("#")) {
      skipped++;
      continue;
    }

    const lineNum = i + 1;

    // Protocol header: a bare protocol name sets the default for subsequent shorthand lines
    const lower = raw.toLowerCase();
    if (VALID_PROXY_TYPES[lower]) {
      defaultType = lower;
      continue;
    }

    // Pipe-delimited format: NAME|HOST|PORT[|USERNAME|PASSWORD|TYPE|REGION|STATUS|NOTES]
    if (raw.includes("|")) {
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
      if (!VALID_PROXY_TYPES[normalizedType]) {
        errors.push({ line: lineNum, reason: "bulkImportErrorInvalidType" });
        continue;
      }
      const normalizedStatus = (status || "active").toLowerCase();
      if (!VALID_PROXY_STATUSES[normalizedStatus]) {
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

    // Shorthand formats (no pipe character)
    // First try clean shorthand (host:port, user:pass@host:port, etc.)
    const errorsBeforeShorthand = errors.length;
    const parsed = parseShorthandLine(raw, lineNum, defaultType, entries, errors);
    if (!parsed) {
      // Only try regex extraction for noisy lines (with spaces or extra metadata)
      // If the line is clean format but failed validation, keep the original error
      const isNoisyLine = /\s|[^\w:@.\-/]/.test(raw);
      if (isNoisyLine) {
        // Fall back to regex extraction for noisy lines with extra metadata
        // Discard any errors added by parseShorthandLine since regex extraction is the fallback
        errors.length = errorsBeforeShorthand;
        const patterns = extractProxyPatterns(raw);
        let foundValid = false;
        for (const pattern of patterns) {
          const components = parseProxyPattern(pattern);
          if (components) {
            foundValid = true;
            entries.push({
              name: `${components.scheme}://${components.host}:${components.port}`,
              host: components.host,
              port: components.port,
              username: components.username,
              password: components.password,
              type: components.scheme,
              region: "",
              status: "active",
              notes: "",
            });
          }
        }
        if (!foundValid) {
          if (patterns.length === 0) {
            errors.push({ line: lineNum, reason: "bulkImportErrorMissingHost" });
          } else {
            errors.push({ line: lineNum, reason: "bulkImportErrorInvalidPort" });
          }
        }
      }
      // else: keep the original error from parseShorthandLine
    }
  }

  return { entries, errors, skipped };
}
