import { Spec } from "@confect/core";
import { FileSystem, Path } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { describe, expect, test } from "@effect/vitest";
import { Effect } from "effect";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import nodePath from "node:path";
import { generateFunctions } from "../src/utils";
import { ConfectDirectory } from "../src/services/ConfectDirectory";
import { ConfectConfig } from "../src/services/ConfectConfig";
import { ConvexDirectory } from "../src/services/ConvexDirectory";
import { ProjectRoot } from "../src/services/ProjectRoot";

const withTempProject = async <A>(
  {
    preserveConvexFileNames,
    convexFiles,
  }: {
    preserveConvexFileNames: readonly string[];
    convexFiles: Readonly<Record<string, string>>;
  },
  run: (projectRoot: string) => Promise<A>,
) => {
  const projectRoot = await mkdtemp(
    nodePath.join(os.tmpdir(), "confect-cli-config-test-"),
  );

  try {
    await writeFile(
      nodePath.join(projectRoot, "package.json"),
      JSON.stringify({ name: "confect-config-test", private: true }),
    );

    const convexDirectory = nodePath.join(projectRoot, "convex");
    await mkdir(convexDirectory, { recursive: true });
    const confectDirectory = nodePath.join(projectRoot, "confect");
    await mkdir(confectDirectory, { recursive: true });
    await writeFile(
      nodePath.join(confectDirectory, "confect.json"),
      JSON.stringify({ preserveConvexFileNames }),
    );

    await Promise.all(
      Object.entries(convexFiles).map(([fileName, contents]) =>
        writeFile(nodePath.join(convexDirectory, fileName), contents),
      ),
    );

    return await run(projectRoot);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
};

const runSyncForProject = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const convexDirectory = yield* ConvexDirectory.get;
  const preservedConvexFileNames =
    yield* ConfectConfig.getPreservedConvexFileNames;

  yield* generateFunctions(Spec.make(), preservedConvexFileNames);

  return {
    keepExists: yield* fs.exists(path.join(convexDirectory, "keep.ts")),
    removeExists: yield* fs.exists(path.join(convexDirectory, "remove.ts")),
    deleteMeExists: yield* fs.exists(
      path.join(convexDirectory, "delete-me.ts"),
    ),
  };
}).pipe(
  Effect.provide(ConfectConfig.Default),
  Effect.provide(ConfectDirectory.Default),
  Effect.provide(ConvexDirectory.Default),
  Effect.provide(ProjectRoot.Default),
  Effect.provide(NodeContext.layer),
);

describe("ConfectConfig preserveConvexFileNames", () => {
  test("does not delete a file listed in config", async () => {
    await withTempProject(
      {
        preserveConvexFileNames: ["keep.ts"],
        convexFiles: {
          "keep.ts": "export const keep = 1;\n",
          "remove.ts": "export const remove = 1;\n",
        },
      },
      async (projectRoot) => {
        const originalCwd = process.cwd();
        process.chdir(projectRoot);
        try {
          const result = await Effect.runPromise(runSyncForProject);
          expect(result.keepExists).toBe(true);
          expect(result.removeExists).toBe(false);
        } finally {
          process.chdir(originalCwd);
        }
      },
    );
  });

  test("deletes files that are not listed in config", async () => {
    await withTempProject(
      {
        preserveConvexFileNames: ["keep.ts"],
        convexFiles: {
          "delete-me.ts": "export const removeMe = 1;\n",
        },
      },
      async (projectRoot) => {
        const originalCwd = process.cwd();
        process.chdir(projectRoot);
        try {
          const result = await Effect.runPromise(runSyncForProject);
          expect(result.deleteMeExists).toBe(false);
        } finally {
          process.chdir(originalCwd);
        }
      },
    );
  });
});
