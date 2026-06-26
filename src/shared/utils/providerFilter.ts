/**
 * Provider Filter — build-time / runtime provider allowlisting.
 *
 * Reads `ENABLED_PROVIDERS` (comma-separated) and exports helpers that let
 * every registration layer (constants, registry, executors, translators) decide
 * whether to include a given provider.
 *
 * Wildcard patterns are supported:
 *   - `openai-compatible-*`  matches any provider whose id starts with that prefix
 *   - `anthropic-compatible-*` matches any provider whose id starts with that prefix
 *
 * When the env var is unset or empty every provider is included (full build).
 */

const ENV_KEY = "ENABLED_PROVIDERS";

// ── Internal parsing (lazy, cached) ────────────────────────────────────────

let _parsed: { enabled: Set<string>; patterns: RegExp[] } | null = null;

function getFilter(): { enabled: Set<string>; patterns: RegExp[] } {
  if (_parsed) return _parsed;
  const raw = typeof process !== "undefined" ? (process.env[ENV_KEY] ?? "").trim() : "";
  if (!raw) {
    _parsed = { enabled: new Set<string>(), patterns: [] };
    return _parsed;
  }
  const enabled = new Set<string>();
  const patterns: RegExp[] = [];

  for (const item of raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)) {
    if (item.includes("*")) {
      // Convert glob-style wildcard to regex — only trailing `*` or double `**`
      const escaped = item.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
      try {
        patterns.push(new RegExp(`^${escaped}$`));
      } catch {
        // skip invalid patterns
      }
    } else {
      enabled.add(item);
    }
  }

  _parsed = { enabled, patterns };
  return _parsed;
}

/** Reset cache (for testing). */
export function resetProviderFilterCache(): void {
  _parsed = null;
}

/**
 * Check whether a provider id is allowed by the current filter.
 *
 * Returns `true` when the filter is unset (full build). A provider is included
 * if it appears in the literal list OR matches any wildcard pattern.
 */
export function isProviderEnabled(id: string): boolean {
  const { enabled, patterns } = getFilter();
  if (enabled.size === 0 && patterns.length === 0) return true; // no filter → all
  if (enabled.has(id)) return true;
  for (const re of patterns) {
    if (re.test(id)) return true;
  }
  return false;
}

/**
 * Alias-aware check: also tests whether `alias` is in the enabled set.
 * Some call-sites have access to the alias (e.g. executor map keys) while
 * others only have the canonical id.
 */
export function isProviderEnabledWithAlias(id: string, alias?: string): boolean {
  if (isProviderEnabled(id)) return true;
  if (alias && alias !== id && isProviderEnabled(alias)) return true;
  return false;
}

/**
 * Return a filtered copy of a provider record map.
 */
export function filterProviderMap<T extends Record<string, unknown>>(map: T): Partial<T> {
  const { enabled, patterns } = getFilter();
  if (enabled.size === 0 && patterns.length === 0) return map;

  const result: Partial<T> = {};
  for (const key of Object.keys(map)) {
    if (enabled.has(key)) {
      result[key as keyof T] = map[key as keyof T];
      continue;
    }
    // Also test the value's `id` field if it exists
    const entry = map[key as keyof T] as Record<string, unknown> | undefined;
    const id = entry?.id as string | undefined;
    if (id && enabled.has(id)) {
      result[key as keyof T] = map[key as keyof T];
      continue;
    }
    if (id && patterns.some((re) => re.test(id))) {
      result[key as keyof T] = map[key as keyof T];
      continue;
    }
    if (patterns.some((re) => re.test(key))) {
      result[key as keyof T] = map[key as keyof T];
    }
  }
  return result;
}

/**
 * Return a filtered array of provider id strings.
 */
export function filterProviderIds(ids: readonly string[]): string[] {
  const { enabled, patterns } = getFilter();
  if (enabled.size === 0 && patterns.length === 0) return [...ids];
  return ids.filter((id) => {
    if (enabled.has(id)) return true;
    return patterns.some((re) => re.test(id));
  });
}

/**
 * Return a filtered Set of provider ids.
 */
export function filterProviderIdSet(ids: Set<string>): Set<string> {
  const { enabled, patterns } = getFilter();
  if (enabled.size === 0 && patterns.length === 0) return new Set(ids);
  const result = new Set<string>();
  for (const id of ids) {
    if (enabled.has(id)) {
      result.add(id);
      continue;
    }
    for (const re of patterns) {
      if (re.test(id)) {
        result.add(id);
        break;
      }
    }
  }
  return result;
}
