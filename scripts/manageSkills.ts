import * as BunRuntime from "@effect/platform-bun/BunRuntime";
import * as BunServices from "@effect/platform-bun/BunServices";
import * as Console from "effect/Console";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Runtime from "effect/Runtime";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";
import { syncSkillIgnore } from "./syncSkillIgnore";

const MUTATING_COMMANDS = new Set([
  "a",
  "add",
  "experimental_install",
  "experimental_sync",
  "i",
  "install",
  "r",
  "remove",
  "rm",
  "update",
  "upgrade",
]);

class SkillsCommandFailed extends Data.TaggedError("SkillsCommandFailed")<{
  readonly exitCode: number;
}> {
  readonly [Runtime.errorExitCode] = this.exitCode;
  readonly [Runtime.errorReported] = false;
}

export const shouldSyncSkillIgnore = (command: string | undefined): boolean =>
  command !== undefined && MUTATING_COMMANDS.has(command);

export const manageSkills = Effect.fn("Skills.manage")(function* (
  args: ReadonlyArray<string>,
) {
  const childProcesses = yield* ChildProcessSpawner.ChildProcessSpawner;
  const executable = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const command = ChildProcess.make(executable, ["exec", "skills", ...args], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = yield* childProcesses.exitCode(command);

  if (exitCode !== 0) {
    return yield* new SkillsCommandFailed({ exitCode });
  }
  if (shouldSyncSkillIgnore(args[0])) {
    yield* syncSkillIgnore();
  }
});

if (import.meta.main) {
  manageSkills(Bun.argv.slice(2)).pipe(
    Effect.tapErrorTag("SkillIgnoreError", (error) =>
      Console.error(error.message),
    ),
    Effect.provide(BunServices.layer),
    BunRuntime.runMain,
  );
}
