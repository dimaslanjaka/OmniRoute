import { ensureInstalledRow, getOrInitSupervisor } from "../_lib";
import { createErrorResponse } from "@/lib/api/errorResponse";
import { sanitizeErrorMessage } from "@omniroute/open-sse/utils/error";

export async function POST(): Promise<Response> {
  try {
    if (!(await ensureInstalledRow())) {
      return createErrorResponse({ status: 409, message: "9router is not installed." });
    }

    const sup = await getOrInitSupervisor();
    const status = await sup.start();
    return Response.json(status);
  } catch (err) {
    const msg = sanitizeErrorMessage(err instanceof Error ? err.message : String(err));
    return createErrorResponse({ status: 503, message: msg });
  }
}
