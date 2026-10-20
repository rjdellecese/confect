import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import * as RspackOwnership from "../src/RspackOwnership.ts";

const policy = Effect.gen(function* () {
  return RspackOwnership.make(yield* Path.Path, {
    ownedDirectories: ["/project/confect/_generated", "/project/convex"],
    authoredFiles: [
      "/project/convex/convex.config.ts",
      "/project/convex/tsconfig.json",
      "/project/convex/package.json",
    ],
  });
});

layer(Path.layer)("RspackOwnership", (it) => {
  it.effect.each([
    ["/project/confect/_generated/spec.ts", true],
    ["/project/confect/_generated/deep/spec.ts", true],
    ["/project/confect/_generated", true],
    ["/project/convex/functions.ts", true],
    ["/project/convex/convex.config.ts", false],
    ["/project/convex/tsconfig.json", false],
    ["/project/convex/package.json", false],
    ["/project/convex/nested/convex.config.ts", true],
    ["/project/convex-copy/functions.ts", false],
    ["/project/confect/_generated-copy/spec.ts", false],
    ["/project/confect/functions.ts", false],
  ] as const)(
    "classifies only configured ownership for %s",
    ([file, expected]) =>
      Effect.gen(function* () {
        expect((yield* policy).owns(file)).toBe(expected);
      }),
  );

  it.effect(
    "does not reserve an authored exception's basename outside its explicit path",
    () =>
      Effect.gen(function* () {
        const { owns } = yield* policy;
        expect(owns("/project/convex/deep/convex.config.ts")).toBe(true);
        expect(owns("/project/convex/convex.config.ts")).toBe(false);
      }),
  );
});
