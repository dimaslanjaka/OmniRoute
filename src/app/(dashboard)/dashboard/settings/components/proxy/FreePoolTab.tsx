"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components";
import SourceToggleBar, {
  type SourceId,
  ALL_SOURCE_IDS,
  loadDisabledSources,
  saveDisabledSources,
} from "./SourceToggleBar";
import FreeProxyRow, { type FreeProxyRowData } from "./FreeProxyRow";

type FreePoolStats = {
  total: number;
  inPool: number;
  avgQuality: number | null;
  lastSyncAt: string | null;
};

export default function FreePoolTab() {
  const t = useTranslations("settings");
  const [proxies, setProxies] = useState<FreeProxyRowData[]>([]);
  const [stats, setStats] = useState<FreePoolStats | null>(null);
  const [disabledSources, setDisabledSources] = useState<Set<SourceId>>(new Set());
  const [filterProtocol, setFilterProtocol] = useState("");
  const [filterCountry, setFilterCountry] = useState("");
  const [minQuality, setMinQuality] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set());
  const [bulkAdding, setBulkAdding] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<string | null>(null);
  const stopBulkAddRef = useRef(false);
  // #5595: per-source sync errors so a "Total: 0" result is never silent.
  const [syncErrors, setSyncErrors] = useState<Record<string, string[]> | null>(null);

  // Load persisted disabled-sources from localStorage on mount
  useEffect(() => {
    setDisabledSources(loadDisabledSources());
  }, []);

  const handleToggleSource = useCallback((source: SourceId) => {
    setDisabledSources((prev) => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      saveDisabledSources(next);
      return next;
    });
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      const enabledSources = ALL_SOURCE_IDS.filter((s) => !disabledSources.has(s));
      if (enabledSources.length < ALL_SOURCE_IDS.length) {
        params.set("sources", enabledSources.join(","));
      }
      if (filterProtocol) params.set("protocol", filterProtocol);
      if (filterCountry) params.set("country", filterCountry);
      if (minQuality) params.set("minQuality", minQuality);
      params.set("limit", "200");

      const [proxiesRes, statsRes] = await Promise.all([
        fetch(`/api/settings/free-proxies?${params.toString()}`),
        fetch("/api/settings/free-proxies/stats"),
      ]);
      if (proxiesRes.ok) {
        const data = await proxiesRes.json();
        setProxies(data.items || []);
      }
      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data.stats || null);
      }
    } catch {}
    setLoading(false);
  }, [disabledSources, filterProtocol, filterCountry, minQuality]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncErrors(null);
    try {
      const enabledSources = ALL_SOURCE_IDS.filter((s) => !disabledSources.has(s));
      const body = enabledSources.length < ALL_SOURCE_IDS.length ? { sources: enabledSources } : {};
      const res = await fetch("/api/settings/free-proxies/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      // #5595: surface per-source errors the route already returns so a
      // partial/empty sync explains itself instead of silently showing "Total: 0".
      const data = await res.json().catch(() => null);
      if (data?.results) {
        const errs: Record<string, string[]> = {};
        for (const [src, r] of Object.entries(
          data.results as Record<string, { errors?: string[] }>
        )) {
          if (Array.isArray(r?.errors) && r.errors.length > 0) errs[src] = r.errors;
        }
        if (Object.keys(errs).length > 0) setSyncErrors(errs);
      }
      await loadData();
    } catch {}
    setSyncing(false);
  };

  const handleAddToPool = async (id: string) => {
    setAddingIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/settings/free-proxies/${id}/add-to-pool`, {
        method: "POST",
      });
      // #4878: gate on the parsed body, not just res.ok. The route used to return
      // a default 200 with { success:false } on a failed connectivity probe, which
      // flipped the row to "In Pool" optimistically even though nothing was added.
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setProxies((prev) => prev.map((p) => (p.id === id ? { ...p, inPool: true } : p)));
      } else {
        // Store test result (success or failure) so user can see why it failed
        setProxies((prev) =>
          prev.map((p) =>
            p.id === id
              ? {
                  ...p,
                  testResult: {
                    success: false,
                    latencyMs: data?.latencyMs,
                    error: data?.error || `Proxy test failed ${res.statusText}`,
                  },
                }
              : p
          )
        );
      }
    } catch (error) {
      setProxies((prev) =>
        prev.map((p) =>
          p.id === id
            ? {
                ...p,
                testResult: {
                  success: false,
                  error: error instanceof Error ? error.message : "Network error",
                },
              }
            : p
        )
      );
    }
    setAddingIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleToggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkAdd = async (ids: string[]) => {
    if (!ids.length || bulkAdding) return;
    setBulkAdding(true);
    stopBulkAddRef.current = false;
    setBulkProgress(`Testing 1/${ids.length}...`);
    let succeeded = 0;
    let failed = 0;
    let stopped = false;

    try {
      for (let i = 0; i < ids.length; i++) {
        if (stopBulkAddRef.current) {
          stopped = true;
          break;
        }
        const id = ids[i];
        setBulkProgress(`Testing ${i + 1}/${ids.length}...`);

        try {
          const res = await fetch(`/api/settings/free-proxies/${id}/add-to-pool`, {
            method: "POST",
          });
          const data = await res.json().catch(() => null);

          if (res.ok && data?.success) {
            succeeded++;
            setProxies((prev) => prev.map((p) => (p.id === id ? { ...p, inPool: true } : p)));
          } else {
            failed++;
            setProxies((prev) =>
              prev.map((p) =>
                p.id === id
                  ? {
                      ...p,
                      testResult: {
                        success: false,
                        latencyMs: data?.latencyMs,
                        error: data?.error || `Proxy test failed ${res.statusText}`,
                      },
                    }
                  : p
              )
            );
          }
        } catch (error) {
          failed++;
          setProxies((prev) =>
            prev.map((p) =>
              p.id === id
                ? {
                    ...p,
                    testResult: {
                      success: false,
                      error: error instanceof Error ? error.message : "Network error",
                    },
                  }
                : p
            )
          );
        }
      }

      setBulkProgress(
        stopped
          ? `Stopped: ${succeeded} added, ${failed} failed`
          : `Complete: ${succeeded} added, ${failed} failed`
      );
      if (stopped) setSelected(new Set());
    } finally {
      setBulkAdding(false);
      setTimeout(() => setBulkProgress(null), 4000);
    }
  };

  const handleStopBulkAdd = () => {
    stopBulkAddRef.current = true;
  };

  const notInPoolProxies = proxies.filter((p) => !p.inPool);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <SourceToggleBar disabledSources={disabledSources} onToggle={handleToggleSource} />
        <div className="flex gap-2 ml-auto flex-wrap items-center">
          <select
            value={filterProtocol}
            onChange={(e) => setFilterProtocol(e.target.value)}
            className="text-xs bg-surface-alt border border-border rounded px-2 py-1"
            aria-label={t("proxyFreePoolFilterProtocol")}
          >
            <option value="">{t("proxyFreePoolProtocol")}</option>
            {["http", "https", "socks4", "socks5"].map((p) => (
              <option key={p} value={p}>
                {p.toUpperCase()}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder={t("proxyFreePoolCountryPlaceholder")}
            value={filterCountry}
            onChange={(e) => setFilterCountry(e.target.value.toUpperCase().slice(0, 2))}
            className="text-xs bg-surface-alt border border-border rounded px-2 py-1 w-28"
            aria-label={t("proxyFreePoolFilterCountry")}
          />
          <input
            type="number"
            placeholder={t("proxyFreePoolMinQualityPlaceholder")}
            value={minQuality}
            onChange={(e) => setMinQuality(e.target.value)}
            min={0}
            max={100}
            className="text-xs bg-surface-alt border border-border rounded px-2 py-1 w-24"
            aria-label={t("proxyFreePoolMinQualityLabel")}
          />
          <Button size="sm" variant="secondary" icon="sync" onClick={handleSync} disabled={syncing}>
            {syncing ? t("syncing") : t("proxyFreePoolSyncAll")}
          </Button>
        </div>
      </div>

      {stats && (
        <div className="text-xs text-text-muted flex gap-4 flex-wrap">
          <span>
            {t("proxyFreePoolTotal")}: {stats.total}
          </span>
          <span>
            {t("proxyFreePoolInPool")}: {stats.inPool}
          </span>
          {stats.avgQuality != null && (
            <span>
              {t("proxyFreePoolAvgQuality")}: {stats.avgQuality}
            </span>
          )}
          {stats.lastSyncAt && (
            <span>
              {t("lastSync")}: {new Date(stats.lastSyncAt).toLocaleTimeString()}
            </span>
          )}
        </div>
      )}

      {syncErrors && (
        <div
          className="text-xs text-red-500 flex flex-col gap-1"
          role="alert"
          data-testid="free-pool-sync-errors"
        >
          {Object.entries(syncErrors).map(([src, errs]) => (
            <span key={src}>
              {src}: {errs.join("; ")}
            </span>
          ))}
        </div>
      )}

      {selected.size > 0 && (
        <div className="flex items-center gap-2 p-2 bg-primary/10 rounded border border-primary/20">
          <span className="text-xs">{t("proxyFreePoolSelected", { count: selected.size })}</span>
          <Button
            size="sm"
            variant="primary"
            onClick={() => handleBulkAdd(Array.from(selected))}
            disabled={bulkAdding}
            loading={bulkAdding}
          >
            {t("proxyFreePoolAddSelected")}
          </Button>
          {bulkProgress && <span className="text-xs text-text-muted">{bulkProgress}</span>}
        </div>
      )}

      {notInPoolProxies.length > 0 && selected.size === 0 && (
        <div className="flex justify-end items-center gap-2">
          {bulkAdding ? (
            <>
              <span className="text-xs text-text-muted">{bulkProgress}</span>
              <Button size="sm" variant="secondary" icon="stop" onClick={handleStopBulkAdd}>
                {t("stop")}
              </Button>
            </>
          ) : (
            <>
              {bulkProgress && <span className="text-xs text-text-muted">{bulkProgress}</span>}
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleBulkAdd(notInPoolProxies.slice(0, 100).map((p) => p.id))}
                disabled={bulkAdding}
                loading={bulkAdding}
              >
                {t("proxyFreePoolAddVisible")}
              </Button>
            </>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded border border-border bg-surface">
        <table className="w-full min-w-[900px] text-sm whitespace-nowrap">
          <thead className="bg-surface-alt text-text-muted text-xs">
            <tr>
              <th className="px-3 py-2 text-left w-8" scope="col"></th>
              <th className="px-3 py-2 text-left" scope="col">
                {t("proxyFreePoolSource")}
              </th>
              <th className="px-3 py-2 text-left" scope="col">
                {t("proxyFreePoolHostPort")}
              </th>
              <th className="px-3 py-2 text-left" scope="col">
                {t("proxyFreePoolType")}
              </th>
              <th className="px-3 py-2 text-left" scope="col">
                {t("proxyFreePoolCountry")}
              </th>
              <th className="px-3 py-2 text-left" scope="col">
                {t("proxyFreePoolQuality")}
              </th>
              <th className="px-3 py-2 text-left" scope="col">
                {t("proxyFreePoolLatency")}
              </th>
              <th className="px-3 py-2 text-left" scope="col">
                Result
              </th>
              <th className="px-3 py-2 text-left" scope="col"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-text-muted">
                  {t("loading")}
                </td>
              </tr>
            ) : proxies.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-text-muted">
                  {t("proxyFreePoolEmpty")}
                </td>
              </tr>
            ) : (
              proxies.map((p) => (
                <FreeProxyRow
                  key={p.id}
                  proxy={p}
                  selected={selected.has(p.id)}
                  onToggleSelect={handleToggleSelect}
                  onAddToPool={handleAddToPool}
                  adding={addingIds.has(p.id)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
