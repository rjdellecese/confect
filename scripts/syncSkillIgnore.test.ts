import * as BunServices from "@effect/platform-bun/BunServices";
import { expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { shouldSyncSkillIgnore } from "./manageSkills";
import {
  installedDirectoryName,
  syncSkillIgnore,
  updateManagedBlock,
  vendoredSkillDirectories,
} from "./syncSkillIgnore";

const runTest = <A, E>(
  effect: Effect.Effect<A, E, BunServices.BunServices>,
): Promise<A> =>
  Effect.runPromise(effect.pipe(Effect.provide(BunServices.layer)));

test("derives sorted installed directories from the lock", () =>
  runTest(
    Effect.gen(function* () {
      const lock = JSON.stringify({
        version: 1,
        skills: {
          zed: {},
          "Convex Best Practices": {},
          effect: {},
        },
      });

      expect(yield* vendoredSkillDirectories(lock)).toEqual([
        "convex-best-practices",
        "effect",
        "zed",
      ]);
      expect(installedDirectoryName("../Unsafe Skill")).toBe("unsafe-skill");
    }),
  ));

test("rejects malformed, unsupported, and colliding lock entries", () =>
  runTest(
    Effect.gen(function* () {
      const malformed = yield* vendoredSkillDirectories("{").pipe(Effect.flip);
      expect(malformed.message).toMatch(/Could not parse skills-lock\.json/u);

      const unsupported = yield* vendoredSkillDirectories(
        '{"version":2,"skills":{}}',
      ).pipe(Effect.flip);
      expect(unsupported.message).toMatch(
        /Unsupported skills-lock\.json version/u,
      );

      const collision = yield* vendoredSkillDirectories(
        JSON.stringify({
          version: 1,
          skills: { "same skill": {}, "same-skill": {} },
        }),
      ).pipe(Effect.flip);
      expect(collision.message).toMatch(/same installed directory/u);
    }),
  ));

test("replaces only the managed ignore block", () =>
  runTest(
    Effect.gen(function* () {
      const current = [
        "dist/",
        "# skills-lock:start",
        ".agents/skills/old/",
        "# skills-lock:end",
        "coverage/",
        "",
      ].join("\n");
      const block = [
        "# skills-lock:start",
        "# Generated",
        ".agents/skills/effect/",
        "# skills-lock:end",
      ].join("\n");

      expect(yield* updateManagedBlock(current, block)).toBe(
        ["dist/", block, "coverage/", ""].join("\n"),
      );
    }),
  ));

test("writes generated output and detects later drift", () =>
  runTest(
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const cwd = yield* fs.makeTempDirectoryScoped({
          prefix: "confect-skill-ignore-",
        });
        const lockPath = path.join(cwd, "skills-lock.json");
        const ignorePath = path.join(cwd, ".ignore");
        yield* fs.writeFileString(
          lockPath,
          JSON.stringify({ version: 1, skills: { effect: {} } }),
        );
        yield* fs.writeFileString(ignorePath, "dist/\n");

        yield* syncSkillIgnore({ cwd });
        expect(yield* fs.readFileString(ignorePath)).toMatch(
          /dist\/\n\n# skills-lock:start\n[\s\S]*\.agents\/skills\/effect\/\n# skills-lock:end\n/u,
        );
        yield* syncSkillIgnore({ check: true, cwd });

        yield* fs.writeFileString(
          lockPath,
          JSON.stringify({
            version: 1,
            skills: { effect: {}, vitest: {} },
          }),
        );
        const drift = yield* syncSkillIgnore({ check: true, cwd }).pipe(
          Effect.flip,
        );
        expect(drift.message).toMatch(/pnpm skills:sync-ignore/u);
      }),
    ),
  ));

test("recognizes every mutating skills command alias", () => {
  for (const command of [
    "add",
    "a",
    "install",
    "i",
    "remove",
    "rm",
    "r",
    "update",
    "upgrade",
    "experimental_install",
    "experimental_sync",
  ]) {
    expect(shouldSyncSkillIgnore(command)).toBeTrue();
  }
  expect(shouldSyncSkillIgnore("list")).toBeFalse();
  expect(shouldSyncSkillIgnore(undefined)).toBeFalse();
});
