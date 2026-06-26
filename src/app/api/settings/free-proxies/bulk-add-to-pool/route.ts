import { request as undiciRequest } from "undici";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { createErrorResponse, createErrorResponseFromUnknown } from "@/lib/api/errorResponse";
import { isValidationFailure, validateBody } from "@/shared/validation/helpers";
import { freeProxyBulkAddSchema } from "@/shared/validation/freeProxySchemas";
import { getFreeProxyById, promoteFreeProxyToPool } from "@/lib/localDb";
import {
  createProxyDispatcher,
  proxyConfigToUrl,
} from "@omniroute/open-sse/utils/proxyDispatcher.ts";

type QuickTester = (
  host: string,
  port: number,
  type: string
) => Promise<{ ok: boolean; latencyMs: number }>;

type BulkAddResult = {
  id: string;
  success: boolean;
  poolProxyId?: string;
  error?: string;
};

const BULK_ADD_CONCURRENCY = 10;

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function testProxyQuick(
  host: string,
  port: number,
  type: string
): Promise<{ ok: boolean; latencyMs: number }> {
  const proxyUrl = proxyConfigToUrl({ type, host, port });
  if (!proxyUrl) return { ok: false, latencyMs: 0 };
  const dispatcher = createProxyDispatcher(proxyUrl);
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await undiciRequest("https://api64.ipify.org?format=json", {
      method: "GET",
      dispatcher,
      signal: controller.signal,
      headersTimeout: 5000,
      bodyTimeout: 5000,
    });
    await res.body.dump();
    return { ok: res.statusCode === 200, latencyMs: Date.now() - start };
  } catch {
    return { ok: false, latencyMs: Date.now() - start };
  } finally {
    clearTimeout(timeout);
  }
}

let _quickTester: QuickTester = testProxyQuick;
export function _setQuickTesterForTests(fn: QuickTester): void {
  _quickTester = fn;
}
export function _resetQuickTesterForTests(): void {
  _quickTester = testProxyQuick;
}

export async function POST(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  let rawBody: unknown = {};
  try {
    rawBody = await request.json();
  } catch {
    return createErrorResponse({
      status: 400,
      message: "Invalid JSON",
      type: "invalid_request",
    });
  }

  const validation = validateBody(freeProxyBulkAddSchema, rawBody);
  if (isValidationFailure(validation)) {
    return createErrorResponse({
      status: 400,
      message: validation.error.message,
      type: "invalid_request",
    });
  }

  try {
    const results = await mapWithConcurrency(
      validation.data.ids,
      BULK_ADD_CONCURRENCY,
      async (id): Promise<BulkAddResult> => {
        const freeProxy = await getFreeProxyById(id);
        if (!freeProxy) {
          return { id, success: false, error: "Not found" };
        }
        if (freeProxy.inPool) {
          return {
            id,
            success: true,
            poolProxyId: freeProxy.poolProxyId ?? undefined,
          };
        }

        const test = await _quickTester(freeProxy.host, freeProxy.port, freeProxy.type);
        if (!test.ok) {
          return { id, success: false, error: "Test failed" };
        }

        const newPoolProxyId = await promoteFreeProxyToPool(id, {
          name: `[${freeProxy.source}] ${freeProxy.host}:${freeProxy.port}`,
          type: freeProxy.type,
          host: freeProxy.host,
          port: freeProxy.port,
          source: freeProxy.source,
        });

        if (!newPoolProxyId) {
          return { id, success: false, error: "Failed to create registry entry" };
        }

        return { id, success: true, poolProxyId: newPoolProxyId };
      }
    );

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    return Response.json({ succeeded, failed, results });
  } catch (error) {
    return createErrorResponseFromUnknown(error, "Bulk add failed");
  }
}
