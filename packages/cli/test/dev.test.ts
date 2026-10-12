import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, expect, layer } from "@effect/vitest";
import { vi } from "vitest";
import * as Command from "effect/cli/Command";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import * as esbuild from "esbuild";
import { dev } from "@confect/cli/confect/dev";
import { ConfectDirectory } from "@confect/cli/ConfectDirectory";
import { ConvexDirectory } from "@confect/cli/ConvexDirectory";
import { ProjectRoot } from "@confect/cli/ProjectRoot";
import * as Project from "./integration/Project";

vi.mock("esbuild", (importOriginal) =>
  importOriginal<typeof esbuild>().then((original) => ({
    ...original,
    context: vi.fn(original.context),
  })),
);

layer(NodeServices.layer, { excludeTestServices: true })(
  "dev dependency watcher resources",
  (it) => {
    it.effect.each([1, 8])(
      "uses a bounded number of build contexts for %i groups",
      (groups) =>
        Effect.gen(function* () {
          const path = yield* Path.Path;
          const project = yield* Project.make;
          const names = [
            "notes",
            ...Array.from({ length: groups - 1 }, (_, i) => `other${i}`),
          ];
          yield* Effect.forEach(names.slice(1), (name) =>
            Effect.all([
              project.write(`confect/${name}.spec.ts`, Project.spec),
              project.write(
                `confect/${name}.impl.ts`,
                Project.impl.replace('"./notes.spec"', `"./${name}.spec"`),
              ),
            ]),
          );
          const unseen = new Set([
            ...names.flatMap((name) => [`${name}.spec.ts`, `${name}.impl.ts`]),
            "tables/notes.ts",
          ]);
          const ready = yield* Deferred.make<void>();
          const original = vi.mocked(esbuild.context).getMockImplementation();
          assert(original);
          const context = vi.mocked(esbuild.context);
          context.mockClear();
          context.mockImplementation((options) =>
            original({
              ...options,
              plugins: [
                ...(options.plugins ?? []),
                {
                  name: "observe-watcher-graphs",
                  setup(build) {
                    build.onEnd((result) => {
                      for (const input of Object.keys(
                        result.metafile?.inputs ?? {},
                      )) {
                        unseen.delete(
                          path.relative(
                            path.join(project.root, "confect"),
                            path.resolve(
                              build.initialOptions.absWorkingDir ?? ".",
                              input,
                            ),
                          ),
                        );
                      }
                      if (unseen.size === 0)
                        Deferred.doneUnsafe(ready, Effect.void);
                    });
                  },
                },
              ],
            }),
          );
          yield* Effect.addFinalizer(() =>
            Effect.sync(() => context.mockImplementation(original)),
          );
          yield* Command.runWith(dev, { version: "test" })([]).pipe(
            Effect.provideService(ProjectRoot, {
              get: Effect.succeed(project.root),
            }),
            Effect.provideService(ConfectDirectory, {
              get: Effect.succeed(path.join(project.root, "confect")),
            }),
            Effect.provideService(ConvexDirectory, {
              get: Effect.succeed(path.join(project.root, "convex")),
            }),
            Effect.forkScoped,
          );
          yield* Deferred.await(ready).pipe(Effect.timeout("15 seconds"));
          expect(context.mock.calls.length).toBeLessThanOrEqual(4);
        }).pipe(Effect.scoped),
      { timeout: 30000 },
    );
  },
);
