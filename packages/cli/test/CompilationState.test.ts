import { describe, expect, it } from "@effect/vitest";
import * as CompilationState from "@confect/cli/CompilationState";
import type * as esbuild from "esbuild";

describe("CompilationState", () => {
  it("visits shared and cyclic graph entries once per fingerprint", () => {
    const leaves = Array.from({ length: 390 }, (_, index) => `leaf-${index}`);
    const edges = (paths: ReadonlyArray<string>) =>
      paths.map((path) => ({ path, kind: "import-statement" as const }));
    const entries = {
      root: { bytes: 1, imports: edges(leaves) },
      shared: { bytes: 1, imports: edges(["root", "missing"]) },
      ...Object.fromEntries(
        leaves.map((leaf) => [
          leaf,
          { bytes: 1, imports: edges(["shared", "missing"]) },
        ]),
      ),
    };
    let reads = 0;
    const inputs = new Proxy(entries, {
      get(target, key, receiver) {
        reads++;
        return Reflect.get(target, key, receiver);
      },
    });
    const hashes = Object.fromEntries(
      Object.keys(entries).map((file) => [file, file]),
    );
    const fingerprint = CompilationState.fingerprintInput(
      { inputs, outputs: {} },
      { inputs: hashes, outputs: {} },
      "root",
      "missing-output",
    );
    expect(reads).toBe(leaves.length + 3);
    expect(fingerprint).toBe(
      JSON.stringify({
        outputs: [],
        inputs: Object.entries(hashes).sort(([a], [b]) =>
          a < b ? -1 : a > b ? 1 : 0,
        ),
      }),
    );
    expect(entries.shared.imports).toEqual(edges(["root", "missing"]));
  });

  it("coalesces consumed roots without mutating earlier receipts", () => {
    const receipt = { context: 1, revision: 2, roots: ["a"] };
    const next = CompilationState.consume([receipt], receipt, ["b", "a"]);
    expect(next).toEqual([{ context: 1, revision: 2, roots: ["a", "b"] }]);
    expect(receipt.roots).toEqual(["a"]);
  });
  it("includes each output path rather than just the content-hash multiset", () => {
    const metafile: esbuild.Metafile = {
      inputs: { source: { bytes: 1, imports: [] } },
      outputs: {
        entry: {
          entryPoint: "source",
          bytes: 1,
          inputs: {},
          exports: [],
          imports: [
            { path: "left", kind: "import-statement" },
            { path: "right", kind: "import-statement" },
          ],
        },
        left: { bytes: 1, inputs: {}, exports: [], imports: [] },
        right: { bytes: 1, inputs: {}, exports: [], imports: [] },
      },
    };
    const original = CompilationState.fingerprintInput(
      metafile,
      {
        inputs: { source: "input" },
        outputs: { entry: "entry", left: "one", right: "two" },
      },
      "source",
      "entry",
    );
    const swapped = CompilationState.fingerprintInput(
      metafile,
      {
        inputs: { source: "input" },
        outputs: { entry: "entry", left: "two", right: "one" },
      },
      "source",
      "entry",
    );
    expect(original).not.toBe(swapped);
  });
  it("acknowledges only covered roots up to the consumed revision", () => {
    const receipts = [{ context: 1, revision: 2, roots: ["a"] }];
    const event = {
      context: 1,
      revision: 2,
      roots: ["a", "b"],
      affectedRoots: ["a"],
      errors: [],
      warnings: [],
    };
    expect(CompilationState.acknowledged(event, receipts)).toBe(true);
    expect(
      CompilationState.acknowledged({ ...event, revision: 3 }, receipts),
    ).toBe(false);
    expect(
      CompilationState.acknowledged({ ...event, context: 2 }, receipts),
    ).toBe(false);
    expect(
      CompilationState.acknowledged({ ...event, revision: 1 }, receipts),
    ).toBe(true);
    expect(
      CompilationState.unacknowledgedRoots(
        { ...event, affectedRoots: ["a", "b"] },
        receipts,
      ),
    ).toEqual(["b"]);
  });
  it("reuses compatible supersets without mixing profiles", () => {
    const topology = {
      id: 1,
      profile: "modules",
      roots: ["a", "b"],
    } as const;
    expect(CompilationState.compatible(topology, "modules", ["b"])).toBe(true);
    expect(CompilationState.compatible(topology, "modules", ["c"])).toBe(false);
    expect(
      CompilationState.compatible(topology, "component-config", ["b"]),
    ).toBe(false);
  });
  it("retires only contexts whose roots have replacement coverage", () => {
    const contexts = Array.from({ length: 8 }, (_, id) => ({
      id,
      profile: "modules" as const,
      roots: [`${id}`],
    }));
    const incoming = {
      id: 9,
      profile: "modules" as const,
      roots: ["0", "1", "new"],
    };
    expect(
      CompilationState.retain(contexts, incoming).map(({ id }) => id),
    ).toEqual([2, 3, 4, 5, 6, 7]);
    expect(contexts).toHaveLength(8);
  });
});
