import { IdScope } from "@confect/core";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as String from "effect/String";
import * as Flag from "effect/cli/Flag";
import * as ConfectDirectory from "./ConfectDirectory";
import * as ConvexDirectory from "./ConvexDirectory";
import * as ProjectRoot from "./ProjectRoot";

/**
 * @internal
 */
export const flags = {
  componentDir: Flag.String("component-dir").pipe(
    Flag.withDescription(
      "Generate a component instead of the application; its sibling confect/ directory contains the source.",
    ),
    Flag.optional,
  ),
};

export const layer = ({
  componentDir,
}: {
  componentDir: Option.Option<string>;
}) => {
  const projectRootLayer = Option.match(componentDir, {
    onNone: () => ProjectRoot.layer,
    onSome: (directory) =>
      Layer.effect(
        ProjectRoot.ProjectRoot,
        Effect.map(ProjectRoot.findProjectRootFrom(directory), (root) =>
          ProjectRoot.ProjectRoot.of({
            get: Effect.succeed(root),
          }),
        ),
      ),
  });
  const convex: Layer.Layer<
    ConvexDirectory.ConvexDirectory,
    Layer.Error<typeof ConvexDirectory.layer> | Schema.SchemaError,
    FileSystem.FileSystem | Path.Path
  > = Option.match(componentDir, {
    onNone: () => ConvexDirectory.layer,
    onSome: (directory) =>
      Layer.effect(
        ConvexDirectory.ConvexDirectory,
        Effect.gen(function* () {
          const path = yield* Path.Path;
          const fs = yield* FileSystem.FileSystem;
          const projectRoot = yield* ProjectRoot.ProjectRoot.get;
          const absolute = path.resolve(directory);
          if (!(yield* fs.exists(path.join(absolute, "convex.config.ts")))) {
            return yield* ConvexDirectory.ConvexDirectoryNotFoundError.make();
          }
          const pkg = yield* fs
            .readFileString(path.join(projectRoot, "package.json"))
            .pipe(
              Effect.flatMap(
                Schema.decodeEffect(
                  Schema.fromJsonString(Schema.Struct({ name: Schema.String })),
                ),
              ),
            );
          const definition = `${pkg.name}:${Array.join(String.split(path.relative(projectRoot, absolute), path.sep), "/")}`;
          return ConvexDirectory.ConvexDirectory.of({
            get: Effect.succeed(absolute),
            target: {
              kind: "component",
              scope: IdScope.component(definition),
            },
          });
        }),
      ).pipe(Layer.provide(projectRootLayer)),
  });
  return Layer.mergeAll(
    projectRootLayer,
    ConfectDirectory.layerFromConvexDirectory.pipe(Layer.provideMerge(convex)),
  );
};
