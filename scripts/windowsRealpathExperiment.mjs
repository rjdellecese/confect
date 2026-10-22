import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import path from "node:path";
import { threadId } from "node:worker_threads";

const mode = process.env.CONFECT_REALPATH_EXPERIMENT;
const directory = process.env.CONFECT_REALPATH_METRICS_DIRECTORY;

if (directory && ["control", "native", "compatible"].includes(mode)) {
  const original = fs.realpath;
  let nativeAttempts = 0;
  let nativeAccepted = 0;
  let originalFallbacks = 0;
  const compatible = (...args) => {
    const fallback = () => {
      originalFallbacks++;
      return original(...args);
    };
    const [file, callback] = args;
    if (
      args.length !== 2 ||
      typeof file !== "string" ||
      typeof callback !== "function"
    )
      return fallback();
    try {
      const absolute = path.resolve(file);
      nativeAttempts++;
      return original.native(absolute, (error, resolved) => {
        if (error || resolved !== absolute) return fallback();
        nativeAccepted++;
        callback(null, resolved);
      });
    } catch {
      return fallback();
    }
  };
  const selected =
    mode === "compatible"
      ? compatible
      : mode === "native"
        ? original.native
        : original;
  let calls = 0;
  let completed = 0;
  let errors = 0;
  let totalMilliseconds = 0;
  let maxMilliseconds = 0;
  const measured = Object.assign(
    function (...args) {
      const callback = args.at(-1);
      if (typeof callback !== "function") return selected(...args);
      const start = performance.now();
      calls++;
      return selected(...args.slice(0, -1), (...result) => {
        const elapsed = performance.now() - start;
        completed++;
        if (result[0]) errors++;
        totalMilliseconds += elapsed;
        maxMilliseconds = Math.max(maxMilliseconds, elapsed);
        callback(...result);
      });
    },
    { native: original.native },
  );
  fs.realpath = measured;
  syncBuiltinESMExports();
  const started = Date.now();
  const write = (final = false) => {
    try {
      fs.writeFileSync(
        path.join(directory, `realpath-${process.pid}-${threadId}.json`),
        JSON.stringify({
          pid: process.pid,
          parentPid: process.ppid,
          threadId,
          mode,
          active: fs.realpath === measured,
          final,
          timestamp: Date.now(),
          calls,
          completed,
          errors,
          totalMilliseconds,
          maxMilliseconds,
          nativeAttempts,
          nativeAccepted,
          originalFallbacks,
        }),
      );
    } catch {
      return;
    }
  };
  write();
  const timer = setInterval(() => {
    if (Date.now() - started >= 600_000) clearInterval(timer);
    else write();
  }, 1000);
  timer.unref();
  process.once("exit", () => write(true));
}
