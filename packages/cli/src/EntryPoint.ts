import * as Array from "effect/Array";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { ImplModulePath } from "./ImplModulePath";
import { ConfectDirectory } from "./ConfectDirectory";
import { ConvexDirectory } from "./ConvexDirectory";
import { CONVEX_CONFIG_FILENAME } from "./ConvexConfig";
import { discoverLeafImplFiles, discoverLeafSpecFiles } from "./LeafModule";
import { discoverTableFiles } from "./TableModule";

export type Kind = Data.TaggedEnum<{
  Spec: { readonly relativePath: string };
  Impl: { readonly relativePath: ImplModulePath };
  Table: { readonly relativePath: string };
  Http: { readonly relativePath: "http.ts" };
  Crons: { readonly relativePath: "crons.ts" };
  Auth: { readonly relativePath: "auth.ts" };
  Config: {};
}>;

export const Kind = Data.taggedEnum<Kind>();
export type EntryPoint = Kind & {
  readonly absolutePath: string;
  readonly inputPath: string;
};
export type OptionalFile = "Http" | "Crons" | "Auth";

export const parse = (
  relativePath: string,
): Option.Option<Exclude<Kind, { readonly _tag: "Config" }>> => {
  if (relativePath === "http.ts")
    return Option.some(Kind.Http({ relativePath }));
  if (relativePath === "crons.ts")
    return Option.some(Kind.Crons({ relativePath }));
  if (relativePath === "auth.ts")
    return Option.some(Kind.Auth({ relativePath }));
  if (
    relativePath.split(/[/\\]/)[0] === "tables" &&
    relativePath.endsWith(".ts")
  )
    return Option.some(Kind.Table({ relativePath }));
  if (relativePath.endsWith(".spec.ts"))
    return Option.some(Kind.Spec({ relativePath }));
  return Schema.decodeOption(ImplModulePath)(relativePath).pipe(
    Option.map((implPath) => Kind.Impl({ relativePath: implPath })),
  );
};

export const discover = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;

  const tryEntry = Effect.fnUntraced(function* (
    kind: Exclude<Kind, { readonly _tag: "Config" }>,
  ) {
    const absolutePath = path.join(confectDirectory, kind.relativePath);
    if (!(yield* fs.exists(absolutePath))) {
      return Option.none<EntryPoint>();
    }
    return Option.some<EntryPoint>({
      ...kind,
      absolutePath,
      inputPath: yield* fs
        .realPath(absolutePath)
        .pipe(Effect.orElseSucceed(() => absolutePath)),
    });
  });

  const fixedEntryOptions = yield* Effect.all([
    tryEntry(Kind.Http({ relativePath: "http.ts" })),
    tryEntry(Kind.Crons({ relativePath: "crons.ts" })),
    tryEntry(Kind.Auth({ relativePath: "auth.ts" })),
  ]);

  const moduleRelativePaths = yield* Effect.all([
    discoverLeafSpecFiles,
    discoverLeafImplFiles,
    discoverTableFiles,
  ]).pipe(Effect.map(Array.flatten));
  const moduleEntryOptions = yield* Effect.forEach(
    Array.getSomes(moduleRelativePaths.map(parse)),
    tryEntry,
  );

  // `convex/convex.config.ts` feeds the generated components registry, so
  // edits to it (or to a locally-defined component definition it imports—npm component definitions are externalized and not watched) must re-run
  // codegen.
  const convexDirectory = yield* ConvexDirectory.get;
  const convexConfigEntryOption = yield* Effect.gen(function* () {
    const absolutePath = path.join(convexDirectory, CONVEX_CONFIG_FILENAME);
    if (!(yield* fs.exists(absolutePath))) {
      return Option.none<EntryPoint>();
    }
    return Option.some<EntryPoint>({
      ...Kind.Config(),
      absolutePath,
      inputPath: yield* fs
        .realPath(absolutePath)
        .pipe(Effect.orElseSucceed(() => absolutePath)),
    });
  });

  return Array.getSomes([
    ...fixedEntryOptions,
    convexConfigEntryOption,
    ...moduleEntryOptions,
  ]);
});
