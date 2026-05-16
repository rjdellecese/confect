import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";

const SERVER_PACKAGE_DIR = path.resolve(import.meta.dirname, "../..");
const READY_LINE = "Convex functions ready!";

/**
 * Spawn `convex dev` from `packages/server/` with reduced UDF timeouts so
 * `MAX_CACHE_AGE` shrinks to ~3s in the local-backend Rust process. The CLI
 * is left running for the lifetime of the test suite; the local backend is
 * its child process and dies when the CLI is signalled.
 *
 * Resolves once the CLI prints "Convex functions ready!".
 */
export const spawnLocalBackend = async (): Promise<{
  url: string;
  child: ChildProcess;
  stop: () => Promise<void>;
}> => {
  // Reset deployment state to a known-good blank slate every run so this
  // test does not interact with whatever the developer last did locally.
  for (const stale of [".convex", ".env.local"]) {
    const target = path.join(SERVER_PACKAGE_DIR, stale);
    if (existsSync(target)) {
      rmSync(target, { recursive: true, force: true });
    }
  }

  const child = spawn(
    "pnpm",
    [
      "convex",
      "dev",
      "--typecheck=disable",
      "--codegen=disable",
      "--tail-logs=disable",
    ],
    {
      cwd: SERVER_PACKAGE_DIR,
      env: {
        ...process.env,
        CONVEX_AGENT_MODE: "anonymous",
        // Knobs read by `crates/common/src/knobs.rs` in `convex-backend`.
        // `MAX_CACHE_AGE = USER_TIMEOUT + SYSTEM_TIMEOUT + 1s`, so this gives
        // us ~3s before a time-observed query is evicted from the cache.
        DATABASE_UDF_USER_TIMEOUT_SECONDS: "1",
        DATABASE_UDF_SYSTEM_TIMEOUT_SECONDS: "1",
      },
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  if (child.stdout === null || child.stderr === null) {
    throw new Error("convex dev was spawned without piped stdout/stderr");
  }
  const stdout = child.stdout;
  const stderr = child.stderr;

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          `convex dev did not print "${READY_LINE}" within 90s (cold-start binary download?)`,
        ),
      );
    }, 90_000);

    const onChunk = (chunk: Buffer) => {
      if (chunk.toString().includes(READY_LINE)) {
        cleanup();
        resolve();
      }
    };
    const onExit = (code: number | null) => {
      cleanup();
      reject(
        new Error(
          `convex dev exited with code ${code ?? "null"} before becoming ready`,
        ),
      );
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    function cleanup() {
      clearTimeout(timeout);
      stdout.off("data", onChunk);
      stderr.off("data", onChunk);
      child.off("exit", onExit);
      child.off("error", onError);
    }

    stdout.on("data", onChunk);
    stderr.on("data", onChunk);
    child.on("exit", onExit);
    child.on("error", onError);
  });

  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) {
      return;
    }
    if (child.pid !== undefined) {
      try {
        // Negative PID kills the entire process group (CLI + local backend).
        process.kill(-child.pid, "SIGTERM");
      } catch {
        // Already dead.
      }
    }
    await new Promise<void>((resolve) => {
      const onExit = () => {
        clearTimeout(killTimeout);
        resolve();
      };
      const killTimeout = setTimeout(() => {
        if (child.pid !== undefined) {
          try {
            process.kill(-child.pid, "SIGKILL");
          } catch {
            // Already dead.
          }
        }
        resolve();
      }, 5_000);
      child.once("exit", onExit);
    });
  };

  return {
    url: "http://127.0.0.1:3210",
    child,
    stop,
  };
};
