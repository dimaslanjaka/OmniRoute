/**
 * Installer utilities — safe spawn wrapper for npm operations.
 *
 * Hard rule #13: never string-interpolate runtime values into shell commands.
 * All npm invocations use spawn() with an explicit args array, never exec().
 */

import { spawn } from "node:child_process";
import { sanitizeErrorMessage } from "@omniroute/open-sse/utils/error";

const DEFAULT_TIMEOUT_MS = 300_000; // 5 min — npm install can be slow

export interface NpmRunResult {
  stdout: string;
  stderr: string;
}

export class InstallError extends Error {
  constructor(
    message: string,
    public readonly friendly: string,
    public readonly httpStatus: number = 500
  ) {
    super(message);
    this.name = "InstallError";
  }
}

type NpmExecError = NodeJS.ErrnoException & {
  killed?: boolean;
  signal?: NodeJS.Signals | null;
  stdout?: string;
  stderr?: string;
};

/** Classify raw npm/OS errors into user-friendly messages. */
function classifyError(err: NpmExecError): InstallError {
  const raw = sanitizeErrorMessage(err.message);
  const stderr = err.stderr ?? "";

  if (err.code === "EACCES") {
    return new InstallError(
      raw,
      "Sem permissão para instalar. Verifique as permissões da pasta de dados.",
      403
    );
  }
  if (err.code === "ENOENT" && err.message.includes("npm")) {
    return new InstallError(
      raw,
      "Node.js/npm não está disponível no PATH. Instale Node ≥22.22.2.",
      500
    );
  }
  if (err.code === "ENOSPC" || stderr.includes("ENOSPC")) {
    return new InstallError(raw, "Espaço em disco insuficiente.", 507);
  }
  if (
    err.signal === "SIGTERM" ||
    err.code === "ETIMEDOUT" ||
    (err as Error & { killed?: boolean }).killed
  ) {
    return new InstallError(raw, "Instalação demorou demais. Tente novamente.", 504);
  }
  if (
    stderr.includes("ENOTFOUND") ||
    stderr.includes("network") ||
    stderr.includes("ECONNREFUSED") ||
    stderr.includes("ERR_INVALID_URL")
  ) {
    return new InstallError(
      raw,
      "Falha de rede ao instalar. Verifique a conexão e tente novamente.",
      503
    );
  }

  return new InstallError(raw, `Falha na instalação: ${raw}`, 500);
}

/**
 * Validates a user-supplied service version (npm dist-tag or semver). Constrained
 * to letters, digits and `. _ + -`, with a leading alphanumeric, so the value can
 * never carry shell metacharacters once `runNpm` runs under a shell on Windows
 * (see `buildNpmExecOptions`). Accepts `latest`, `next`, `1.2.3`, `1.2.3-beta.1`,
 * `1.2.3+build.5`; rejects `latest && calc`, `$(id)`, spaces, leading `-`, etc.
 */
export const SERVICE_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/;

export interface NpmExecOptions {
  cwd?: string;
  timeout: number;
  env: NodeJS.ProcessEnv;
  maxBuffer: number;
  shell?: boolean;
}

/**
 * Builds the `spawn` options for {@link runNpm}.
 *
 * On Windows, npm is `npm.cmd` (a batch wrapper), so `shell` is enabled on win32
 * to run it reliably across Node versions.
 *
 * Enabling the shell means NO runtime value may be interpolated into argv (Hard
 * Rule #13). The install prefix (a DATA_DIR path that can legitimately contain
 * spaces, e.g. `C:\Users\John Doe\.omniroute\…`) is therefore exported as the
 * `npm_config_prefix` environment variable — npm's documented env form of
 * `--prefix` — never as an argv entry. With the prefix moved to the environment
 * and the version constrained by {@link SERVICE_VERSION_PATTERN}, every remaining
 * argv entry is a static, metacharacter-free flag.
 */
export function buildNpmExecOptions(
  platform: NodeJS.Platform,
  options: { cwd?: string; timeoutMs: number; prefix?: string }
): NpmExecOptions {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (options.prefix) {
    env.npm_config_prefix = options.prefix;
  }
  const execOptions: NpmExecOptions = {
    cwd: options.cwd,
    timeout: options.timeoutMs,
    env,
    maxBuffer: 10 * 1024 * 1024, // 10 MB for npm output
  };
  if (platform === "win32") {
    execOptions.shell = true;
  }
  return execOptions;
}

/**
 * Runs npm with the given args array. Never uses shell interpolation: argv holds
 * only static flags, and any install prefix is passed via `options.prefix`
 * (exported as `npm_config_prefix`), not as an argv path. See
 * {@link buildNpmExecOptions} for the Windows shell handling.
 */
export function runNpm(
  args: string[],
  options: { cwd?: string; timeoutMs?: number; prefix?: string } = {}
): Promise<NpmRunResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  // On Windows, npm is npm.cmd; on Unix it's npm.
  const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";

  return new Promise((resolve, reject) => {
    const execOptions = buildNpmExecOptions(process.platform, {
      cwd: options.cwd,
      timeoutMs,
      prefix: options.prefix,
    });
    const child = spawn(npmBin, args, {
      cwd: execOptions.cwd,
      env: execOptions.env,
      shell: execOptions.shell,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
    }, execOptions.timeout);

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
      if (stdout.length > execOptions.maxBuffer) {
        child.kill("SIGTERM");
      }
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
      if (stderr.length > execOptions.maxBuffer) {
        child.kill("SIGTERM");
      }
    });
    child.on("error", (err) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      reject(classifyError(Object.assign(err, { stdout, stderr }) as NpmExecError));
    });
    child.on("close", (code, signal) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(
        classifyError(
          Object.assign(new Error(stderr || `npm exited with code ${code ?? "unknown"}`), {
            code: code === null ? undefined : String(code),
            killed: signal === "SIGTERM",
            signal,
            stdout,
            stderr,
          }) as NpmExecError
        )
      );
    });
  });
}
