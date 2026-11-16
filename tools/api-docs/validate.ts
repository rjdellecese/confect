import * as BunRuntime from "@effect/platform-bun/BunRuntime";
import * as BunServices from "@effect/platform-bun/BunServices";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as Array from "effect/Array";
import * as Record from "effect/Record";
import * as Str from "effect/String";

const Evidence = Schema.Struct({
  path: Schema.NonEmptyString,
  contains: Schema.NonEmptyString,
});

const Entry = Schema.Struct({
  symbols: Schema.NonEmptyArray(Schema.NonEmptyString),
  reference: Schema.Literals(["included", "supporting", "omitted"]),
  audience: Schema.Literals([
    "application",
    "generated-code",
    "compatibility",
    "implementation",
    "undecided",
  ]),
  evidence: Schema.NonEmptyArray(Evidence),
  note: Schema.optionalKey(Schema.NonEmptyString),
  qualifier: Schema.optionalKey(Schema.Literal("experimental")),
  source: Schema.optionalKey(Schema.NonEmptyString),
});

export const Manifest = Schema.Struct({
  modules: Schema.Record(
    Schema.String,
    Schema.Struct({
      source: Schema.NonEmptyString,
      kind: Schema.optionalKey(Schema.Literals(["generated", "command"])),
      entries: Schema.NonEmptyArray(Entry),
    }),
  ),
});

export type Manifest = typeof Manifest.Type;

export class ScopeValidationError extends Schema.TaggedError<
  ScopeValidationError,
  {}
>()("ScopeValidationError", {
  location: Schema.String,
  reason: Schema.String,
}) {
  override get message(): string {
    return `${this.location}: ${this.reason}`;
  }
}

export const isEvidencePath = (path: string): boolean =>
  !Array.some(Str.split(path, "/"), Str.startsWith(".")) &&
  /^(?:packages\/(?:core|server|js|foldkit|react|test|cli)\/src\/.*\.tsx?|apps\/(?:docs|example)\/.*\.(?:mdx|ts|tsx)|AGENTS\.md|REVIEW\.md)$/.test(
    path,
  );

export const sourcePaths = (manifest: Manifest): ReadonlyArray<string> => {
  const paths = new Set<string>();
  for (const module of Record.values(manifest.modules)) {
    paths.add(module.source);
    for (const entry of module.entries) {
      if (entry.source !== undefined) paths.add(entry.source);
      for (const evidence of entry.evidence) paths.add(evidence.path);
    }
  }
  return [...paths];
};

export const validateManifest = (
  manifest: Manifest,
  sources: Readonly<Record<string, string>>,
): Result.Result<void, ReadonlyArray<ScopeValidationError>> => {
  const errors: Array<ScopeValidationError> = [];
  const problem = (location: string, reason: string) => {
    errors.push(ScopeValidationError.make({ location, reason }));
  };
  for (const path of sourcePaths(manifest)) {
    if (!isEvidencePath(path))
      problem(path, "Unsafe or unsupported evidence path");
    if (sources[path] === undefined)
      problem(path, "Missing source/evidence file");
  }
  for (const [key, module] of Record.toEntries(manifest.modules)) {
    if (module.kind === undefined) {
      const match =
        /^@confect\/(core|server|js|foldkit|react|test)(?:\/([A-Za-z]+))?$/.exec(
          key,
        );
      if (
        match === null ||
        module.source !== `packages/${match[1]}/src/${match[2] ?? "index"}.ts`
      ) {
        problem(key, "Package module key must match its public source owner");
      }
    } else if (
      module.kind === "generated"
        ? !Str.startsWith("confect/_generated/")(key)
        : key !== "confect"
    ) {
      problem(key, "Invalid generated contract or executable identity");
    }
    const seen = new Set<string>();
    for (const entry of module.entries) {
      const source = sources[entry.source ?? module.source] ?? "";
      for (const symbol of entry.symbols) {
        const location = `${key}#${symbol}`;
        if (seen.has(symbol))
          problem(location, "Duplicate symbol classification");
        seen.add(symbol);
        if (!/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(symbol)) {
          problem(location, "Expected a symbol or dotted contract locator");
          continue;
        }
        for (const part of Str.split(symbol, ".")) {
          if (
            !new RegExp(`\\b${Str.replaceAll("$", "\\$")(part)}\\b`).test(
              source,
            )
          ) {
            problem(location, `Missing source identifier: ${part}`);
          }
        }
        if (
          entry.source !== undefined &&
          !new RegExp(`\\b${Str.split(symbol, ".")[0]}\\b`).test(
            sources[module.source] ?? "",
          )
        ) {
          problem(
            location,
            "Alias or inherited owner missing from public module",
          );
        }
      }
      for (const evidence of entry.evidence) {
        if (!Str.includes(evidence.contains)(sources[evidence.path] ?? "")) {
          problem(
            key,
            `Evidence quote no longer resolves: ${evidence.path} :: ${evidence.contains}`,
          );
        }
      }
      if (
        entry.reference === "included" &&
        !Array.some(entry.evidence, (evidence) =>
          Str.startsWith("apps/docs/")(evidence.path),
        )
      ) {
        problem(
          key,
          "Included contracts require codebase documentation evidence",
        );
      }
    }
  }
  return errors.length === 0 ? Result.succeed(undefined) : Result.fail(errors);
};

export const checkScope = Effect.fn("ApiDocs.checkScope")(function* () {
  const fs = yield* FileSystem.FileSystem;
  const modules: Record<string, Manifest["modules"][string]> = {};
  for (const file of ["core", "server", "database", "clients", "generated"]) {
    const text = yield* fs.readFileString(`tools/api-docs/${file}.json`);
    const manifest = yield* Schema.decodeEffect(
      Schema.fromJsonString(Manifest),
    )(text, { onExcessProperty: "error" });
    for (const [key, module] of Record.toEntries(manifest.modules)) {
      if (modules[key] !== undefined) {
        return yield* ScopeValidationError.make({
          location: key,
          reason: "Module repeated across manifest files",
        });
      }
      modules[key] = module;
    }
  }
  const manifest: Manifest = { modules };
  const sources: Record<string, string> = {};
  for (const path of sourcePaths(manifest)) {
    if (!isEvidencePath(path)) {
      return yield* ScopeValidationError.make({
        location: path,
        reason: "Unsafe or unsupported evidence path",
      });
    }
    sources[path] = yield* fs.readFileString(path);
  }
  const result = validateManifest(manifest, sources);
  if (Result.isFailure(result)) {
    for (const error of result.failure) {
      yield* Console.error(`${error.location}: ${error.reason}`);
    }
    return yield* ScopeValidationError.make({
      location: "manifest",
      reason: `${result.failure.length} validation errors`,
    });
  }
  yield* Console.log(
    `Validated ${Record.keys(modules).length} documentation scope modules/contracts.`,
  );
});

if (import.meta.main) {
  checkScope().pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
}
