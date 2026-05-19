/**
 * Convex directory discovery: reads `convex.json#functions` to locate the
 * Convex functions directory, falling back to `<projectRoot>/convex`.
 */
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import * as Fs from "./internal/fs";
import * as Path from "./internal/path";
import { findProjectRoot } from "./ProjectRoot";

export class ConvexDirectoryNotFoundError extends Schema.TaggedErrorClass<ConvexDirectoryNotFoundError>()(
  "ConvexDirectoryNotFoundError",
  {},
) {
  get message(): string {
    return "Could not find Convex directory";
  }
}

const ConvexJsonConfig = Schema.fromJsonString(
  Schema.Struct({
    functions: Schema.optional(Schema.String),
  }),
);

export const findConvexDirectory = Effect.gen(function* () {
  const projectRoot = yield* findProjectRoot;
  const defaultPath = Path.join(projectRoot, "convex");
  const convexJsonPath = Path.join(projectRoot, "convex.json");

  const convexDirectory = (yield* Fs.exists(convexJsonPath))
    ? yield* Fs.readFileString(convexJsonPath).pipe(
        Effect.flatMap((s) => Schema.decodeUnknownEffect(ConvexJsonConfig)(s)),
        Effect.map((config) =>
          Option.fromNullishOr(config.functions).pipe(
            Option.map((functionsDir) => Path.join(projectRoot, functionsDir)),
            Option.getOrElse(() => defaultPath),
          ),
        ),
        Effect.matchEffect({
          onFailure: () => Effect.succeed(defaultPath),
          onSuccess: Effect.succeed,
        }),
      )
    : defaultPath;

  if (yield* Fs.exists(convexDirectory)) {
    return convexDirectory;
  }

  return yield* new ConvexDirectoryNotFoundError();
});
