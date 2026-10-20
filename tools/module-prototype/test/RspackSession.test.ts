import { assert, describe, expect, it } from "@effect/vitest";
import { vi } from "vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Queue from "effect/Queue";
import * as Result from "effect/Result";
import * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";
import { fileURLToPath } from "node:url";
import * as Compilation from "../../../packages/cli/src/Compilation.ts";
import * as CompilationBackend from "../../../packages/cli/src/CompilationBackend.ts";
import * as CompilationState from "../../../packages/cli/src/CompilationState.ts";
import * as CompiledModule from "../../../packages/cli/src/CompiledModule.ts";
import * as RspackSession from "../src/RspackSession.ts";
import * as RspackCompiler from "../src/RspackCompiler.ts";
import * as RspackInputs from "../src/RspackInputs.ts";

const fixture = (files: Readonly<Record<string, string>>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.makeTempDirectoryScoped();
    for (const [relative, contents] of Object.entries(files)) {
      const file = path.join(root, relative);
      yield* fs.makeDirectory(path.dirname(file), { recursive: true });
      yield* fs.writeFileString(file, contents);
    }
    return { fs, path, root, entry: path.join(root, "entry.ts") };
  });

const scopeJob = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.scoped(
    Effect.gen(function* () {
      const scope = yield* Scope.Scope;
      return yield* effect.pipe(
        Effect.provideService(CompiledModule.ArtifactScope, scope),
      );
    }),
  );

const observe = Effect.gen(function* () {
  const compiler = yield* Compilation.Service;
  const events = yield* Queue.unbounded<CompilationState.Revision>();
  yield* compiler.events.pipe(
    Stream.runForEach((event) => Queue.offer(events, event)),
    Effect.forkScoped,
  );
  return events;
});

const prepare = (entry: string, roots: ReadonlyArray<string> = [entry]) =>
  Effect.flatMap(CompilationBackend.Service, (backend) =>
    backend.prepare({ entry, roots, profile: "modules" }),
  );

const evaluateBatchEntry = (entry: string) =>
  Effect.gen(function* () {
    const artifact = yield* CompilationBackend.prepare(entry);
    const module = yield* CompiledModule.namespace(artifact.url).pipe(
      Effect.ensuring(CompiledModule.consume(artifact)),
    );
    return { artifact, module };
  });

