import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as ConvexDirectory from "./ConvexDirectory";

export class ConfectDirectory extends Context.Service<
  ConfectDirectory,
  { readonly get: Effect.Effect<string> }
>()("@confect/cli/ConfectDirectory") {
  static readonly get = ConfectDirectory.use((service) => service.get);
}

export class ConfectDirectoryNotFoundError extends Schema.TaggedErrorClass<ConfectDirectoryNotFoundError>()(
  "ConfectDirectoryNotFoundError",
  {},
) {
  override get message(): string {
    return "Could not find Confect directory";
  }
}

export const findConfectDirectory = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const convexDirectory = yield* ConvexDirectory.ConvexDirectory.get;

  const confectDirectory = path.join(path.dirname(convexDirectory), "confect");

  if (yield* fs.exists(confectDirectory)) {
    return confectDirectory;
  } else {
    return yield* new ConfectDirectoryNotFoundError();
  }
});

export const layer = Layer.effect(
  ConfectDirectory,
  Effect.gen(function* () {
    const confectDirectory = yield* findConfectDirectory;

    const ref = yield* Ref.make<string>(confectDirectory);

    return { get: Ref.get(ref) } as const;
  }),
).pipe(Layer.provide(ConvexDirectory.layer));
