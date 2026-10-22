import * as Deferred from "effect/Deferred";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import * as NativeService from "../src/NativeService";
import type * as Protocol from "../src/Protocol";

const fake = String.raw`
const mode = process.argv[1];
if (mode === 'kill') { setInterval(() => {}, 1000); process.on('SIGTERM', () => {}); }
let bytes = Buffer.alloc(0), build, callback, lastId = 0, disposal, pendingCancel;
const send = (value) => {
  const body = Buffer.from(JSON.stringify({version:1, ...value}));
  const header = Buffer.alloc(4); header.writeUInt32BE(body.length);
  process.stdout.write(Buffer.concat([header, body]));
};
const capture = (status = 'Succeeded', epoch = build.epoch) => send({
  id:build.id, tag:'Capture', buildId:build.buildId, epoch, status,
  provisional:true, sources:[], outputs:[], metafile:'{}', errors:[], warnings:[]
});
const finishCancel = () => {
  capture(mode === 'late-success' ? 'Succeeded' : 'Cancelled');
  if(mode === 'delayed-ack') { pendingCancel = { id:disposal.id, buildId:build.buildId }; build = undefined; return; }
  if (disposal.tag === 'Dispose') send({id:disposal.id,tag:'Disposed',contextId:1,disposeCount:1});
  else send({id:disposal.id,tag:'Cancelled',buildId:build.buildId});
  build = undefined;
};
const accept = (request) => {
  if (request.id <= lastId) process.exit(87);
  lastId = request.id;
  switch(request.tag) {
    case 'Hello':
      if(mode === 'malformed') { process.stdout.write(Buffer.from([0,0,0,1,0xff])); return; }
      if(mode === 'oversized') { process.stdout.write(Buffer.from([0,128,0,1])); return; }
      if(mode === 'truncated') { process.stdout.write(Buffer.from([0,0,0,9,123])); process.exit(0); }
      if(mode === 'death') process.exit(23);
      if(mode === 'timeout') return;
      if(mode === 'stderr') process.stderr.write('x'.repeat(100000));
      send({id:request.id,tag:'Hello',esbuildVersion:mode === 'version' ? '0.0.0' : '0.28.2',capabilities:mode === 'capabilities' ? [] : ['resolve-rpc','file-scope','capture-v1','cancel-v1'],maxFrameBytes:8388608,maxCallbacks:32});
      return;
    case 'Create':
      send({id:request.id + (mode === 'unknown-id' ? 1 : 0),tag:'Created',contextId:mode === 'context' ? 2 : 1});
      return;
    case 'Rebuild':
      build = request;
      if(mode === 'epoch') { capture('Succeeded', request.epoch + 1); return; }
      if(mode === 'duplicate-response') { capture(); capture(); build = undefined; return; }
      if(mode === 'capture' || (mode === 'completed-race' && request.buildId > 1)) { capture(); build = undefined; return; }
      callback = {id:0,tag:'Resolve',callbackId:request.buildId,buildId:request.buildId,epoch:request.epoch,args:{path:'dependency',importer:'/root/entry.ts',namespace:'file',resolveDir:'/root',kind:'import-statement',with:{}},probe:{path:'/root/dependency.ts',namespace:'file',suffix:'',external:false,sideEffects:true,errors:[],warnings:[]}};
      send(callback);
      if(mode === 'duplicate-callback') send(callback);
      return;
    case 'ResolveResult':
      if(mode === 'completed-race') return;
      if(disposal) { finishCancel(); return; }
      capture(); build = undefined; return;
    case 'CallbackCancelled': finishCancel(); return;
    case 'Cancel':
      if(mode === 'completed-race') { capture(); send({id:request.id,tag:'Cancelled',buildId:build.buildId}); build = undefined; return; }
      disposal = request;
      send({id:0,tag:'CancelCallbacks',buildId:build.buildId,epoch:build.epoch,callbackIds:[mode === 'unknown-callback' ? 999 : callback.callbackId]});
      return;
    case 'Dispose':
      if(pendingCancel) { send({id:pendingCancel.id,tag:'Cancelled',buildId:pendingCancel.buildId}); pendingCancel = undefined; }
      if(mode === 'dispose-timeout' || mode === 'kill') return;
      if(build) { disposal = request; send({id:0,tag:'CancelCallbacks',buildId:build.buildId,epoch:build.epoch,callbackIds:[callback.callbackId]}); return; }
      send({id:request.id,tag:'Disposed',contextId:1,disposeCount:1}); return;
  }
};
process.stdin.on('data', chunk => {
  bytes = Buffer.concat([bytes, chunk]);
  while(bytes.length >= 4 && bytes.length >= 4 + bytes.readUInt32BE()) {
    const length = bytes.readUInt32BE(); const body = bytes.subarray(4,4+length);
    bytes = bytes.subarray(4+length); accept(JSON.parse(body.toString()));
  }
});
process.stdin.on('end', () => { if(mode !== 'kill') setImmediate(() => process.exit(0)); });
`;

