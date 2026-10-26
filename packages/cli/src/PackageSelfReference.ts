import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as RegExp from "effect/RegExp";
import * as Schema from "effect/Schema";
import * as BuildError from "./BuildError";

export const PackageSelfReference = Schema.String.pipe(
  Schema.brand("PackageSelfReference"),
);
export type PackageSelfReference = typeof PackageSelfReference.Type;

const PackageMetadata = Schema.fromJsonString(
  Schema.Struct({
    name: Schema.optionalKey(PackageSelfReference),
    exports: Schema.optionalKey(Schema.Unknown),
  }),
);

export const discover = Effect.fnUntraced(
  function* (directory: string) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const start = path.resolve(directory);
    const root = path.parse(start).root;
    const directories = Array.append(
      Array.unfold(start, (current) =>
        current === root
          ? Option.none()
          : Option.some([current, path.dirname(current)] as const),
      ),
      root,
    );
    const nearest = yield* Effect.findFirst(directories, (current) =>
      fs.exists(path.join(current, "package.json")),
    );
    if (Option.isNone(nearest)) return Option.none<PackageSelfReference>();
    const metadata = yield* Schema.decodeEffect(PackageMetadata)(
      yield* fs.readFileString(path.join(nearest.value, "package.json")),
    );
    if (
      metadata.name === undefined ||
      metadata.name.length === 0 ||
      metadata.exports === undefined ||
      metadata.exports === null
    ) {
      return Option.none<PackageSelfReference>();
    } else {
      return Option.some(metadata.name);
    }
  },
  Effect.mapError((cause) => new BuildError.BundlerError({ cause })),
);

export const toRegExp = (self: PackageSelfReference): globalThis.RegExp =>
  new globalThis.RegExp(`^${RegExp.escape(self)}(?:/|$)`);
