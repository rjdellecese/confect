import { describe, expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import { createRequire } from "node:module";

const oxlintManifestPath = createRequire(import.meta.url).resolve(
  "oxlint/package.json",
);

describe("require-query-stream-experimental", () => {
  it.effect.each([
    {
      name: "requires tags on values, types, interfaces, classes, and re-exports",
      filename: "QueryStreamFixture.ts",
      code: `
export const value = 1;
export type Value = number;
export interface Shape {}
export class Item {}
export { other } from "./Other";
export function make() { return 1; }
export default value;
`,
      missing: 7,
    },
    {
      name: "accepts canonical tags on each declaration and shared re-export clauses",
      filename: "QueryStreamFixture.ts",
      code: `
/** @experimental */
export const value = 1;
/**
 * Existing description.
 *
 * @experimental
 */
export type Value = number;
/** @experimental */
export interface Shape {}
/** @experimental */
export class Item {}
/** @experimental */
export { first, second } from "./Other";
/** @experimental */
export default value;
`,
      missing: 0,
    },
    {
      name: "rejects prose, punctuation, non-JSDoc comments, and detached tags",
      filename: "QueryStreamFixture.ts",
      code: `
/** Invalid numeric read limits. @experimental. */
export { InvalidReadLimitError } from "./Other";
/** @experimental. */
export const punctuation = 1;
/* @experimental */
export const block = 1;
// @experimental
export const line = 1;
/** @experimental */
const privateValue = 1;
export const detached = privateValue;
`,
      missing: 5,
    },
    {
      name: "does not propagate tags between same-name declarations",
      filename: "QueryStreamFixture.ts",
      code: `
/** @experimental */
export const Shape = {};
export interface Shape {}
`,
      missing: 1,
    },
    {
      name: "requires every overload signature but not its implementation",
      filename: "QueryStreamFixture.ts",
      code: `
/** @experimental */
export function make(): number;
export function make(value: number): number;
export function make(value = 0): number { return value; }
`,
      missing: 1,
    },
    {
      name: "does not require tags on members or unexported helpers",
      filename: "QueryStreamFixture.ts",
      code: `
const helper = 1;
/** @experimental */
export interface Shape { value: number; }
/** @experimental */
export class Item { value = helper; method() { return this.value; } }
`,
      missing: 0,
    },
    {
      name: "checks only query-stream re-exports in the root barrel",
      filename: "index.ts",
      code: `
export * as Other from "./Other";
export const value = 1;
export * as QueryStreamCursor from "./QueryStreamCursor";
export { Shape } from "./QueryStreamFixture";
/** @experimental */
export * as QueryStream from "./QueryStream";
`,
      missing: 2,
    },
    {
      name: "ignores unrelated modules",
      filename: "Other.ts",
      code: "export const value = 1;",
      missing: 0,
    },
  ])("$name", ({ filename, code, missing }) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const root = path.resolve(import.meta.dirname, "../../..");
      const manifest = yield* Schema.decodeEffect(
        Schema.fromJsonString(
          Schema.Struct({ bin: Schema.Struct({ oxlint: Schema.String }) }),
        ),
      )(yield* fs.readFileString(oxlintManifestPath));
      const oxlint = path.resolve(
        path.dirname(oxlintManifestPath),
        manifest.bin.oxlint,
      );
      const directory = yield* fs.makeTempDirectoryScoped({
        prefix: "confect-experimental-",
      });
      const sourceDirectory = path.join(directory, "packages/server/src");
      yield* fs.makeDirectory(sourceDirectory, { recursive: true });
      const file = path.join(sourceDirectory, filename);
      const config = path.join(directory, "config.json");
      yield* fs.writeFileString(file, code);
      yield* fs.writeFileString(
        config,
        yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))({
          jsPlugins: [path.join(root, "tools/oxlint-rules/src/index.ts")],
          categories: { correctness: "off" },
          rules: { "confect/require-query-stream-experimental": "error" },
        }),
      );
      const handle = yield* spawner.spawn(
        ChildProcess.make(
          process.execPath,
          [oxlint, "--config", config, "--format", "json", file],
          { cwd: root, stdin: "ignore" },
        ),
      );
      const result = yield* Effect.all(
        {
          status: handle.exitCode,
          stdout: handle.stdout.pipe(Stream.decodeText(), Stream.mkString),
          stderr: handle.stderr.pipe(Stream.decodeText(), Stream.mkString),
        },
        { concurrency: "unbounded" },
      );
      expect(result.stderr).toBe("");
      const output = yield* Schema.decodeEffect(
        Schema.fromJsonString(
          Schema.Struct({
            diagnostics: Schema.Array(Schema.Struct({ code: Schema.String })),
          }),
        ),
      )(result.stdout);
      expect(output.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
        Array.from(
          { length: missing },
          () => "confect(require-query-stream-experimental)",
        ),
      );
      expect(result.status).toBe(missing === 0 ? 0 : 1);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
