import * as Arr from "effect/Array";
import * as Str from "effect/String";
import * as Record from "effect/Record";
import * as Schema from "effect/Schema";
import { dual } from "effect/Function";

export const Manifest = Schema.Struct({
  name: Schema.String,
  version: Schema.String,
  dependencies: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  peerDependencies: Schema.optional(
    Schema.Record(Schema.String, Schema.String),
  ),
  optionalDependencies: Schema.optional(
    Schema.Record(Schema.String, Schema.String),
  ),
  peerDependenciesMeta: Schema.optional(
    Schema.Record(
      Schema.String,
      Schema.Struct({ optional: Schema.optional(Schema.Boolean) }),
    ),
  ),
});
export type Manifest = typeof Manifest.Type;

export const profiles = {
  react: {
    packages: ["core", "server", "cli", "react"],
    hosts: { react: "^19.0.0" },
    baseline: { react: "19.3.0" },
  },
  foldkit: {
    packages: ["core", "server", "cli", "js", "foldkit"],
    hosts: { foldkit: "^0.170.0", "@effect/platform-browser": "~4.1.0" },
    baseline: { foldkit: "0.170.0", "@effect/platform-browser": "4.1.0" },
  },
} as const;
export type Profile = keyof typeof profiles;
export type Lane = "baseline" | "fresh";
export type Manager = "npm" | "pnpm";

const dependenciesFor = (profile: Profile, lane: Lane) => ({
  effect: lane === "baseline" ? "4.1.0" : "~4.1.0",
  convex: lane === "baseline" ? "1.45.0" : "^1.45.0",
  "@effect/platform-node": lane === "baseline" ? "4.1.0" : "~4.1.0",
  ...(lane === "baseline" ? { "@effect/platform-node-shared": "4.1.0" } : {}),
  ...(lane === "baseline"
    ? profiles[profile].baseline
    : profiles[profile].hosts),
});

export const consumerDependencies: {
  (lane: Lane): (profile: Profile) => ReturnType<typeof dependenciesFor>;
  (profile: Profile, lane: Lane): ReturnType<typeof dependenciesFor>;
} = dual(2, dependenciesFor);

export interface InstalledPackage {
  readonly path: string;
  readonly manifest: Manifest;
  readonly resolutions: Readonly<Record<string, string>>;
}

export interface Candidate {
  readonly manifest: Manifest;
  readonly tarball: string;
  readonly integrity: string;
}

export const provenanceProblems: {
  (
    resolution:
      | {
          readonly resolved?: string | undefined;
          readonly integrity?: string | undefined;
        }
      | undefined,
    resolvedFile: string | undefined,
    manager: Manager,
  ): (candidate: Candidate) => ReadonlyArray<string>;
  (
    candidate: Candidate,
    resolution:
      | {
          readonly resolved?: string | undefined;
          readonly integrity?: string | undefined;
        }
      | undefined,
    resolvedFile: string | undefined,
    manager: Manager,
  ): ReadonlyArray<string>;
} = dual(
  4,
  (
    candidate: Candidate,
    resolution:
      | {
          readonly resolved?: string | undefined;
          readonly integrity?: string | undefined;
        }
      | undefined,
    resolvedFile: string | undefined,
    manager: Manager,
  ): ReadonlyArray<string> => [
    ...(resolution?.resolved !== undefined &&
    Str.startsWith("file:")(resolution.resolved) &&
    resolvedFile === candidate.tarball
      ? []
      : ["Candidate was not installed from the intended tarball"]),
    ...(manager === "npm" && resolution?.integrity !== candidate.integrity
      ? ["Candidate tarball integrity differs from the npm lockfile"]
      : []),
  ],
);

export class ConsumerGateFailure extends Schema.TaggedError<
  ConsumerGateFailure,
  {}
>()("ConsumerGateFailure", { phase: Schema.String, details: Schema.Unknown }) {}

export interface GraphProblem {
  readonly _tag:
    | "MissingDependency"
    | "InvalidPeer"
    | "WrongCandidate"
    | "SplitRuntime"
    | "ExternalPath";
  readonly package: string;
  readonly dependency: string;
  readonly expected: string;
  readonly actual: string | null;
}

