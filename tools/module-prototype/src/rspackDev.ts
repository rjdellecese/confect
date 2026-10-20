import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Command from "effect/cli/Command";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Compilation from "../../../packages/cli/src/Compilation.ts";
import * as CompilationInputs from "../../../packages/cli/src/CompilationInputs.ts";
import * as ConfectDirectory from "../../../packages/cli/src/ConfectDirectory.ts";
import * as ConvexDirectory from "../../../packages/cli/src/ConvexDirectory.ts";
import * as ProjectRoot from "../../../packages/cli/src/ProjectRoot.ts";
import * as DevSupervisor from "../../../packages/cli/src/DevSupervisor.ts";
import { runSession } from "../../../packages/cli/src/confect/dev.ts";
import * as RspackSession from "./RspackSession.ts";

const session = Layer.unwrap(
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const root = yield* ProjectRoot.ProjectRoot.get;
    const confect = yield* ConfectDirectory.ConfectDirectory.get;
    const convex = yield* ConvexDirectory.ConvexDirectory.get;
    return RspackSession.layer({
      mode: "Watch",
      ownedDirectories: [path.join(confect, "_generated"), convex],
      authoredFiles: [
        path.join(convex, "convex.config.ts"),
        path.join(convex, "tsconfig.json"),
        path.join(convex, "package.json"),
      ],
      restartInputs: [path.join(root, "convex.json")],
    }).pipe(
      Layer.tap((services) =>
        Context.get(services, Compilation.Service).resolutionInputs.trackSource(
          path.join(root, "package.json"),
        ),
      ),
    );
  }),
);

const dev = Command.make("dev", {}, () =>
  DevSupervisor.run(
    runSession.pipe(
      Effect.provide(session),
      Effect.catchTags({
        CompilationRestartRequired: () => DevSupervisor.requestRestart,
        BundlerError: (error) =>
          Schema.is(CompilationInputs.RestartRequired)(error.cause)
            ? DevSupervisor.requestRestart
            : Effect.fail(error),
      }),
    ),
  ),
);

Command.run(
  Command.make("confect").pipe(
    Command.withSubcommands([dev]),
    Command.provide(
      Layer.mergeAll(
        ConfectDirectory.layer,
        ConvexDirectory.layer,
        ProjectRoot.layer,
      ),
    ),
  ),
  { version: "0.0.0-rspack-prototype" },
).pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain);
