import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Hex from "effect/encoding/Hex";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import type * as esbuild from "esbuild";
import type * as Authority from "./Authority";
import type * as Protocol from "./Protocol";

export class CaptureRejected extends Schema.TaggedError<CaptureRejected>()(
  "NativeCaptureRejected",
  { reason: Schema.String, paths: Schema.Array(Schema.String) },
) {}

const ImportKind = Schema.Literals([
  "entry-point",
  "import-statement",
  "require-call",
  "dynamic-import",
  "require-resolve",
  "import-rule",
  "composes-from",
  "url-token",
]);
const Attributes = Schema.Record(Schema.String, Schema.String);
const Metafile = Schema.Struct({
  inputs: Schema.Record(
    Schema.String,
    Schema.Struct({
      bytes: Schema.Finite,
      imports: Schema.mutable(
        Schema.Array(
          Schema.Struct({
            path: Schema.String,
            kind: ImportKind,
            external: Schema.optionalKey(Schema.Boolean),
            original: Schema.optionalKey(Schema.String),
            with: Schema.optionalKey(Attributes),
          }),
        ),
      ),
      format: Schema.optionalKey(Schema.Literals(["cjs", "esm"])),
      with: Schema.optionalKey(Attributes),
    }),
  ),
  outputs: Schema.Record(
    Schema.String,
    Schema.Struct({
      bytes: Schema.Finite,
      inputs: Schema.Record(
        Schema.String,
        Schema.Struct({ bytesInOutput: Schema.Finite }),
      ),
      imports: Schema.mutable(
        Schema.Array(
          Schema.Struct({
            path: Schema.String,
            kind: Schema.Union([ImportKind, Schema.Literal("file-loader")]),
            external: Schema.optionalKey(Schema.Boolean),
          }),
        ),
      ),
      exports: Schema.mutable(Schema.Array(Schema.String)),
      entryPoint: Schema.optionalKey(Schema.String),
      cssBundle: Schema.optionalKey(Schema.String),
    }),
  ),
});

const attributes = (value: Readonly<Record<string, string>>) =>
  Schema.encodeEffect(
    Schema.fromJsonString(
      Schema.Array(Schema.Tuple([Schema.String, Schema.String])),
    ),
  )(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));

export const accept = Effect.fn("NativeCapture.accept")(function* (
  capture: Protocol.Capture,
  authority: Effect.Success<ReturnType<typeof Authority.make>>,
) {
  yield* authority.check(capture);
  if (capture.status !== "Succeeded" || capture.errors.length !== 0)
    return yield* new CaptureRejected({ reason: capture.status, paths: [] });
  const crypto = yield* Crypto.Crypto;
  const path = yield* Path.Path;
  const metafile: esbuild.Metafile = yield* Schema.decodeEffect(
    Schema.fromJsonString(Metafile),
    { onExcessProperty: "error" },
  )(capture.metafile).pipe(
    Effect.mapError(
      () => new CaptureRejected({ reason: "MalformedMetafile", paths: [] }),
    ),
  );
  for (const item of [...capture.sources, ...capture.outputs]) {
    const bytes = Buffer.from(item.bytesBase64, "base64");
    if (
      bytes.toString("base64") !== item.bytesBase64 ||
      Hex.encode(yield* crypto.digest("SHA-256", bytes)) !== item.sha256
    )
      return yield* new CaptureRejected({
        reason: "InvalidByteDigest",
        paths: [item.path],
      });
  }
  for (const output of capture.outputs) {
    const relative = path.relative(authority.options.outdir, output.path);
    if (
      !path.isAbsolute(output.path) ||
      relative === ".." ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    )
      return yield* new CaptureRejected({
        reason: "OutputOutsideDirectory",
        paths: [output.path],
      });
  }
  const observations = new Map<string, Protocol.Capture["sources"][number]>();
  for (const source of capture.sources) {
    const key = `${source.namespace === "file" ? "" : `${source.namespace}:`}${source.path}${source.suffix}\0${yield* attributes(source.attributes)}`;
    if (observations.has(key))
      return yield* new CaptureRejected({
        reason: "DuplicateSourceIdentity",
        paths: [source.path],
      });
    observations.set(key, source);
  }
  const observed: Record<string, string> = {};
  for (const [file, metadata] of Object.entries(metafile.inputs)) {
    const base = metadata.with ? file.replace(/ with \{.*\}$/, "") : file;
    const suffix = `\0${yield* attributes(metadata.with ?? {})}`;
    const source =
      observations.get(`${base}${suffix}`) ??
      observations.get(
        `${path.resolve(authority.options.root, base)}${suffix}`,
      );
    if (!source)
      return yield* new CaptureRejected({
        reason: "UnobservedMetafileInput",
        paths: [file],
      });
    observed[file] = yield* Schema.encodeEffect(
      Schema.fromJsonString(Schema.Array(Schema.String)),
    )([
      source.sha256,
      source.originalSha256,
      source.loader,
      source.resolveDir,
      yield* attributes(source.attributes),
    ]);
  }
  if (Object.keys(metafile.outputs).length !== capture.outputs.length)
    return yield* new CaptureRejected({
      reason: "OutputCoverageMismatch",
      paths: Object.keys(metafile.outputs),
    });
  for (const file of Object.keys(metafile.outputs))
    if (
      !capture.outputs.some(
        (output) => output.path === path.resolve(authority.options.root, file),
      )
    )
      return yield* new CaptureRejected({
        reason: "UnobservedOutput",
        paths: [file],
      });
  return {
    metafile: authority.normalize(metafile, authority.options.root),
    observed,
  };
});
