import type { Compiler, RuleSetRule } from "@rspack/core";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import type * as Path from "effect/Path";
import * as Schema from "effect/Schema";

export interface Options {
  readonly ownedDirectories: ReadonlyArray<string>;
  readonly authoredFiles: ReadonlyArray<string>;
}

export class Failed extends Schema.TaggedError<Failed>()(
  "RspackOwnershipFailed",
  { path: Schema.String, reason: Schema.String, cause: Schema.Unknown },
) {}

const contains = (path: Path.Path, directory: string, file: string) => {
  const relative = path.relative(directory, file);
  return (
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
};

export const make = (path: Path.Path, options: Options) => {
  let canonical: Options = options;
  const owns = (file: string): boolean =>
    !canonical.authoredFiles.includes(file) &&
    canonical.ownedDirectories.some((directory) =>
      contains(path, directory, file),
    );
  const plugin = (compiler: Compiler) => {
    compiler.hooks.beforeCompile.tapPromise("confect:ownership", () =>
      Effect.runPromiseWith(Context.empty())(
        Effect.gen(function* () {
          const realpath = compiler.inputFileSystem?.realpath;
          if (!realpath)
            return yield* new Failed({
              path: compiler.context,
              reason: "MissingInputRealpath",
              cause: undefined,
            });
          const resolve = (file: string): Effect.Effect<string, Failed> =>
            Effect.callback((resume) => {
              realpath(file, (cause, real) => {
                if (!cause && real !== undefined) {
                  resume(Effect.succeed(real));
                  return;
                }
                const parent = path.dirname(file);
                resume(
                  cause?.code === "ENOENT" && parent !== file
                    ? resolve(parent).pipe(
                        Effect.map((directory) =>
                          path.join(directory, path.basename(file)),
                        ),
                      )
                    : Effect.fail(
                        new Failed({
                          path: file,
                          reason: "CanonicalPath",
                          cause,
                        }),
                      ),
                );
              });
            });
          const ownedDirectories = yield* Effect.forEach(
            options.ownedDirectories,
            resolve,
          );
          const authoredFiles = yield* Effect.forEach(
            options.authoredFiles,
            resolve,
          );
          canonical = { ownedDirectories, authoredFiles };
        }),
      ),
    );
  };
  const rules: RuleSetRule[] = [
    {
      resource: (file) => owns(file),
      exclude: /\.([mc]?[tj]s|[tj]sx)$/,
      oneOf: [{ test: /\.json$/, type: "json" }, { type: "asset/source" }],
    },
  ];
  return { plugin, rules, owns };
};
