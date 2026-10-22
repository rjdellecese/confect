import * as Data from "effect/Data";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Order from "effect/Order";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Record from "effect/Record";
import * as Random from "effect/Random";
import * as Schema from "effect/Schema";
import * as String from "effect/String";
import { ConfectDirectory } from "./ConfectDirectory";
import * as GenerationSnapshot from "./GenerationSnapshot";
import { ProjectRoot } from "./ProjectRoot";

export const filename = ".confect-generation.json";

export const GenerationRecord = Schema.Struct({
  version: Schema.Literal(1),
  snapshot: GenerationSnapshot.GenerationSnapshot,
});
export interface GenerationRecord extends Schema.Schema.Type<
  typeof GenerationRecord
> {}

export const make = (
  snapshot: GenerationSnapshot.GenerationSnapshot,
): GenerationRecord => ({ version: 1, snapshot });

export class EncodingError extends Schema.TaggedError<EncodingError>()(
  "GenerationRecordEncodingError",
  {},
) {}

export class PathError extends Schema.TaggedError<PathError>()(
  "GenerationRecordPathError",
  {
    path: Schema.String,
    reason: Schema.Literals(["SymbolicLink", "EscapedPath", "UnexpectedType"]),
  },
) {}

export type History = Data.TaggedEnum<{
  Missing: {};
  Malformed: {};
  Unsupported: { readonly version: number };
  Loaded: { readonly record: GenerationRecord };
}>;
export const History = Data.taggedEnum<History>();

const Envelope = Schema.Struct({ version: Schema.Int });
const Json = Schema.fromJsonString(Schema.Unknown);

export const parse = (
  serialized: string,
): Exclude<History, { readonly _tag: "Missing" }> => {
  const json = Schema.decodeResult(Json)(serialized);
  if (Result.isFailure(json)) return History.Malformed();
  const envelope = Schema.decodeUnknownResult(Envelope)(json.success);
  if (Result.isFailure(envelope)) return History.Malformed();
  if (envelope.success.version !== 1)
    return History.Unsupported({ version: envelope.success.version });
  const record = Schema.decodeUnknownResult(GenerationRecord)(json.success);
  return Result.isFailure(record)
    ? History.Malformed()
    : History.Loaded({ record: record.success });
};

const canonicalTree = (
  tree: GenerationSnapshot.GroupTree,
): GenerationSnapshot.GroupTree => ({
  runtime: tree.runtime,
  functions: Array.sort(
    tree.functions,
    Order.mapInput(
      String.Order,
      (fn: GenerationSnapshot.FunctionSummary) => fn.name,
    ),
  ),
  groups: Record.fromEntries(
    Array.map(
      Array.sort(
        Record.toEntries(tree.groups),
        Order.mapInput(
          String.Order,
          ([name]: readonly [string, GenerationSnapshot.GroupTree]) => name,
        ),
      ),
      ([name, child]) => [name, canonicalTree(child)] as const,
    ),
  ),
});

export const encode = (
  record: GenerationRecord,
): Result.Result<string, EncodingError> =>
  Schema.encodeResult(GenerationRecord)(record).pipe(
    Result.map(
      (encoded) =>
        `${JSON.stringify(
          {
            version: encoded.version,
            snapshot: Array.map(
              Array.sort(
                encoded.snapshot,
                Order.mapInput(
                  String.Order,
                  ([path]: readonly [string, GenerationSnapshot.GroupTree]) =>
                    path,
                ),
              ),
              ([path, tree]) => [path, canonicalTree(tree)],
            ),
          },
          null,
          2,
        )}\n`,
    ),
    Result.mapError(() => new EncodingError()),
  );

const nonLink = Schema.decodeUnknownOption(
  Schema.Struct({ code: Schema.Literal("EINVAL") }),
);

const location = Effect.gen(function* () {
  const path = yield* Path.Path;
  let root = path.resolve(yield* ProjectRoot.get);
  const confect = path.resolve(yield* ConfectDirectory.get);
  while (true) {
    const relative = path.relative(root, confect);
    if (
      relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative)
    )
      return { root, file: path.join(confect, "_generated", filename) };
    const parent = path.dirname(root);
    if (parent === root)
      return yield* new PathError({ path: confect, reason: "EscapedPath" });
    root = parent;
  }
});

const inspect = Effect.fn("GenerationRecord.inspect")(function* (
  root: string,
  file: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const components = path.relative(root, file).split(path.sep);
  const paths = [
    root,
    ...components.map((_, index) =>
      path.join(root, ...components.slice(0, index + 1)),
    ),
  ];
  let realRoot = root;
  for (const current of paths) {
    const link = yield* fs.readLink(current).pipe(
      Effect.map(() => "Link" as const),
      Effect.catchIf(
        (error) =>
          error.reason._tag === "Unknown" &&
          Option.isSome(nonLink(error.reason.cause)),
        () => Effect.succeed("NonLink" as const),
      ),
      Effect.catchIf(
        (error) => error.reason._tag === "NotFound",
        () => Effect.succeed("Missing" as const),
      ),
    );
    if (link === "Missing") return false;
    if (link === "Link")
      return yield* new PathError({ path: current, reason: "SymbolicLink" });
    const real = yield* fs.realPath(current);
    if (current === root) realRoot = real;
    if (
      path.relative(
        path.resolve(realRoot, path.relative(root, current)),
        real,
      ) !== ""
    )
      return yield* new PathError({ path: current, reason: "EscapedPath" });
    const info = yield* fs.stat(current);
    if (info.type !== (current === file ? "File" : "Directory"))
      return yield* new PathError({ path: current, reason: "UnexpectedType" });
  }
  return true;
});

export const read = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const { root, file } = yield* location;
  if (!(yield* inspect(root, file))) return History.Missing();
  return parse(yield* fs.readFileString(file));
}).pipe(Effect.withSpan("GenerationRecord.read"));

export const write = Effect.fn("GenerationRecord.write")(function* <
  E = never,
  R = never,
>(
  snapshot: GenerationSnapshot.GenerationSnapshot,
  beforeReplace: Effect.Effect<boolean, E, R> = Effect.succeed(true),
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const { root, file } = yield* location;
  const content = yield* Effect.fromResult(encode(make(snapshot)));
  const exists = yield* inspect(root, file);
  if (exists && (yield* fs.readFileString(file)) === content) return;
  yield* fs.makeDirectory(path.dirname(file), { recursive: true });
  yield* inspect(root, file);
  yield* Effect.scoped(
    Effect.gen(function* () {
      const temporary = path.join(
        path.dirname(file),
        `.confect-generation-${yield* Random.nextInt}.tmp`,
      );
      yield* Effect.acquireRelease(
        fs.open(temporary, { flag: "wx" }).pipe(Effect.asVoid, Effect.scoped),
        () => fs.remove(temporary, { force: true }).pipe(Effect.orDie),
      );
      yield* inspect(root, temporary);
      yield* fs.writeFileString(temporary, content);
      if (!(yield* beforeReplace)) return;
      yield* fs.rename(temporary, file);
    }),
  );
});