export const graphProblems: {
  (
    candidates: ReadonlyArray<Candidate>,
    rootResolutions: Readonly<Record<string, string>>,
    directory: string,
  ): (packages: ReadonlyArray<InstalledPackage>) => ReadonlyArray<GraphProblem>;
  (
    packages: ReadonlyArray<InstalledPackage>,
    candidates: ReadonlyArray<Candidate>,
    rootResolutions: Readonly<Record<string, string>>,
    directory: string,
  ): ReadonlyArray<GraphProblem>;
} = dual(
  4,
  (
    packages: ReadonlyArray<InstalledPackage>,
    candidates: ReadonlyArray<Candidate>,
    rootResolutions: Readonly<Record<string, string>>,
    directory: string,
  ): ReadonlyArray<GraphProblem> => {
    const byPath = new Map(Arr.map(packages, (entry) => [entry.path, entry]));
    const cohort = new Map(
      Arr.map(candidates, (entry) => [entry.manifest.name, entry]),
    );
    const problems: Array<GraphProblem> = [];
    for (const entry of packages) {
      const { manifest } = entry;
      if (!Str.startsWith(`${directory}/`)(entry.path)) {
        problems.push({
          _tag: "ExternalPath",
          package: manifest.name,
          dependency: manifest.name,
          expected: directory,
          actual: entry.path,
        });
      }
      if (Str.startsWith("@confect/")(manifest.name)) {
        const candidate = cohort.get(manifest.name);
        if (
          candidate === undefined ||
          manifest.version !== candidate.manifest.version ||
          entry.path !== rootResolutions[manifest.name]
        ) {
          problems.push({
            _tag: "WrongCandidate",
            package: manifest.name,
            dependency: manifest.name,
            expected: candidate?.manifest.version ?? "candidate cohort only",
            actual: manifest.version,
          });
        }
      }
      if (manifest.name === "effect" && entry.path !== rootResolutions.effect) {
        problems.push({
          _tag: "SplitRuntime",
          package: manifest.name,
          dependency: "effect",
          expected: rootResolutions.effect ?? "root Effect",
          actual: entry.path,
        });
      }
      for (const [name, range] of Record.toEntries(
        manifest.peerDependencies ?? {},
      )) {
        const peer = byPath.get(entry.resolutions[name] ?? "");
        if (
          peer === undefined &&
          manifest.peerDependenciesMeta?.[name]?.optional === true
        )
          continue;
        if (
          peer === undefined ||
          !Bun.semver.satisfies(peer.manifest.version, range)
        ) {
          problems.push({
            _tag: "InvalidPeer",
            package: manifest.name,
            dependency: name,
            expected: range,
            actual: peer?.manifest.version ?? null,
          });
        }
      }
      for (const name of Record.keys(manifest.dependencies ?? {})) {
        if (
          (entry.resolutions[name] === undefined ||
            entry.resolutions[name] === "") &&
          (manifest.optionalDependencies?.[name] === undefined ||
            manifest.optionalDependencies[name] === "")
        ) {
          problems.push({
            _tag: "MissingDependency",
            package: manifest.name,
            dependency: name,
            expected: "installed dependency",
            actual: null,
          });
        }
      }
    }
    for (const candidate of candidates) {
      if (!byPath.has(rootResolutions[candidate.manifest.name] ?? "")) {
        problems.push({
          _tag: "WrongCandidate",
          package: "consumer",
          dependency: candidate.manifest.name,
          expected: candidate.manifest.version,
          actual: null,
        });
      }
    }
    return problems;
  },
);

export const installProblems: {
  (output: string): (status: number | null) => ReadonlyArray<string>;
  (status: number | null, output: string): ReadonlyArray<string>;
} = dual(2, (status: number | null, output: string): ReadonlyArray<string> => [
  ...(status === 0 ? [] : [`Installer exited ${status}`]),
  ...(/\b(?:ERESOLVE|ELSPROBLEMS|ERR_PNPM_[A-Z_]+)\b|(?:unmet|invalid|missing|conflicting) peer|peer dep(?:endency|endencies)? (?:issue|warning)|issues with peer dependencies|overriding peer dependency/i.test(
    output,
  )
    ? ["Installer reported dependency problems"]
    : []),
  ...(/ignored build scripts|unapproved build|blocked.*(?:build|script)/i.test(
    output,
  )
    ? ["Installer did not run required build scripts"]
    : []),
]);

export const packedManifestProblems: {
  (
    packed: Manifest,
    versions: Readonly<Record<string, string>>,
  ): (source: Manifest) => ReadonlyArray<string>;
  (
    source: Manifest,
    packed: Manifest,
    versions: Readonly<Record<string, string>>,
  ): ReadonlyArray<string>;
} = dual(
  3,
  (
    source: Manifest,
    packed: Manifest,
    versions: Readonly<Record<string, string>>,
  ): ReadonlyArray<string> => {
    const problems: Array<string> = [];
    if (source.name !== packed.name || source.version !== packed.version)
      problems.push("Packed identity differs from source");
    for (const field of [
      "dependencies",
      "peerDependencies",
      "optionalDependencies",
    ] as const) {
      for (const [name, range] of Record.toEntries(source[field] ?? {})) {
        const expected = range === "workspace:^" ? `^${versions[name]}` : range;
        if (
          Str.startsWith("workspace:")(expected) ||
          packed[field]?.[name] !== expected
        )
          problems.push(
            `${field}.${name}: expected ${expected}, got ${packed[field]?.[name]}`,
          );
      }
      for (const name of Record.keys(packed[field] ?? {})) {
        if (!(name in (source[field] ?? {})))
          problems.push(`Unexpected ${field}.${name}`);
      }
    }
    return problems;
  },
);
