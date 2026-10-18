import { describe, expect, it } from "@effect/vitest";
import * as CompilationState from "@confect/cli/CompilationState";

describe("CompilationState", () => {
  it("ignores output and byte-count metadata while retaining authored input graph identity", () => {
    const root = {
      bytes: 1,
      imports: [{ path: "generated", kind: "import-statement" as const }],
    };
    const generated = {
      bytes: 1,
      imports: [{ path: "authored", kind: "import-statement" as const }],
    };
    const authored = { bytes: 1, imports: [] };
    const metafile = { inputs: { root, generated, authored }, outputs: {} };
    const hashes = {
      root: "root",
      generated: "generated",
      authored: "authored",
    };
    const original = CompilationState.fingerprintInput(
      metafile,
      hashes,
      "root",
      ["generated"],
    );
    expect(
      CompilationState.fingerprintInput(
        {
          ...metafile,
          inputs: { ...metafile.inputs, root: { ...root, bytes: 100 } },
        },
        { ...hashes, generated: "rewritten" },
        "root",
        ["generated"],
      ),
    ).toBe(original);
    expect(
      CompilationState.fingerprintInput(
        metafile,
        { ...hashes, authored: "edited" },
        "root",
        ["generated"],
      ),
    ).not.toBe(original);
    expect(
      CompilationState.fingerprintInput(
        {
          ...metafile,
          inputs: {
            ...metafile.inputs,
            generated: { ...generated, imports: [] },
          },
        },
        hashes,
        "root",
        ["generated"],
      ),
    ).not.toBe(original);
  });
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
      hashes,
      "root",
    );
    expect(reads).toBe(leaves.length + 3);
    expect(fingerprint).toBe(
      JSON.stringify({
        inputs: Object.entries(entries)
          .map(([file, metadata]) => [
            file,
            JSON.stringify([hashes[file], metadata.imports]),
          ])
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
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
    const original = CompilationState.fingerprintArtifacts({
      entry: "entry",
      left: "one",
      right: "two",
    });
    const swapped = CompilationState.fingerprintArtifacts({
      entry: "entry",
      left: "two",
      right: "one",
    });
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
      configuration: undefined,
      roots: ["a", "b"],
    } as const;
    expect(
      CompilationState.compatible(topology, "modules", ["b"], undefined),
    ).toBe(true);
    expect(
      CompilationState.compatible(topology, "modules", ["c"], undefined),
    ).toBe(false);
    expect(
      CompilationState.compatible(
        topology,
        "component-config",
        ["b"],
        undefined,
      ),
    ).toBe(false);
    expect(
      CompilationState.compatible(
        topology,
        "modules",
        ["b"],
        "/project/tsconfig.json",
      ),
    ).toBe(false);
    expect(
      CompilationState.compatible(
        { ...topology, configuration: "/project/tsconfig.json" },
        "modules",
        ["b"],
        "/project/tsconfig.json",
      ),
    ).toBe(true);
  });
  it("retires only contexts whose roots have replacement coverage", () => {
    const contexts = Array.from({ length: 8 }, (_, id) => ({
      id,
      profile: "modules" as const,
      configuration: undefined,
      roots: [`${id}`],
    }));
    const incoming = {
      id: 9,
      profile: "modules" as const,
      configuration: undefined,
      roots: ["0", "1", "new"],
    };
    expect(
      CompilationState.retain(contexts, incoming).map(({ id }) => id),
    ).toEqual([2, 3, 4, 5, 6, 7]);
    expect(contexts).toHaveLength(8);
    expect(
      CompilationState.retain(contexts, {
        ...incoming,
        configuration: "/other/tsconfig.json",
      }),
    ).toEqual(contexts);
  });
});
