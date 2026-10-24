import { expect, test } from "bun:test";
import { partitionCliTests, sortCliTests } from "./cliTestSequencer";

const specifications = (root: string) =>
  [
    "test/codegen.test.ts",
    "test/Evaluation.test.ts",
    "test/dev.test.ts",
    "test/CompilationConfig.test.ts",
    "test/templates.test.ts",
    "test/Compilation.test.ts",
    "test/newModule.test.ts",
    "test/unknown.test.ts",
  ].flatMap((file) =>
    ["forks", "typescript"].map((pool) => ({
      moduleId: `${root}/${file}`,
      pool,
    })),
  );

test("assigns every runtime and typecheck specification exactly once", () => {
  const files = specifications("/workspace/packages/cli");
  const original = files.slice();
  const shards = partitionCliTests(files, 4);
  expect(shards.flat()).toHaveLength(files.length);
  expect(new Set(shards.flat())).toEqual(new Set(files));
  for (const file of files) {
    const shard = shards.find((group) => group.includes(file));
    expect(
      shard?.filter((item) => item.moduleId === file.moduleId),
    ).toHaveLength(2);
  }
  expect(files).toEqual(original);
});

test("balances expensive files instead of distributing equal file counts", () => {
  const shards = partitionCliTests(
    specifications("/workspace/packages/cli"),
    4,
  );
  expect(shards[0].map((file) => testName(file.moduleId))).toEqual([
    "codegen.test.ts",
    "codegen.test.ts",
  ]);
  expect(shards[1].map((file) => testName(file.moduleId))).toEqual([
    "Evaluation.test.ts",
    "Evaluation.test.ts",
  ]);
  expect(shards[2].length).toBeGreaterThan(2);
  expect(shards[3].length).toBeGreaterThan(2);
});

const testName = (moduleId: string) =>
  moduleId.replaceAll("\\", "/").split("/test/").at(-1) ?? moduleId;

test("keeps assignments deterministic across discovery order and operating systems", () => {
  const linux = specifications(
    "/home/runner/work/confect/confect/packages/cli",
  );
  const windows = specifications("D:/a/confect/confect/packages/cli").map(
    (file) => ({
      pool: file.pool,
      moduleId: file.moduleId.replaceAll("/", "\\"),
    }),
  );
  const names = (shards: ReturnType<typeof partitionCliTests>) =>
    shards.map((shard) =>
      shard
        .map((file) => testName(file.moduleId))
        .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0)),
    );
  expect(names(partitionCliTests(linux, 4))).toEqual(
    names(partitionCliTests(windows.toReversed(), 4)),
  );
});

test("supports filtered runs, unknown files, and more shards than files", () => {
  const files = [{ moduleId: "/workspace/packages/cli/test/future.test.ts" }];
  expect(partitionCliTests(files, 1)).toEqual([files]);
  expect(partitionCliTests(files, 4)).toEqual([files, [], [], []]);
  expect(partitionCliTests([], 4)).toEqual([[], [], [], []]);
});

test("starts the longest files first without mutating the input", () => {
  const files = specifications("/workspace/packages/cli").toReversed();
  const original = files.slice();
  expect(
    sortCliTests(files)
      .slice(0, 4)
      .map((file) => testName(file.moduleId)),
  ).toEqual([
    "codegen.test.ts",
    "codegen.test.ts",
    "Evaluation.test.ts",
    "Evaluation.test.ts",
  ]);
  expect(files).toEqual(original);
});
