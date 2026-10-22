import { describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const preload = new URL("./windowsRealpathExperiment.mjs", import.meta.url)
  .href;

describe("Windows realpath experiment", () => {
  for (const mode of ["control", "native", "disabled"]) {
    it(`preserves canonical paths, callback errors and encoding in ${mode} mode`, () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "realpath-test-"));
      try {
        const nested = path.join(root, "nested", "directory");
        fs.mkdirSync(nested, { recursive: true });
        const file = path.join(nested, "file.txt");
        fs.writeFileSync(file, "fixture");
        const alias = path.join(root, "alias");
        fs.symlinkSync(nested, alias, "junction");
        const deep = path.join(root, ...Array(6).fill("directory".repeat(6)));
        fs.mkdirSync(deep, { recursive: true });
        fs.writeFileSync(path.join(deep, "file.txt"), "fixture");
        execFileSync(
          "node",
          [
            "--import",
            preload,
            "--input-type=module",
            "--eval",
            `
              import fs from "node:fs";
              import path from "node:path";
              import assert from "node:assert/strict";
              import { promisify } from "node:util";
              const root = process.env.REALPATH_TEST_ROOT;
              const file = path.join(root, "nested", "directory", "file.txt");
              const canonical = fs.realpathSync(file);
              const realpath = promisify(fs.realpath);
              assert.equal(await realpath(file), canonical);
              assert.equal(await realpath(path.join(root, "alias", "file.txt")), canonical);
              assert.deepEqual(await realpath(file, { encoding: "buffer" }), Buffer.from(canonical));
              await assert.rejects(realpath(path.join(root, "missing")), { code: "ENOENT" });
              await assert.rejects(realpath(path.join(file, "child")), { code: "ENOTDIR" });
              assert.equal(await promisify(fs.realpath.native)(file), canonical);
              const deep = path.join(root, ...Array(6).fill("directory".repeat(6)), "file.txt");
              assert.equal(await realpath(deep), fs.realpathSync(deep));
            `,
          ],
          {
            env: {
              ...process.env,
              CONFECT_REALPATH_EXPERIMENT: mode,
              CONFECT_REALPATH_METRICS_DIRECTORY: root,
              REALPATH_TEST_ROOT: root,
            },
            stdio: "pipe",
          },
        );
        const reports = fs
          .readdirSync(root)
          .filter((name) => /^realpath-\d+\.json$/.test(name));
        if (mode === "disabled") {
          expect(reports).toEqual([]);
        } else {
          expect(reports).toHaveLength(1);
          const report = JSON.parse(
            fs.readFileSync(path.join(root, reports[0]), "utf8"),
          );
          expect(report).toMatchObject({
            mode,
            calls: 6,
            completed: 6,
            errors: 2,
          });
          expect(JSON.stringify(report)).not.toContain(root);
          expect(report.totalMilliseconds).toBeGreaterThanOrEqual(0);
        }
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  }
});
