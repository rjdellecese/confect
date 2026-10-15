import { expect, it } from "@effect/vitest";
import * as WatchGraph from "@confect/cli/WatchGraph";
import type * as esbuild from "esbuild";

const input = (
  ...imports: ReadonlyArray<string>
): esbuild.Metafile["inputs"][string] => ({
  bytes: 0,
  imports: imports.map((path) => ({ path, kind: "import-statement" })),
});

it("finds transitive importers without including unrelated entry points", () => {
  const graph = WatchGraph.make(
    {
      inputs: {
        "a.impl.ts": input("shared.ts"),
        "b.impl.ts": input("shared.ts"),
        "c.impl.ts": input(),
        "shared.ts": input("helper.ts"),
        "helper.ts": input(),
      },
      outputs: {},
    },
    (file) => `/project/${file}`,
  );
  expect(
    [...WatchGraph.affected(graph, ["/project/helper.ts"])].sort(),
  ).toEqual([
    "/project/a.impl.ts",
    "/project/b.impl.ts",
    "/project/helper.ts",
    "/project/shared.ts",
  ]);
});

it("terminates on cycles and retains edges to removed dependencies", () => {
  const graph = WatchGraph.make(
    {
      inputs: { a: input("b"), b: input("a", "removed") },
      outputs: {},
    },
    (file) => file,
  );
  expect([...WatchGraph.affected(graph, ["removed"])].sort()).toEqual([
    "a",
    "b",
    "removed",
  ]);
});

it("does not traverse external dependency names", () => {
  const graph = WatchGraph.make(
    {
      inputs: {
        a: {
          bytes: 0,
          imports: [
            { path: "effect", kind: "import-statement", external: true },
          ],
        },
      },
      outputs: {},
    },
    (file) => file,
  );
  expect([...WatchGraph.affected(graph, ["effect"])]).toEqual(["effect"]);
});
