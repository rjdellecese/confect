import * as Effect from "effect/Effect";
import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Compilation from "./Compilation";
import { ConfectDirectory } from "./ConfectDirectory";
import { ConvexDirectory } from "./ConvexDirectory";
import { ProjectRoot } from "./ProjectRoot";

export const layer = (mode: Compilation.Mode) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const confect = yield* ConfectDirectory.get;
      const convex = yield* ConvexDirectory.get;
      const root = yield* ProjectRoot.get;
      return Compilation.layer({
        mode,
        restartInputs: [path.join(root, "convex.json")],
        ownedDirectories: [path.join(confect, "_generated"), convex],
        authoredFiles: [
          path.join(convex, "convex.config.ts"),
          path.join(convex, "tsconfig.json"),
          path.join(convex, "package.json"),
        ],
      }).pipe(
        Layer.tap((context) =>
          Context.get(
            context,
            Compilation.Service,
          ).resolutionInputs.trackSource(path.join(root, "package.json")),
        ),
      );
    }),
  );
