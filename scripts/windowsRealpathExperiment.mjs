import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import path from "node:path";

const mode = process.env.CONFECT_REALPATH_EXPERIMENT;
const directory = process.env.CONFECT_REALPATH_METRICS_DIRECTORY;

if (directory && (mode === "control" || mode === "native")) {
  const original = fs.realpath;
  const selected = mode === "native" ? original.native : original;
  let calls = 0;
  let completed = 0;
  let errors = 0;
  let totalMilliseconds = 0;
  let maxMilliseconds = 0;
  fs.realpath = Object.assign(
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
  syncBuiltinESMExports();
  const started = Date.now();
  const write = (final = false) => {
    try {
      fs.writeFileSync(
        path.join(directory, `realpath-${process.pid}.json`),
        JSON.stringify({
          pid: process.pid,
          parentPid: process.ppid,
          mode,
          final,
          timestamp: Date.now(),
          calls,
          completed,
          errors,
          totalMilliseconds,
          maxMilliseconds,
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