describe("Rspack native batch boundaries", () => {
  it.effect(
    "bounds root planning and capture replay across concurrent nested subsets",
    () =>
      Effect.gen(function* () {
        const names = Array.from(
          { length: 12 },
          (_, index) => `entry-${index}.ts`,
        );
        const { path, root } = yield* fixture(
          Object.fromEntries(
            names.map((name, index) => [
              name,
              `export const value = ${index};`,
            ]),
          ),
        );
        const roots = names.map((name) => path.join(root, name));
        let resolutions = 0;
        let replays = 0;
        const originalMake = RspackInputs.make;
        const inputsSpy = vi
          .spyOn(RspackInputs, "make")
          .mockImplementation((options) => {
            const recording = originalMake(options);
            return {
              ...recording,
              resolve: (file) =>
                Effect.sync(() => {
                  resolutions++;
                }).pipe(Effect.andThen(recording.resolve(file))),
            };
          });
        const originalCompile = RspackCompiler.compileEntries;
        const compilerSpy = vi
          .spyOn(RspackCompiler, "compileEntries")
          .mockImplementation((entries, options) =>
            originalCompile(entries, options).pipe(
              Effect.map((output) => ({
                ...output,
                validate: Effect.sync(() => {
                  replays++;
                }).pipe(Effect.andThen(output.validate)),
              })),
            ),
          );
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            inputsSpy.mockRestore();
            compilerSpy.mockRestore();
          }),
        );
        yield* scopeJob(
          Effect.gen(function* () {
            for (let boundary = 0; boundary < 2; boundary++) {
              const before = replays;
              const outcome = yield* Compilation.runJob(
                CompilationBackend.withBatch(
                  roots,
                  Effect.forEach(
                    roots,
                    (entry) =>
                      CompilationBackend.withBatch(
                        [entry],
                        evaluateBatchEntry(entry),
                      ),
                    { concurrency: 4 },
                  ),
                ),
              );
              assert(Exit.isSuccess(outcome.exit));
              expect(
                outcome.exit.value.map((evaluated) => evaluated.module.value),
              ).toEqual(Array.from({ length: 12 }, (_, index) => index));
              expect(
                outcome.receipts.flatMap((receipt) => receipt.roots).sort(),
              ).toEqual([...roots].sort());
              expect(resolutions).toBe(roots.length * (boundary + 1));
              expect(replays - before).toBeLessThanOrEqual(
                boundary === 0 ? 3 : 2,
              );
              expect(replays - before).toBeGreaterThanOrEqual(2);
              expect(compilerSpy).toHaveBeenCalledTimes(1);
            }
          }),
        ).pipe(
          Effect.provide(
            RspackSession.layer({ mode: "Once", ownedDirectories: [] }),
          ),
        );
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "keeps mid-batch source snapshots immutable and withholds stale receipts",
    () =>
      Effect.gen(function* () {
        const { entry, fs, path, root } = yield* fixture({
          "entry.ts": 'export { value } from "./shared";',
          "sibling.ts": 'export { value } from "./shared";',
          "shared.ts": "export const value = 1;",
        });
        const sibling = path.join(root, "sibling.ts");
        const roots = [entry, sibling];
        yield* Effect.gen(function* () {
          const events = yield* observe;
          const values: unknown[] = [];
          const stale = yield* Compilation.runJob(
            scopeJob(
              CompilationBackend.withBatch(
                roots,
                Effect.gen(function* () {
                  values.push((yield* evaluateBatchEntry(entry)).module.value);
                  yield* fs.writeFileString(
                    path.join(root, "shared.ts"),
                    "export const value = 2;",
                  );
                  values.push(
                    (yield* evaluateBatchEntry(sibling)).module.value,
                  );
                }),
              ),
            ),
          );
          expect(values).toEqual([1, 1]);
          expect(Exit.isFailure(stale.exit)).toBe(true);
          expect(stale.receipts).toEqual([]);
          expect(stale.failedReceipts).toEqual([]);
          yield* Queue.take(events);
          const changed = yield* Queue.take(events);
          expect(changed.affectedRoots).toEqual(roots);
          expect(CompilationState.acknowledged(changed, stale.receipts)).toBe(
            false,
          );
          const fresh = yield* Compilation.runJob(
            scopeJob(
              CompilationBackend.withBatch(
                roots,
                Effect.forEach(roots, evaluateBatchEntry, { concurrency: 4 }),
              ),
            ),
          );
          assert(Exit.isSuccess(fresh.exit));
          expect(
            fresh.exit.value.map((evaluated) => evaluated.module.value),
          ).toEqual([2, 2]);
          expect(CompilationState.acknowledged(changed, fresh.receipts)).toBe(
            true,
          );
        }).pipe(
          Effect.provide(
            RspackSession.layer({ mode: "Once", ownedDirectories: [] }),
          ),
        );
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "requests restart after a root symlink retarget and recovers in a fresh service",
    () =>
      Effect.gen(function* () {
        const { entry, fs, path, root } = yield* fixture({
          "old.ts": "export const value = 1;",
          "new.ts": "export const value = 2;",
        });
        const oldTarget = path.join(root, "old.ts");
        const newTarget = path.join(root, "new.ts");
        yield* fs.symlink(oldTarget, entry);
        yield* Effect.gen(function* () {
          const compiler = yield* Compilation.Service;
          const values: unknown[] = [];
          const stale = yield* Compilation.runJob(
            scopeJob(
              CompilationBackend.withBatch(
                [entry],
                Effect.gen(function* () {
                  values.push((yield* evaluateBatchEntry(entry)).module.value);
                  yield* fs.remove(entry);
                  yield* fs.symlink(newTarget, entry);
                  values.push((yield* evaluateBatchEntry(entry)).module.value);
                }),
              ),
            ),
          );
          expect(values).toEqual([1, 1]);
          expect(Exit.isFailure(stale.exit)).toBe(true);
          expect(stale.receipts).toEqual([]);
          const restart = yield* compiler.restartRequired;
          assert(Option.isSome(restart));
          expect(restart.value).toEqual({
            reason: "ResolutionInputsChanged",
            paths: [entry],
          });
          expect(yield* Stream.runHead(compiler.restarts)).toEqual(restart);
          expect(yield* compiler.preparedRevisions).toEqual([]);
          const blocked = yield* compiler.verify.pipe(Effect.result);
          assert(Result.isFailure(blocked));
          expect(blocked.failure).toMatchObject({
            _tag: "BundlerError",
            cause: { _tag: "CompilationRestartRequired", paths: [entry] },
          });
        }).pipe(
          Effect.provide(
            RspackSession.layer({ mode: "Once", ownedDirectories: [] }),
          ),
        );
        yield* Effect.gen(function* () {
          const fresh = yield* Compilation.runJob(
            scopeJob(
              CompilationBackend.withBatch([entry], evaluateBatchEntry(entry)),
            ),
          );
          assert(Exit.isSuccess(fresh.exit));
          expect(fresh.exit.value.module.value).toBe(2);
          expect(fresh.receipts.flatMap((receipt) => receipt.roots)).toEqual([
            newTarget,
          ]);
        }).pipe(
          Effect.provide(
            RspackSession.layer({ mode: "Once", ownedDirectories: [] }),
          ),
        );
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "requests restart when a previously acknowledged root alias changes mid-batch",
    () =>
      Effect.gen(function* () {
        const { entry, fs, path, root } = yield* fixture({
          "old.ts": "export const value = 1;",
          "new.ts": "export const value = 2;",
        });
        yield* fs.symlink(path.join(root, "old.ts"), entry);
        yield* Effect.gen(function* () {
          const compiler = yield* Compilation.Service;
          const events = yield* observe;
          const initial = yield* Compilation.runJob(
            scopeJob(
              CompilationBackend.withBatch([entry], evaluateBatchEntry(entry)),
            ),
          );
          assert(Exit.isSuccess(initial.exit));
          const first = yield* Queue.take(events);
          expect(CompilationState.acknowledged(first, initial.receipts)).toBe(
            true,
          );
          const stale = yield* Compilation.runJob(
            scopeJob(
              CompilationBackend.withBatch(
                [entry],
                Effect.gen(function* () {
                  yield* evaluateBatchEntry(entry);
                  yield* fs.remove(entry);
                  yield* fs.symlink(path.join(root, "new.ts"), entry);
                }),
              ),
            ),
          );
          expect(Exit.isFailure(stale.exit)).toBe(true);
          expect(stale.receipts).toEqual([]);
          const restart = yield* compiler.restartRequired;
          assert(Option.isSome(restart));
          expect(restart.value).toEqual({
            reason: "ResolutionInputsChanged",
            paths: [entry],
          });
          expect(yield* Stream.runHead(compiler.restarts)).toEqual(restart);
          expect(yield* compiler.preparedRevisions).toEqual([]);
          const blocked = yield* compiler.verify.pipe(Effect.result);
          assert(Result.isFailure(blocked));
          expect(blocked.failure).toMatchObject({
            _tag: "BundlerError",
            cause: { _tag: "CompilationRestartRequired", paths: [entry] },
          });
        }).pipe(
          Effect.provide(
            RspackSession.layer({ mode: "Once", ownedDirectories: [] }),
          ),
        );
        yield* Effect.gen(function* () {
          const fresh = yield* Compilation.runJob(
            scopeJob(
              CompilationBackend.withBatch([entry], evaluateBatchEntry(entry)),
            ),
          );
          assert(Exit.isSuccess(fresh.exit));
          expect(fresh.exit.value.module.value).toBe(2);
          expect(fresh.receipts.flatMap((receipt) => receipt.roots)).toEqual([
            path.join(root, "new.ts"),
          ]);
        }).pipe(
          Effect.provide(
            RspackSession.layer({ mode: "Once", ownedDirectories: [] }),
          ),
        );
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "records evaluated roots when authored evaluation fails with stable inputs",
    () =>
      Effect.gen(function* () {
        const { entry, path, root } = yield* fixture({
          "entry.ts":
            'export const value = 1; throw { _tag: "AuthoredEvaluationFailed" };',
          "sibling.ts": "export const value = 2;",
        });
        const sibling = path.join(root, "sibling.ts");
        yield* Effect.gen(function* () {
          const events = yield* observe;
          const failed = yield* Compilation.runJob(
            scopeJob(
              CompilationBackend.withBatch(
                [entry, sibling],
                evaluateBatchEntry(entry),
              ),
            ),
          );
          expect(Exit.isFailure(failed.exit)).toBe(true);
          expect(failed.receipts).toEqual([
            { context: 1, revision: 1, roots: [entry] },
          ]);
          expect(failed.failedReceipts).toEqual([]);
          const revision = yield* Queue.take(events);
          expect(
            CompilationState.unacknowledgedRoots(revision, failed.receipts),
          ).toEqual([sibling]);
        }).pipe(
          Effect.provide(
            RspackSession.layer({ mode: "Once", ownedDirectories: [] }),
          ),
        );
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "requests a restart and drops buffered receipts after a mid-batch config edit",
    () =>
      Effect.gen(function* () {
        const { entry, fs, path, root } = yield* fixture({
          "tsconfig.json": '{"compilerOptions":{"strict":true}}',
          "entry.ts": "export const value = 1;",
        });
        yield* Effect.gen(function* () {
          const compiler = yield* Compilation.Service;
          const stale = yield* Compilation.runJob(
            scopeJob(
              CompilationBackend.withBatch(
                [entry],
                Effect.gen(function* () {
                  yield* evaluateBatchEntry(entry);
                  yield* fs.writeFileString(
                    path.join(root, "tsconfig.json"),
                    '{"compilerOptions":{"strict":false}}',
                  );
                }),
              ),
            ),
          );
          expect(Exit.isFailure(stale.exit)).toBe(true);
          expect(stale.receipts).toEqual([]);
          const restart = yield* compiler.restartRequired;
          assert(Option.isSome(restart));
          expect(restart.value.paths).toContain(
            path.join(root, "tsconfig.json"),
          );
        }).pipe(
          Effect.provide(
            RspackSession.layer({ mode: "Once", ownedDirectories: [] }),
          ),
        );
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "revalidates a pre-existing capture at each fresh same-scope batch boundary",
    () =>
      Effect.gen(function* () {
        const { entry, fs, path, root } = yield* fixture({
          "entry.ts": 'export { value } from "./shared";',
          "shared.ts": "export const value = 1;",
        });
        yield* scopeJob(
          Effect.gen(function* () {
            const first = yield* Compilation.runJob(
              CompilationBackend.withBatch([entry], evaluateBatchEntry(entry)),
            );
            assert(Exit.isSuccess(first.exit));
            yield* fs.writeFileString(
              path.join(root, "shared.ts"),
              "export const value = 2;",
            );
            const stale = yield* Compilation.runJob(
              CompilationBackend.withBatch([entry], evaluateBatchEntry(entry)),
            );
            expect(Exit.isFailure(stale.exit)).toBe(true);
            expect(stale.receipts).toEqual([]);
            expect(
              (yield* CompiledModule.namespace(first.exit.value.artifact.url))
                .value,
            ).toBe(1);
            const fresh = yield* Compilation.runJob(
              scopeJob(
                CompilationBackend.withBatch(
                  [entry],
                  evaluateBatchEntry(entry),
                ),
              ),
            );
            assert(Exit.isSuccess(fresh.exit));
            expect(fresh.exit.value.module.value).toBe(2);
          }),
        ).pipe(
          Effect.provide(
            RspackSession.layer({ mode: "Once", ownedDirectories: [] }),
          ),
        );
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "does not flush nested disjoint-batch receipts through a stale outer boundary",
    () =>
      Effect.gen(function* () {
        const { entry, fs, path, root } = yield* fixture({
          "entry.ts": 'export { value } from "./shared";',
          "shared.ts": "export const value = 1;",
          "disjoint.ts": "export const value = 2;",
        });
        const disjoint = path.join(root, "disjoint.ts");
        yield* Effect.gen(function* () {
          const values: unknown[] = [];
          const stale = yield* Compilation.runJob(
            scopeJob(
              CompilationBackend.withBatch(
                [entry],
                Effect.gen(function* () {
                  values.push((yield* evaluateBatchEntry(entry)).module.value);
                  values.push(
                    (yield* CompilationBackend.withBatch(
                      [disjoint],
                      evaluateBatchEntry(disjoint),
                    )).module.value,
                  );
                  yield* fs.writeFileString(
                    disjoint,
                    "export const value = 3;",
                  );
                }),
              ),
            ),
          );
          expect(values).toEqual([1, 2]);
          expect(Exit.isFailure(stale.exit)).toBe(true);
          expect(stale.receipts).toEqual([]);
          expect(stale.failedReceipts).toEqual([]);
        }).pipe(
          Effect.provide(
            RspackSession.layer({ mode: "Once", ownedDirectories: [] }),
          ),
        );
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});

describe("Rspack native batch boundaries outside entries", () => {
  it.effect(
    "revalidates an entry outside outer roots before flushing any receipts",
    () =>
      Effect.gen(function* () {
        const { entry, fs, path, root } = yield* fixture({
          "entry.ts": "export const value = 1;",
          "outside.ts": 'export { value } from "./outside-helper";',
          "outside-helper.ts": "export const value = 2;",
        });
        const outside = path.join(root, "outside.ts");
        yield* Effect.gen(function* () {
          const values: unknown[] = [];
          const stale = yield* Compilation.runJob(
            scopeJob(
              CompilationBackend.withBatch(
                [entry],
                Effect.gen(function* () {
                  values.push((yield* evaluateBatchEntry(entry)).module.value);
                  values.push(
                    (yield* evaluateBatchEntry(outside)).module.value,
                  );
                  yield* fs.writeFileString(
                    path.join(root, "outside-helper.ts"),
                    "export const value = 3;",
                  );
                }),
              ),
            ),
          );
          expect(values).toEqual([1, 2]);
          expect(Exit.isFailure(stale.exit)).toBe(true);
          expect(stale.receipts).toEqual([]);
          const recovered = yield* Compilation.runJob(
            scopeJob(
              CompilationBackend.withBatch(
                [entry],
                evaluateBatchEntry(outside),
              ),
            ),
          );
          assert(Exit.isSuccess(recovered.exit));
          expect(recovered.exit.value.module.value).toBe(3);
          expect(
            recovered.receipts.flatMap((receipt) => receipt.roots),
          ).toEqual([outside]);
        }).pipe(
          Effect.provide(
            RspackSession.layer({ mode: "Once", ownedDirectories: [] }),
          ),
        );
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "keeps older captures in the exit check when a child scope builds a newer revision",
    () =>
      Effect.gen(function* () {
        const { entry, fs, path, root } = yield* fixture({
          "entry.ts": 'export { value } from "./shared";',
          "sibling.ts": 'export { value } from "./shared";',
          "shared.ts": "export const value = 1;",
        });
        const sibling = path.join(root, "sibling.ts");
        yield* Effect.gen(function* () {
          const values: unknown[] = [];
          const stale = yield* Compilation.runJob(
            scopeJob(
              CompilationBackend.withBatch(
                [entry, sibling],
                Effect.gen(function* () {
                  values.push((yield* evaluateBatchEntry(entry)).module.value);
                  yield* fs.writeFileString(
                    path.join(root, "shared.ts"),
                    "export const value = 2;",
                  );
                  values.push(
                    (yield* scopeJob(evaluateBatchEntry(sibling))).module.value,
                  );
                }),
              ),
            ),
          );
          expect(values).toEqual([1, 2]);
          expect(Exit.isFailure(stale.exit)).toBe(true);
          expect(stale.receipts).toEqual([]);
        }).pipe(
          Effect.provide(
            RspackSession.layer({ mode: "Once", ownedDirectories: [] }),
          ),
        );
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});

describe("Rspack native compilation session", () => {
  it.effect(
    "shares immutable artifacts only inside the job scope and cleans them up",
    () =>
      Effect.gen(function* () {
        const { entry, fs } = yield* fixture({
          "entry.ts": "let value = 0; export const probe = () => ++value;",
        });
        yield* Effect.gen(function* () {
          const compiler = yield* Compilation.Service;
          const first = yield* scopeJob(
            Effect.gen(function* () {
              const one = yield* prepare(entry);
              const two = yield* prepare(entry);
              expect(one.url).toBe(two.url);
              expect(two.origin).toEqual(one.origin);
              const namespace = yield* CompiledModule.namespace(one.url);
              assert(typeof namespace.probe === "function");
              expect(namespace.probe()).toBe(1);
              expect(namespace.probe()).toBe(2);
              return one;
            }),
          );
          expect(yield* fs.exists(fileURLToPath(first.url))).toBe(false);
          const before = yield* compiler.preparedRevisions;
          yield* compiler.verify;
          yield* compiler.verify;
          expect(yield* compiler.preparedRevisions).toEqual(before);
          const second = yield* scopeJob(
            Effect.gen(function* () {
              const artifact = yield* prepare(entry);
              const namespace = yield* CompiledModule.namespace(artifact.url);
              assert(typeof namespace.probe === "function");
              expect(namespace.probe()).toBe(1);
              return artifact;
            }),
          );
          expect(second.url).not.toBe(first.url);
          expect(second.origin?.revision).toBeGreaterThan(
            first.origin?.revision ?? 0,
          );
        }).pipe(
          Effect.provide(
            RspackSession.layer({ mode: "Once", ownedDirectories: [] }),
          ),
        );
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "projects each entry graph without sibling-only sources or imports",
    () =>
      Effect.gen(function* () {
        const { entry, path, root } = yield* fixture({
          "entry.ts": 'export { value } from "./shared";',
          "shared.ts": "export const value = 1;",
          "sibling.ts":
            'export { value } from "./shared"; export { only } from "./sibling-only";',
          "sibling-only.ts": 'export { existsSync as only } from "node:fs";',
        });
        const shared = path.join(root, "shared.ts");
        const sibling = path.join(root, "sibling.ts");
        const siblingOnly = path.join(root, "sibling-only.ts");
        yield* scopeJob(
          Effect.gen(function* () {
            const first = yield* prepare(entry, [entry, sibling]);
            const firstPaths = first.graph.nodes.flatMap((node) =>
              node.path ? [node.path] : [],
            );
            const firstImports = first.graph.nodes.flatMap((node) =>
              node.imports.map((edge) => edge.original),
            );
            expect(firstPaths).toEqual(expect.arrayContaining([entry, shared]));
            expect(firstPaths).not.toContain(sibling);
            expect(firstPaths).not.toContain(siblingOnly);
            expect(firstImports).toContain("./shared");
            expect(firstImports).not.toContain("./sibling-only");
            expect(firstImports).not.toContain("node:fs");

            const second = yield* prepare(sibling, [entry, sibling]);
            const secondPaths = second.graph.nodes.flatMap((node) =>
              node.path ? [node.path] : [],
            );
            const secondImports = second.graph.nodes.flatMap((node) =>
              node.imports.map((edge) => edge.original),
            );
            expect(secondPaths).toEqual(
              expect.arrayContaining([sibling, shared, siblingOnly]),
            );
            expect(secondPaths).not.toContain(entry);
            expect(secondImports).toContain("node:fs");
            expect(second.origin?.context).toBe(first.origin?.context);
            expect(second.origin?.revision).toBe(first.origin?.revision);
            for (const artifact of [first, second]) {
              const ids = new Set(artifact.graph.nodes.map((node) => node.id));
              expect(
                artifact.graph.nodes.every((node) =>
                  node.imports.every((edge) => ids.has(edge.id)),
                ),
              ).toBe(true);
            }
          }),
        ).pipe(
          Effect.provide(
            RspackSession.layer({ mode: "Once", ownedDirectories: [] }),
          ),
        );
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "keeps changed siblings pending until their own artifacts are consumed",
    () =>
      Effect.gen(function* () {
        const { entry, fs, path, root } = yield* fixture({
          "entry.ts": "export const value = 1;",
          "sibling.ts": "export const value = 2;",
        });
        const sibling = path.join(root, "sibling.ts");
        const roots = [entry, sibling];
        yield* Effect.gen(function* () {
          const compiler = yield* Compilation.Service;
          const events = yield* observe;
          yield* scopeJob(prepare(entry, roots));
          yield* Queue.take(events);
          yield* fs.writeFileString(sibling, "export const value = 3;");
          yield* compiler.verify;
          const changed = yield* Queue.take(events);
          expect(changed.affectedRoots).toEqual([sibling]);
          yield* Compilation.withPreparedRevisions(
            scopeJob(
              Effect.gen(function* () {
                const first = yield* Compilation.runJob(
                  prepare(entry, roots).pipe(
                    Effect.tap(CompiledModule.consume),
                  ),
                );
                expect(
                  CompilationState.acknowledged(changed, first.receipts),
                ).toBe(false);
                const second = yield* Compilation.runJob(
                  prepare(sibling, roots).pipe(
                    Effect.tap(CompiledModule.consume),
                  ),
                );
                expect(
                  CompilationState.acknowledged(changed, [
                    ...first.receipts,
                    ...second.receipts,
                  ]),
                ).toBe(true);
              }),
            ),
          );
        }).pipe(
          Effect.provide(
            RspackSession.layer({ mode: "Once", ownedDirectories: [] }),
          ),
        );
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "does not relabel an older immutable capture with a newer prepared revision",
    () =>
      Effect.gen(function* () {
        const { entry } = yield* fixture({
          "entry.ts": "export const value = 1;",
        });
        yield* Effect.gen(function* () {
          const scope = yield* Scope.fork(yield* Scope.Scope, "sequential");
          const first = yield* prepare(entry).pipe(
            Effect.provideService(CompiledModule.ArtifactScope, scope),
          );
          const newer = yield* scopeJob(prepare(entry));
          expect(newer.origin?.revision).toBeGreaterThan(
            first.origin?.revision ?? 0,
          );
          const outcome = yield* Compilation.withPreparedRevisions(
            Compilation.runJob(
              prepare(entry).pipe(
                Effect.tap((artifact) =>
                  Effect.sync(() => {
                    expect(artifact.url).toBe(first.url);
                    expect(artifact.origin).toBeUndefined();
                  }),
                ),
                Effect.tap(CompiledModule.consume),
              ),
            ),
          ).pipe(Effect.provideService(CompiledModule.ArtifactScope, scope));
          expect(Exit.isSuccess(outcome.exit)).toBe(true);
          expect(outcome.receipts).toEqual([]);
        }).pipe(
          Effect.provide(
            RspackSession.layer({ mode: "Once", ownedDirectories: [] }),
          ),
        );
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "rejects stale scope captures without acknowledging the newer revision",
    () =>
      Effect.gen(function* () {
        const { entry, fs } = yield* fixture({
          "entry.ts": "export const value = 1;",
        });
        yield* Effect.gen(function* () {
          const compiler = yield* Compilation.Service;
          yield* scopeJob(
            Effect.gen(function* () {
              const original = yield* prepare(entry);
              yield* Compilation.withPreparedRevisions(
                Effect.gen(function* () {
                  yield* fs.writeFileString(entry, "export const value = 2;");
                  yield* compiler.verify;
                  const outcome = yield* Compilation.runJob(
                    prepare(entry).pipe(Effect.tap(CompiledModule.consume)),
                  );
                  expect(Exit.isFailure(outcome.exit)).toBe(true);
                  expect(outcome.receipts).toEqual([]);
                  expect(outcome.failedReceipts).toEqual([]);
                  expect(
                    (yield* CompiledModule.namespace(original.url)).value,
                  ).toBe(1);
                }),
              );
            }),
          );
          yield* scopeJob(
            Effect.gen(function* () {
              const fresh = yield* prepare(entry);
              expect((yield* CompiledModule.namespace(fresh.url)).value).toBe(
                2,
              );
            }),
          );
        }).pipe(
          Effect.provide(
            RspackSession.layer({ mode: "Once", ownedDirectories: [] }),
          ),
        );
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect.each([
    "export const value = ;",
    'import { value } from "./missing"; export { value };',
  ])("recovers native compilation failure from evidence: %s", (initial) =>
    Effect.gen(function* () {
      const { entry, fs, path, root } = yield* fixture({
        "entry.ts": initial,
      });
      yield* Effect.gen(function* () {
        const compiler = yield* Compilation.Service;
        const events = yield* observe;
        const failed = yield* Compilation.runJob(scopeJob(prepare(entry)));
        expect(Exit.isFailure(failed.exit)).toBe(true);
        expect(failed.failedReceipts).toEqual([
          { context: 1, revision: 1, roots: [entry] },
        ]);
        const failureEvent = yield* Queue.take(events);
        expect(failureEvent.errors.length).toBeGreaterThan(0);
        expect(yield* compiler.preparedRevisions).toEqual([]);
        yield* compiler.verify;
        if (initial.includes("missing"))
          yield* fs.writeFileString(
            path.join(root, "missing.ts"),
            "export const value = 42;",
          );
        else yield* fs.writeFileString(entry, "export const value = 42;");
        yield* compiler.verify;
        const recovery = yield* Queue.take(events);
        expect(recovery.errors).toEqual([]);
        expect(recovery.affectedRoots).toEqual([entry]);
        yield* scopeJob(
          Effect.gen(function* () {
            const artifact = yield* prepare(entry);
            expect((yield* CompiledModule.namespace(artifact.url)).value).toBe(
              42,
            );
          }),
        );
      }).pipe(
        Effect.provide(
          RspackSession.layer({ mode: "Once", ownedDirectories: [] }),
        ),
      );
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "retains failed batch siblings and retires their successful subset context after recovery",
    () =>
      Effect.gen(function* () {
        const { entry, fs, path, root } = yield* fixture({
          "entry.ts": "export const value = ;",
          "sibling.ts": "export const value = 2;",
        });
        const sibling = path.join(root, "sibling.ts");
        yield* Effect.gen(function* () {
          const compiler = yield* Compilation.Service;
          const failed = yield* Compilation.runJob(
            scopeJob(prepare(entry, [entry, sibling])),
          );
          expect(failed.failedReceipts, String(failed.exit)).toEqual([
            { context: 1, revision: 1, roots: [entry] },
          ]);
          yield* scopeJob(prepare(sibling));
          expect(
            (yield* compiler.topology).map((context) => context.id),
          ).toEqual([1, 2]);
          yield* fs.writeFileString(entry, "export const value = 1;");
          yield* compiler.verify;
          yield* scopeJob(
            Effect.gen(function* () {
              const artifact = yield* prepare(entry, [entry, sibling]);
              expect(artifact.origin?.context).toBe(1);
              const other = yield* prepare(sibling);
              expect(other.origin?.context).toBe(1);
            }),
          );
          expect(
            (yield* compiler.topology).map((context) => context.id),
          ).toEqual([1]);
        }).pipe(
          Effect.provide(
            RspackSession.layer({ mode: "Once", ownedDirectories: [] }),
          ),
        );
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "partitions batch topology by lexical configuration before resolving symlinks",
    () =>
      Effect.gen(function* () {
        const { entry, fs, path, root } = yield* fixture({
          "tsconfig.json":
            '{"compilerOptions":{"paths":{"@value":["./value.ts"]}}}',
          "value.ts": "export const value = 1;",
          "entry.ts": 'export { value } from "@value";',
          "nested/tsconfig.json":
            '{"compilerOptions":{"paths":{"@value":["./value.ts"]}}}',
          "nested/value.ts": "export const value = 2;",
        });
        const nested = path.join(root, "nested/entry.ts");
        yield* fs.symlink(entry, nested);
        yield* Effect.gen(function* () {
          const compiler = yield* Compilation.Service;
          yield* scopeJob(
            Effect.gen(function* () {
              const one = yield* prepare(entry, [entry, nested]);
              const two = yield* prepare(nested, [entry, nested]);
              expect((yield* CompiledModule.namespace(one.url)).value).toBe(1);
              expect((yield* CompiledModule.namespace(two.url)).value).toBe(2);
              expect(
                (yield* compiler.topology).map(
                  (context) => context.configuration,
                ),
              ).toEqual([
                path.join(root, "tsconfig.json"),
                path.join(root, "nested/tsconfig.json"),
              ]);
            }),
          );
        }).pipe(
          Effect.provide(
            RspackSession.layer({ mode: "Once", ownedDirectories: [] }),
          ),
        );
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "polls real evidence without rebuilding unchanged inputs and stops on reset",
    () =>
      Effect.gen(function* () {
        const { entry, fs } = yield* fixture({
          "entry.ts": "export const value = 1;",
        });
        yield* Effect.gen(function* () {
          const compiler = yield* Compilation.Service;
          const events = yield* observe;
          yield* scopeJob(prepare(entry));
          const initial = yield* Queue.take(events);
          yield* TestClock.adjust("1 second");
          expect(yield* compiler.preparedRevisions).toEqual([
            {
              context: initial.context,
              revision: initial.revision,
              roots: [entry],
            },
          ]);
          yield* fs.writeFileString(entry, "export const value = 2;");
          yield* TestClock.adjust("250 millis");
          const changed = yield* Queue.take(events);
          expect(changed.affectedRoots).toEqual([entry]);
          yield* compiler.reset;
          yield* fs.writeFileString(entry, "export const value = 3;");
          yield* TestClock.adjust("1 second");
          expect(yield* compiler.topology).toEqual([]);
          expect(yield* compiler.preparedRevisions).toEqual([]);
          const pending = yield* compiler.restartRequired;
          expect(Option.isNone(pending)).toBe(true);
        }).pipe(
          Effect.provide(
            RspackSession.layer({ mode: "Watch", ownedDirectories: [] }),
          ),
        );
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "ignores generated content while retaining authored exceptions and config warnings",
    () =>
      Effect.gen(function* () {
        const { entry, fs, path, root } = yield* fixture({
          "tsconfig.json": '{"compilerOptions":{"strict":"invalid"}}',
          "entry.ts":
            'import generated from "./generated/model"; import { value } from "./generated/authored"; export const result = [generated, value];',
          "generated/model.ts": 'export default "generated content";',
          "generated/authored.ts": "export const value = 1;",
        });
        const authored = path.join(root, "generated/authored.ts");
        yield* Effect.gen(function* () {
          const compiler = yield* Compilation.Service;
          const events = yield* observe;
          yield* scopeJob(
            Effect.gen(function* () {
              const artifact = yield* prepare(entry);
              expect(artifact.warnings).toEqual(
                expect.arrayContaining([
                  expect.objectContaining({
                    pluginName: "confect:configuration",
                    text: expect.stringContaining("strict"),
                  }),
                ]),
              );
              expect(
                (yield* CompiledModule.namespace(artifact.url)).result,
              ).toEqual(["generated content", 1]);
            }),
          );
          yield* Queue.take(events);
          const before = yield* compiler.preparedRevisions;
          yield* fs.writeFileString(
            path.join(root, "generated/model.ts"),
            'export default "different generated content";',
          );
          yield* compiler.verify;
          expect(yield* compiler.preparedRevisions).toEqual(before);
          yield* fs.writeFileString(authored, "export const value = 2;");
          yield* compiler.verify;
          expect((yield* Queue.take(events)).affectedRoots).toEqual([entry]);
        }).pipe(
          Effect.provide(
            RspackSession.layer({
              mode: "Once",
              ownedDirectories: [path.join(root, "generated")],
              authoredFiles: [authored],
            }),
          ),
        );
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "rejects consumption when captured resolution inputs require a restart",
    () =>
      Effect.gen(function* () {
        const { entry, fs, path, root } = yield* fixture({
          "package.json": '{"type":"module"}',
          "entry.ts": "export const value = 1;",
        });
        yield* Effect.gen(function* () {
          const compiler = yield* Compilation.Service;
          yield* scopeJob(
            Effect.gen(function* () {
              yield* prepare(entry);
              yield* fs.writeFileString(
                path.join(root, "package.json"),
                '{"type":"module","changed":true}',
              );
              const outcome = yield* Compilation.runJob(
                prepare(entry).pipe(Effect.tap(CompiledModule.consume)),
              );
              expect(Exit.isFailure(outcome.exit)).toBe(true);
              expect(outcome.receipts).toEqual([]);
              expect(Option.isSome(yield* compiler.restartRequired)).toBe(true);
            }),
          );
        }).pipe(
          Effect.provide(
            RspackSession.layer({ mode: "Once", ownedDirectories: [] }),
          ),
        );
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "bounds provisional compilation at eight attempts and cleans discarded artifacts",
    () =>
      Effect.gen(function* () {
        const { entry, fs, path, root } = yield* fixture({
          "entry.ts": "export const value = 1;",
        });
        let attempts = 0;
        const original = RspackCompiler.compileEntries;
        const spy = vi
          .spyOn(RspackCompiler, "compileEntries")
          .mockImplementation((entries, options) =>
            Effect.gen(function* () {
              const output = yield* original(entries, options);
              assert(options);
              yield* options.inputs.trackSource(
                path.join(root, `expanded-${++attempts}`, "source.ts"),
              );
              return output;
            }),
          );
        yield* Effect.addFinalizer(() => Effect.sync(() => spy.mockRestore()));
        yield* Effect.gen(function* () {
          const compiler = yield* Compilation.Service;
          const outcome = yield* scopeJob(prepare(entry)).pipe(Effect.result);
          assert(Result.isFailure(outcome));
          expect(outcome.failure).toMatchObject({
            _tag: "BundlerError",
            cause: { _tag: "RspackSessionFailed", reason: "UnstableInputs" },
          });
          expect(attempts).toBe(8);
          expect(yield* compiler.preparedRevisions).toEqual([]);
          expect(
            (yield* fs.readDirectory(root)).filter((name) =>
              name.startsWith(".confect-artifacts-"),
            ),
          ).toEqual([]);
        }).pipe(
          Effect.provide(
            RspackSession.layer({ mode: "Once", ownedDirectories: [] }),
          ),
        );
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("fails the legacy compilation method closed", () =>
    Effect.gen(function* () {
      const { entry } = yield* fixture({
        "entry.ts": "export const value = 1;",
      });
      yield* Effect.gen(function* () {
        const compiler = yield* Compilation.Service;
        const configuration =
          yield* compiler.resolutionInputs.configuration(entry);
        const result = yield* compiler
          .compile({
            roots: [entry],
            profile: "modules",
            configuration,
            options: {},
            normalize: (metafile) => metafile,
          })
          .pipe(Effect.result);
        assert(Result.isFailure(result));
        expect(result.failure).toMatchObject({
          _tag: "BundlerError",
          cause: {
            _tag: "RspackSessionFailed",
            reason: "LegacyCompileUnsupported",
          },
        });
      }).pipe(
        Effect.provide(
          RspackSession.layer({ mode: "Once", ownedDirectories: [] }),
        ),
      );
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