const createOptions: Protocol.CreateOptions = {
  root: "/root",
  entries: ["/root/entry.ts"],
  outdir: "/out",
  conditions: [],
  tsconfigRaw: "{}",
};
class TestCallbackRejected extends Schema.TaggedError<TestCallbackRejected>()(
  "TestCallbackRejected",
  { path: Schema.String },
) {}
const make = <E = never, R = never>(
  mode: string,
  resolve: (
    request: Protocol.Resolve,
  ) => Effect.Effect<Protocol.Decision, E, R> = () =>
    Effect.succeed({ mode: "probe" }),
  timeoutMs = 2_000,
) =>
  NativeService.make(process.execPath, resolve, {
    args: ["-e", fake, mode],
    timeoutMs,
  });

describe("NativeService", () => {
  it.live(
    "blocks another rebuild until cancellation acknowledgment arrives",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const entered = yield* Deferred.make<void>();
          const service = yield* make("delayed-ack", () =>
            Deferred.succeed(entered, undefined).pipe(
              Effect.andThen(Effect.never),
            ),
          );
          yield* service.create(createOptions);
          const build = yield* service
            .rebuild({ buildId: 1, epoch: 1 })
            .pipe(Effect.forkScoped);
          yield* Deferred.await(entered);
          const cancellation = yield* service.cancel(1).pipe(Effect.forkScoped);
          expect((yield* Fiber.join(build)).status).toBe("Cancelled");
          expect(cancellation.pollUnsafe()).toBeUndefined();
          const next = yield* service
            .rebuild({ buildId: 2, epoch: 2 })
            .pipe(Effect.result);
          expect(Result.isFailure(next)).toBe(true);
          expect(service.diagnostics().pendingRequests).toBe(1);
          yield* service.dispose();
          yield* Fiber.join(cancellation);
          expect(service.diagnostics().pendingRequests).toBe(0);
        }),
      ),
  );

  it.live(
    "accepts a provisional completion that precedes native cancellation acceptance",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const entered = yield* Deferred.make<void>();
          const service = yield* make("completed-race", () =>
            Deferred.succeed(entered, undefined).pipe(
              Effect.as({ mode: "probe" as const }),
            ),
          );
          yield* service.create(createOptions);
          const build = yield* service
            .rebuild({ buildId: 1, epoch: 1 })
            .pipe(Effect.forkScoped);
          yield* Deferred.await(entered);
          yield* Effect.yieldNow;
          expect(service.diagnostics().pendingCallbacks).toBe(0);
          yield* service.cancel(1);
          const capture = yield* Fiber.join(build);
          expect(capture.status).toBe("Succeeded");
          expect(capture.provisional).toBe(true);
          expect(
            (yield* service.rebuild({ buildId: 2, epoch: 2 })).status,
          ).toBe("Succeeded");
        }),
      ),
  );

  it.live(
    "rejects a successful capture after native cancellation acceptance",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const entered = yield* Deferred.make<void>();
          const service = yield* make("late-success", () =>
            Deferred.succeed(entered, undefined).pipe(
              Effect.andThen(Effect.never),
            ),
          );
          yield* service.create(createOptions);
          const build = yield* service
            .rebuild({ buildId: 1, epoch: 1 })
            .pipe(Effect.result, Effect.forkScoped);
          yield* Deferred.await(entered);
          expect(
            Result.isFailure(yield* service.cancel(1).pipe(Effect.result)),
          ).toBe(true);
          expect(Result.isFailure(yield* Fiber.join(build))).toBe(true);
        }),
      ),
  );

  it.live(
    "preserves the structured host callback failure and its identities",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const expected = new TestCallbackRejected({ path: "dependency" });
          const service = yield* make("normal", () => Effect.fail(expected));
          yield* service.create(createOptions);
          const result = yield* service
            .rebuild({ buildId: 1, epoch: 5 })
            .pipe(Effect.result);
          expect(Result.isFailure(result)).toBe(true);
          if (Result.isFailure(result)) {
            expect(result.failure._tag).toBe("NativeCallbackFailure");
            if (result.failure._tag === "NativeCallbackFailure") {
              expect([
                result.failure.callbackId,
                result.failure.buildId,
                result.failure.epoch,
              ]).toEqual([1, 1, 5]);
              const cause = Cause.findError(result.failure.cause);
              expect(Result.isSuccess(cause) && cause.success).toBe(expected);
            }
          }
        }),
      ),
  );

  it.live(
    "routes resolve Effects, retains one context, and awaits process close",
    () => {
      const observed: Protocol.Resolve[] = [];
      return Effect.scoped(
        Effect.gen(function* () {
          const service = yield* make("normal", (request) =>
            Effect.sync(() => {
              observed.push(request);
              return { mode: "probe" as const };
            }),
          );
          yield* service.create(createOptions);
          const first = yield* service.rebuild({ buildId: 1, epoch: 10 });
          const second = yield* service.rebuild({ buildId: 2, epoch: 11 });
          expect([first.status, second.status]).toEqual([
            "Succeeded",
            "Succeeded",
          ]);
          expect(
            observed.map(({ buildId, epoch }) => [buildId, epoch]),
          ).toEqual([
            [1, 10],
            [2, 11],
          ]);
          yield* service.dispose();
          yield* service.dispose();
          expect(service.diagnostics()).toEqual({
            stderr: "",
            pendingRequests: 0,
            pendingCallbacks: 0,
            closed: true,
          });
          expect(
            Result.isFailure(
              yield* service
                .rebuild({ buildId: 3, epoch: 12 })
                .pipe(Effect.result),
            ),
          ).toBe(true);
        }),
      );
    },
  );

  it.live.each([
    "malformed",
    "oversized",
    "truncated",
    "death",
    "version",
    "capabilities",
    "timeout",
  ])("fails acquisition and cleans up %s", (mode) => {
    return Effect.gen(function* () {
      const result = yield* Effect.scoped(make(mode, undefined, 100)).pipe(
        Effect.result,
      );
      expect(Result.isFailure(result)).toBe(true);
    });
  });

  it.live.each([
    "unknown-id",
    "context",
    "epoch",
    "duplicate-response",
    "duplicate-callback",
  ])("fails closed on %s", (mode) => {
    return Effect.scoped(
      Effect.gen(function* () {
        const service = yield* make(mode, () => Effect.never);
        const created = yield* service
          .create(createOptions)
          .pipe(Effect.result);
        if (Result.isSuccess(created)) {
          const built = yield* service
            .rebuild({ buildId: 1, epoch: 1 })
            .pipe(Effect.result);
          if (mode !== "duplicate-response")
            expect(Result.isFailure(built)).toBe(true);
        } else expect(["unknown-id", "context"]).toContain(mode);
        expect(
          Result.isFailure(yield* service.dispose().pipe(Effect.result)),
        ).toBe(true);
        expect(service.diagnostics().closed).toBe(true);
        expect(service.diagnostics().pendingRequests).toBe(0);
        expect(service.diagnostics().pendingCallbacks).toBe(0);
      }),
    );
  });

  it.live(
    "settles callback finalizers before cancellation is acknowledged",
    () => {
      return Effect.scoped(
        Effect.gen(function* () {
          const entered = yield* Deferred.make<void>();
          let finalized = false;
          const service = yield* make("normal", () =>
            Deferred.succeed(entered, undefined).pipe(
              Effect.andThen(Effect.never),
              Effect.ensuring(
                Effect.sync(() => {
                  finalized = true;
                }),
              ),
            ),
          );
          yield* service.create(createOptions);
          const build = yield* service
            .rebuild({ buildId: 1, epoch: 1 })
            .pipe(Effect.forkScoped);
          yield* Deferred.await(entered);
          yield* service.cancel(1);
          expect(finalized).toBe(true);
          expect((yield* Fiber.join(build)).status).toBe("Cancelled");
          expect(service.diagnostics().pendingCallbacks).toBe(0);
        }),
      );
    },
  );

  it.live(
    "interrupting a rebuild cancels native work and settles the callback",
    () => {
      return Effect.scoped(
        Effect.gen(function* () {
          const entered = yield* Deferred.make<void>();
          let finalized = false;
          const service = yield* make("normal", () =>
            Deferred.succeed(entered, undefined).pipe(
              Effect.andThen(Effect.never),
              Effect.ensuring(
                Effect.sync(() => {
                  finalized = true;
                }),
              ),
            ),
          );
          yield* service.create(createOptions);
          const build = yield* service
            .rebuild({ buildId: 1, epoch: 1 })
            .pipe(Effect.forkScoped);
          yield* Deferred.await(entered);
          yield* Fiber.interrupt(build);
          expect(finalized).toBe(true);
          expect(service.diagnostics().pendingRequests).toBe(0);
        }),
      );
    },
  );

  it.live(
    "does not acknowledge cancellation until asynchronous callback cleanup settles",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const entered = yield* Deferred.make<void>();
          const cleaning = yield* Deferred.make<void>();
          const release = yield* Deferred.make<void>();
          const service = yield* make("normal", () =>
            Deferred.succeed(entered, undefined).pipe(
              Effect.andThen(Effect.never),
              Effect.ensuring(
                Deferred.succeed(cleaning, undefined).pipe(
                  Effect.andThen(Deferred.await(release)),
                ),
              ),
            ),
          );
          yield* service.create(createOptions);
          const build = yield* service
            .rebuild({ buildId: 1, epoch: 1 })
            .pipe(Effect.forkScoped);
          yield* Deferred.await(entered);
          const cancellation = yield* service.cancel(1).pipe(Effect.forkScoped);
          yield* Deferred.await(cleaning);
          expect(cancellation.pollUnsafe()).toBeUndefined();
          expect(service.diagnostics().pendingCallbacks).toBe(1);
          yield* Deferred.succeed(release, undefined);
          yield* Fiber.join(cancellation);
          expect((yield* Fiber.join(build)).status).toBe("Cancelled");
          expect(service.diagnostics().pendingCallbacks).toBe(0);
        }),
      ),
  );

  it.live("disposal settles active callbacks and waits for close", () => {
    return Effect.scoped(
      Effect.gen(function* () {
        const entered = yield* Deferred.make<void>();
        let finalized = false;
        const service = yield* make("normal", () =>
          Deferred.succeed(entered, undefined).pipe(
            Effect.andThen(Effect.never),
            Effect.ensuring(
              Effect.sync(() => {
                finalized = true;
              }),
            ),
          ),
        );
        yield* service.create(createOptions);
        const build = yield* service
          .rebuild({ buildId: 1, epoch: 1 })
          .pipe(Effect.forkScoped);
        yield* Deferred.await(entered);
        yield* service.dispose();
        expect((yield* Fiber.join(build)).status).toBe("Cancelled");
        expect(finalized).toBe(true);
        expect(service.diagnostics().closed).toBe(true);
      }),
    );
  });

  it.live("rejects cancellation of an unknown callback", () => {
    return Effect.scoped(
      Effect.gen(function* () {
        const entered = yield* Deferred.make<void>();
        const service = yield* make("unknown-callback", () =>
          Deferred.succeed(entered, undefined).pipe(
            Effect.andThen(Effect.never),
          ),
        );
        yield* service.create(createOptions);
        const build = yield* service
          .rebuild({ buildId: 1, epoch: 1 })
          .pipe(Effect.result, Effect.forkScoped);
        yield* Deferred.await(entered);
        expect(
          Result.isFailure(yield* service.cancel(1).pipe(Effect.result)),
        ).toBe(true);
        expect(Result.isFailure(yield* Fiber.join(build))).toBe(true);
      }),
    );
  });

  it.live(
    "bounds stderr and closes on scope release without explicit dispose",
    () => {
      return Effect.gen(function* () {
        const diagnostics = yield* Effect.scoped(
          Effect.gen(function* () {
            const service = yield* make("stderr");
            yield* service.create(createOptions);
            return service.diagnostics;
          }),
        );
        expect(diagnostics().closed).toBe(true);
        expect(Buffer.byteLength(diagnostics().stderr)).toBeLessThanOrEqual(
          16_384,
        );
      });
    },
  );

  it.live.each(["dispose-timeout", "kill"])(
    "kills a peer that never acknowledges disposal (%s)",
    (mode) => {
      return Effect.scoped(
        Effect.gen(function* () {
          const service = yield* make(mode, undefined, 100);
          yield* service.create(createOptions);
          expect(
            Result.isFailure(yield* service.dispose().pipe(Effect.result)),
          ).toBe(true);
          expect(service.diagnostics().closed).toBe(true);
        }),
      );
    },
  );

  it.live(
    "rejects duplicate context creation and stale build epochs locally",
    () => {
      return Effect.scoped(
        Effect.gen(function* () {
          const service = yield* make("capture");
          yield* service.create(createOptions);
          expect(
            Result.isFailure(
              yield* service.create(createOptions).pipe(Effect.result),
            ),
          ).toBe(true);
          yield* service.rebuild({ buildId: 1, epoch: 2 });
          expect(
            Result.isFailure(
              yield* service
                .rebuild({ buildId: 2, epoch: 2 })
                .pipe(Effect.result),
            ),
          ).toBe(true);
          expect(
            Result.isFailure(
              yield* service
                .rebuild({ buildId: 1, epoch: 3 })
                .pipe(Effect.result),
            ),
          ).toBe(true);
          expect(
            (yield* service.rebuild({ buildId: 2, epoch: 3 })).status,
          ).toBe("Succeeded");
        }),
      );
    },
  );
});
