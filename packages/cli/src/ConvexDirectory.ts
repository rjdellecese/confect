import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as ProjectRoot from "./ProjectRoot";

export class ConvexDirectory extends Context.Service<
  ConvexDirectory,
  { readonly get: Effect.Effect<string> }
>()("@confect/cli/ConvexDirectory") {
  static readonly get = ConvexDirectory.use((service) => service.get);
}

export class ConvexDirectoryNotFoundError extends Schema.TaggedErrorClass<ConvexDirectoryNotFoundError>()(
  "ConvexDirectoryNotFoundError",
  {},
) {
  override get message(): string {
    return "Could not find Convex directory";
  }
}

/**
 * Schema for `convex.json` configuration file.
 * @see https://docs.convex.dev/production/project-configuration
 */
const ConvexJsonConfig = Schema.fromJsonString(
  Schema.Struct({
    functions: Schema.optional(Schema.String),
  }),
);

export class InvalidConvexJsonError extends Schema.TaggedErrorClass<InvalidConvexJsonError>()(
  "InvalidConvexJsonError",
  {
    cause: Schema.Unknown,
  },
) {
  override get message(): string {
    const detail = this.cause instanceof Error ? `: ${this.cause.message}` : "";
    return `Failed to parse convex.json${detail}`;
  }
}

const findConvexDirectory = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const projectRoot = yield* ProjectRoot.ProjectRoot.get;

  const defaultPath = path.join(projectRoot, "convex");

  const convexJsonPath = path.join(projectRoot, "convex.json");

  const convexDirectory = (yield* fs.exists(convexJsonPath))
    ? yield* fs.readFileString(convexJsonPath).pipe(
        Effect.flatMap((json) =>
          Schema.decodeEffect(ConvexJsonConfig)(json).pipe(
            Effect.mapError((cause) => new InvalidConvexJsonError({ cause })),
          ),
        ),
        Effect.map((config) =>
          Option.fromNullishOr(config.functions).pipe(
            Option.map((functionsDir) => path.join(projectRoot, functionsDir)),
            Option.getOrElse(() => defaultPath),
          ),
        ),
      )
    : defaultPath;

  if (yield* fs.exists(convexDirectory)) {
    return convexDirectory;
  } else {
    return yield* new ConvexDirectoryNotFoundError();
  }
});

export const layer = Layer.effect(
  ConvexDirectory,
  Effect.gen(function* () {
    const convexDirectory = yield* findConvexDirectory;

    const ref = yield* Ref.make<string>(convexDirectory);

    return { get: Ref.get(ref) } as const;
  }),
).pipe(Layer.provide(ProjectRoot.layer));
