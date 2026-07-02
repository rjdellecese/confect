import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as Array from "effect/Array";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";

export class ProjectRoot extends Context.Service<
  ProjectRoot,
  { readonly get: Effect.Effect<string> }
>()("@confect/cli/ProjectRoot") {
  static readonly get = ProjectRoot.use((service) => service.get);
}

export const findProjectRoot = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const startDir = path.resolve(".");
  const root = path.parse(startDir).root;

  const directories = Array.unfold(startDir, (dir) =>
    dir === root
      ? Option.none()
      : Option.some([dir, path.dirname(dir)] as const),
  );

  const projectRoot = yield* Effect.findFirst(directories, (dir) =>
    fs.exists(path.join(dir, "package.json")),
  );

  return yield* Option.match(projectRoot, {
    onNone: () => Effect.fail(new ProjectRootNotFoundError()),
    onSome: Effect.succeed,
  });
});

export const layer = Layer.effect(
  ProjectRoot,
  Effect.gen(function* () {
    const projectRoot = yield* findProjectRoot;

    const ref = yield* Ref.make<string>(projectRoot);

    return { get: Ref.get(ref) } as const;
  }),
).pipe(Layer.provide(NodeFileSystem.layer));

export class ProjectRootNotFoundError extends Schema.TaggedErrorClass<ProjectRootNotFoundError>()(
  "ProjectRootNotFoundError",
  {},
) {
  override get message(): string {
    return "Could not find project root (no 'package.json' found)";
  }
}
