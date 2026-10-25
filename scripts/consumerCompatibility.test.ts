import { expect, test } from "bun:test";
import {
  consumerDependencies,
  graphProblems,
  installProblems,
  packedManifestProblems,
  profiles,
  provenanceProblems,
  type Candidate,
  type InstalledPackage,
} from "./consumerCompatibility";

const effect = (version: string): InstalledPackage => ({
  path: "/app/effect",
  manifest: { name: "effect", version },
  resolutions: {},
});
const peer = (name: string, range: string): InstalledPackage => ({
  path: `/app/${name}`,
  manifest: { name, version: "1.0.0", peerDependencies: { effect: range } },
  resolutions: { effect: "/app/effect" },
});
const roots = { effect: "/app/effect" };

test("requires local candidate provenance, not merely matching registry versions", () => {
  const candidate: Candidate = {
    manifest: { name: "@confect/core", version: "99.0.0" },
    tarball: "/artifacts/core.tgz",
    integrity: "sha512-candidate",
  };
  expect(
    provenanceProblems(
      candidate,
      { resolved: "file:../artifacts/core.tgz", integrity: "sha512-candidate" },
      "/artifacts/core.tgz",
      "npm",
    ),
  ).toEqual([]);
  expect(
    provenanceProblems(
      candidate,
      { resolved: "file:../artifacts/core.tgz" },
      "/artifacts/core.tgz",
      "pnpm",
    ),
  ).toEqual([]);
  expect(
    provenanceProblems(
      candidate,
      {
        resolved: "https://registry.npmjs.org/core.tgz",
        integrity: "sha512-candidate",
      },
      "/artifacts/core.tgz",
      "npm",
    ),
  ).not.toEqual([]);
  expect(
    provenanceProblems(
      candidate,
      { resolved: "file:/other/core.tgz", integrity: "sha512-candidate" },
      "/other/core.tgz",
      "pnpm",
    ),
  ).not.toEqual([]);
  expect(
    provenanceProblems(
      candidate,
      { resolved: "file:/artifacts/core.tgz", integrity: "sha512-old" },
      "/artifacts/core.tgz",
      "npm",
    ),
  ).not.toEqual([]);
  expect(
    provenanceProblems(candidate, undefined, undefined, "pnpm"),
  ).not.toEqual([]);
});

test("both advertised profiles include the whole backend and CLI graph", () => {
  expect(profiles.react.packages).toEqual(["core", "server", "cli", "react"]);
  expect(profiles.foldkit.packages).toEqual([
    "core",
    "server",
    "cli",
    "js",
    "foldkit",
  ]);
  expect(profiles.foldkit.blocker).toContain("Restore compatibility");
});

test("the coherent baseline selects both moving Node companions; fresh resolution does not", () => {
  expect(consumerDependencies("react", "baseline")).toMatchObject({
    effect: "4.0.4",
    "@effect/platform-node": "4.0.4",
    "@effect/platform-node-shared": "4.0.4",
  });
  expect(consumerDependencies("react", "fresh")).toMatchObject({
    effect: "^4.0.4",
    "@effect/platform-node": "^4.0.4",
  });
  expect(consumerDependencies("react", "fresh")).not.toHaveProperty(
    "@effect/platform-node-shared",
  );
});

test.each(["4.0.0", "4.0.1", "4.0.3"])(
  "rejects the recorded Foldkit full-app peer edges at Effect %s",
  (version) => {
    const graph = [
      effect(version),
      peer("foldkit", "4.0.0"),
      peer("@confect/server", "^4.0.1"),
    ];
    const problems = graphProblems(graph, [], roots, "/app");
    expect(
      problems.filter((problem) => problem._tag === "InvalidPeer"),
    ).toHaveLength(1);
  },
);

test("detects transitive-minimum drift even with platform-node itself pinned", () => {
  const stable = [
    effect("4.0.1"),
    peer("@effect/platform-node", "^4.0.1"),
    peer("@effect/platform-node-shared", "^4.0.1"),
  ];
  expect(graphProblems(stable, [], roots, "/app")).toEqual([]);
  const drifted = [
    ...stable.slice(0, 2),
    peer("@effect/platform-node-shared", "^4.0.3"),
  ];
  expect(graphProblems(drifted, [], roots, "/app")).toEqual([
    {
      _tag: "InvalidPeer",
      package: "@effect/platform-node-shared",
      dependency: "effect",
      expected: "^4.0.3",
      actual: "4.0.1",
    },
  ]);
  expect(stable[2]?.manifest.peerDependencies?.effect).toBe("^4.0.1");
});

test.each([
  [0, "WARN Issues with peer dependencies found"],
  [0, "npm warn ERESOLVE overriding peer dependency"],
  [0, "unmet peer effect@4.0.0: found 4.0.1"],
  [0, "Ignored build scripts: esbuild"],
  [1, ""],
  [null, ""],
] as const)(
  "fails closed on installer exit %s and diagnostics %s",
  (status, output) => {
    expect(installProblems(status, output).length).toBeGreaterThan(0);
  },
);

test("does not confuse deprecation and funding notices with peer failures", () => {
  expect(
    installProblems(
      0,
      "npm warn deprecated old-package\n3 packages are looking for funding",
    ),
  ).toEqual([]);
});

test("checks pnpm's workspace peer rewriting against candidate versions, including unpublished bumps", () => {
  const source = {
    name: "@confect/server",
    version: "10.3.0",
    peerDependencies: { "@confect/core": "workspace:^", effect: "^4.0.1" },
  };
  const packed = {
    ...source,
    peerDependencies: { "@confect/core": "^10.3.0", effect: "^4.0.1" },
  };
  expect(
    packedManifestProblems(source, packed, { "@confect/core": "10.3.0" }),
  ).toEqual([]);
  expect(
    packedManifestProblems(source, source, { "@confect/core": "10.3.0" }),
  ).not.toEqual([]);
  expect(
    packedManifestProblems(
      source,
      {
        ...packed,
        peerDependencies: { ...packed.peerDependencies, effect: "4.0.1" },
      },
      { "@confect/core": "10.3.0" },
    ),
  ).not.toEqual([]);
  expect(source.peerDependencies["@confect/core"]).toBe("workspace:^");
});

test("rejects registry siblings, missing candidates, linked source, and split Effect instances", () => {
  const candidate: Candidate = {
    manifest: { name: "@confect/core", version: "99.0.0" },
    tarball: "/artifacts/core.tgz",
    integrity: "sha512-example",
  };
  const graph: ReadonlyArray<InstalledPackage> = [
    {
      manifest: { name: "@confect/core", version: "10.2.0" },
      path: "/app/other-core",
      resolutions: {},
    },
    { ...effect("4.0.1"), path: "/workspace/effect" },
  ];
  expect(
    graphProblems(
      graph,
      [candidate],
      { ...roots, "@confect/core": "/app/core" },
      "/app",
    ).map((problem) => problem._tag),
  ).toEqual([
    "WrongCandidate",
    "ExternalPath",
    "SplitRuntime",
    "WrongCandidate",
  ]);
});

test("optional absent peers are allowed, installed invalid optional peers are not", () => {
  const optional = {
    ...peer("optional", "^4.0.3"),
    manifest: {
      ...peer("optional", "^4.0.3").manifest,
      peerDependenciesMeta: { effect: { optional: true } },
    },
  };
  expect(
    graphProblems([{ ...optional, resolutions: {} }], [], {}, "/app"),
  ).toEqual([]);
  expect(
    graphProblems([optional, effect("4.0.1")], [], roots, "/app")[0]?._tag,
  ).toBe("InvalidPeer");
});
