import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const setup = async () => {
  if (process.env["CI"] === "true") {
    return;
  }

  const originalCwd = process.cwd();
  const testDir = import.meta.dirname;
  const cliDir = resolve(testDir, "../../cli");
  const cliBin = resolve(cliDir, "dist/index.mjs");

  await execFileAsync("pnpm", ["--dir", cliDir, "build"]);
  process.chdir(testDir);

  try {
    await execFileAsync(process.execPath, [cliBin, "codegen"]);
  } finally {
    process.chdir(originalCwd);
  }
};
