import * as BunServices from "@effect/platform-bun/BunServices";
import { expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";
import {
  assembleDocsMain,
  parseDocsArguments,
  rewriteDocumentationLinks,
} from "./assembleDocs";

const runTest = <A, E>(
  effect: Effect.Effect<A, E, BunServices.BunServices>,
): Promise<A> =>
  Effect.runPromise(effect.pipe(Effect.provide(BunServices.layer)));

const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

test("parses deployment arguments without changing the input", () =>
  runTest(
    Effect.gen(function* () {
      const args = [
        "--output",
        "site",
        "--manifest-output",
        "manifest.json",
        "--manifest",
        "previous.json",
        "--update-version",
        "v10",
        "--update-ref",
        "HEAD",
        "--allow-unpublished-source",
      ];

      const before = [...args];
      expect(yield* parseDocsArguments(args)).toEqual({
        outputArgument: "site",
        manifestOutputArgument: "manifest.json",
        manifestPath: "previous.json",
        updateVersion: "v10",
        updateRef: "HEAD",
        allowUnpublishedSource: true,
      });
      expect(args).toEqual(before);
    }),
  ));

test("rejects missing, unknown, and unpaired arguments with named errors", () =>
  runTest(
    Effect.gen(function* () {
      const required = [
        "--output",
        "site",
        "--manifest-output",
        "manifest.json",
      ];

      for (const args of [
        [],
        ["--output", "site"],
        [...required, "--update-version", "v11", "--update-ref", "HEAD"],
        [...required, "--update-version", "v10"],
        [...required, "--update-ref", "HEAD"],
        [...required, "--unknown"],
        [...required, "positional"],
      ]) {
        const error = yield* parseDocsArguments(args).pipe(Effect.flip);
        expect(error._tag).toBe("DocsArgumentsError");
        expect(error.message.length).toBeGreaterThan(0);
      }
    }),
  ));

test("rewrites documentation links while preserving fenced and versioned links", () => {
  const contents = [
    "[Page](/guide?q=x#anchor) [External](//example.com/page)",
    "<Card href=\"/guide\" /> <Card href={'/guide'} />",
    'import Example from "/snippets/example.mdx";',
    '[Pinned](/v9/guide) <Card href="/v10/guide" />',
    "```mdx",
    '[Code](/guide) <Card href="/guide" />',
    "```",
    "~~~md",
    "[Code](/guide)",
    "~~~",
    "[After](/guide)",
  ].join("\n");

  expect(rewriteDocumentationLinks(contents, "v10")).toBe(
    [
      "[Page](/v10/guide?q=x#anchor) [External](//example.com/page)",
      "<Card href=\"/v10/guide\" /> <Card href={'/v10/guide'} />",
      'import Example from "/v10/snippets/example.mdx";',
      '[Pinned](/v9/guide) <Card href="/v10/guide" />',
      "```mdx",
      '[Code](/guide) <Card href="/guide" />',
      "```",
      "~~~md",
      "[Code](/guide)",
      "~~~",
      "[After](/v10/guide)",
    ].join("\n"),
  );
});

test("rejects all protected output directories before loading sources", () =>
  runTest(
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

      const root = (yield* spawner.string(
        ChildProcess.make("git", ["rev-parse", "--show-toplevel"]),
      )).trim();

      for (const output of [
        path.parse(root).root,
        root,
        path.join(root, "apps/docs"),
      ]) {
        const error = yield* assembleDocsMain([
          "--output",
          output,
          "--manifest-output",
          path.join(root, "unused.json"),
        ]).pipe(Effect.flip);

        expect(error._tag).toBe("DocsOutputError");
        expect(error).toMatchObject({ output });
      }
    }),
  ));

test("rejects malformed manifests and missing refs before replacing output", () =>
  runTest(
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const output = path.join(root, "site");
        const manifest = path.join(root, "input.json");
        const manifestOutput = path.join(root, "output.json");
        yield* fs.makeDirectory(output);
        yield* fs.writeFileString(path.join(output, "sentinel"), "untouched");

        for (const [contents, tag] of [
          ["{", "DocsDataError"],
          [encodeJson({ schemaVersion: 2 }), "DocsDataError"],
          [
            encodeJson({
              schemaVersion: 1,
              defaultVersion: "v9",
              versions: { v9: { source: "HEAD" } },
            }),
            "DocsDataError",
          ],
          [
            encodeJson({
              schemaVersion: 1,
              defaultVersion: "v9",
              versions: {
                v9: { source: "refs/confect-test-does-not-exist" },
                v10: { source: "HEAD" },
              },
            }),
            "DocsSourceError",
          ],
        ] as const) {
          yield* fs.writeFileString(manifest, contents);

          const error = yield* assembleDocsMain([
            "--output",
            output,
            "--manifest-output",
            manifestOutput,
            "--manifest",
            manifest,
          ]).pipe(Effect.flip);

          expect(error._tag).toBe(tag);
          expect(yield* fs.readFileString(path.join(output, "sentinel"))).toBe(
            "untouched",
          );
          expect(yield* fs.exists(manifestOutput)).toBe(false);
        }
      }),
    ),
  ));
