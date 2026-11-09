import * as Layer from "effect/Layer";
import { Ref } from "@confect/core";
import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpClient from "effect/http/HttpClient";
import refs from "confect-local-backend/refs";
import * as LocalBackend from "confect-local-backend/LocalBackend";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as ChildProcess from "effect/process/ChildProcess";
import { ChildProcessSpawner } from "effect/process/ChildProcessSpawner";

const invokeAs = Effect.fn("metadata.invokeAs")(function* <
  R extends Ref.AnyPublicQuery | Ref.AnyPublicMutation,
>(subject: string | null, ref: R, args: Ref.Args<R>) {
  const spawner = yield* ChildProcessSpawner;
  const path = yield* Path.Path;
  const encodedArgs = yield* Ref.encodeArgs(ref, args);
  const argsJson = yield* Schema.encodeEffect(
    Schema.fromJsonString(Schema.Unknown),
  )(encodedArgs);
  const identityJson = yield* Schema.encodeEffect(
    Schema.fromJsonString(
      Schema.Struct({ subject: Schema.NullOr(Schema.String) }),
    ),
  )({ subject });
  const output = yield* spawner.string(
    ChildProcess.make(
      "pnpm",
      [
        "convex",
        "run",
        Ref.getConvexFunctionName(ref),
        argsJson,
        ...(subject === null ? [] : ["--identity", identityJson]),
      ],
      {
        cwd: path.resolve(
          import.meta.dirname,
          "../../../../tools/local-backend/fixtures",
        ),
        extendEnv: true,
        env: { CONVEX_AGENT_MODE: "anonymous" },
      },
    ),
  );
  const result = yield* Schema.decodeEffect(
    Schema.fromJsonString(Schema.Unknown),
  )(output);
  return yield* Ref.decodeReturns(ref, result);
});

const contextMetadataLayer = Layer.merge(
  LocalBackend.layer,
  NodeServices.layer,
);

layer(contextMetadataLayer, { timeout: "120 seconds" })(
  "context metadata",
  (it) => {
    it.effect(
      "keeps auth and transactions invocation-local in reused V8 contexts",
      () =>
        Effect.gen(function* () {
          const { client } = yield* LocalBackend.LocalBackend;
          const functions = refs.public.groups.contextReuse;
          const caseId = "context-reuse";
          yield* Ref.runWithCodec(
            refs.public.groups.transactions.seed,
            { caseId, count: 0 },
            (ref, args) => client.mutation(ref, args),
          );
          const subjects = ["alice", "bob", null] as const;
          const warmQuerySubjects = new Set<string | null>();
          const warmMutationSubjects = new Set<string | null>();
          const calls = new Map<number, string | null>();
          let previousValues: readonly string[] = [];

          for (let nonce = 0; nonce < 18; nonce++) {
            const subject = subjects[nonce % subjects.length] ?? null;
            const value = `${subject ?? "anonymous"}-${nonce}`;
            const mutation = yield* invokeAs(subject, functions.write, {
              caseId,
              nonce,
              value,
            });
            expect(mutation.subject).toBe(subject);
            expect(mutation.functionType).toBe("mutation");
            expect(mutation.previousValues).toEqual(previousValues);
            expect(mutation.values).toEqual([value]);

            const query = yield* invokeAs(subject, functions.read, {
              caseId,
              nonce,
            });
            expect(query.subject).toBe(subject);
            expect(query.functionType).toBe("query");
            expect(query.values).toEqual([value]);

            for (const [result, warmSubjects] of [
              [mutation, warmMutationSubjects],
              [query, warmQuerySubjects],
            ] as const) {
              const previous = result.previousInvocation;
              if (previous !== null && calls.has(previous.nonce)) {
                expect(previous.subject).toBe(calls.get(previous.nonce));
                if (previous.subject !== subject) warmSubjects.add(subject);
              }
            }
            calls.set(nonce, subject);
            previousValues = [value];
            if (warmQuerySubjects.size === 3 && warmMutationSubjects.size === 3)
              break;
          }

          expect(warmQuerySubjects).toEqual(new Set(subjects));
          expect(warmMutationSubjects).toEqual(new Set(subjects));
        }),
      120_000,
    );

    it.effect("provides execution metadata and metrics in queries", () =>
      Effect.gen(function* () {
        const { client } = yield* LocalBackend.LocalBackend;
        const metadata = yield* Ref.runWithCodec(
          refs.public.groups.metadata.queryMetadata,
          {},
          (ref, args) => client.query(ref, args),
        );

        expect(metadata.functionName).toBe("groups/metadata:queryMetadata");
        expect(metadata.functionType).toBe("query");
        expect(metadata.deploymentName).not.toBe("");
        expect(metadata.remainingReads).toBeGreaterThan(0);
        expect(typeof metadata.snapshotTs).toBe("bigint");
        expect(metadata.snapshotTs).toBeGreaterThan(0n);
        expect(metadata.repeatedSnapshotTs).toBe(metadata.snapshotTs);
      }),
    );

    it.effect("provides all three services in mutations", () =>
      Effect.gen(function* () {
        const { client } = yield* LocalBackend.LocalBackend;
        const metadata = yield* Ref.runWithCodec(
          refs.public.groups.metadata.mutationMetadata,
          {},
          (ref, args) => client.mutation(ref, args),
        );

        expect(metadata.functionName).toBe("groups/metadata:mutationMetadata");
        expect(metadata.functionType).toBe("mutation");
        expect(metadata.deploymentName).not.toBe("");
        expect(metadata.requestId).not.toBe("");
        expect(metadata.remainingWrites).toBeGreaterThan(0);
        expect(typeof metadata.snapshotTs).toBe("bigint");
        expect(metadata.snapshotTs).toBeGreaterThan(0n);
        expect(metadata.repeatedSnapshotTs).toBe(metadata.snapshotTs);
        expect(metadata.nestedQueryTs).toBe(metadata.snapshotTs);
        expect(metadata.nestedMutationTs).toBe(metadata.snapshotTs);
        expect(metadata.nestedMutationAfterWriteTs).toBe(metadata.snapshotTs);
        expect(metadata.staleQueryTs).toBeLessThanOrEqual(metadata.snapshotTs);
      }),
    );

    it.effect("binds action metadata to each invocation", () =>
      Effect.gen(function* () {
        const { client } = yield* LocalBackend.LocalBackend;
        const invoke = Ref.runWithCodec(
          refs.public.groups.metadata.actionMetadata,
          {},
          (ref, args) => client.action(ref, args),
        );
        const first = yield* invoke;
        const second = yield* invoke;

        expect(first.functionName).toBe("groups/metadata:actionMetadata");
        expect(first.functionType).toBe("action");
        expect(first.deploymentName).not.toBe("");
        expect(first.requestId).not.toBe("");
        expect(first.requestId).not.toBe(second.requestId);
      }),
    );

    it.effect("provides metadata in Node actions", () =>
      Effect.gen(function* () {
        const { client } = yield* LocalBackend.LocalBackend;
        const metadata = yield* Ref.runWithCodec(
          refs.public.metadataNode.metadata,
          {},
          (ref, args) => client.action(ref, args),
        );

        expect(metadata.functionName).toBe("metadataNode:metadata");
        expect(metadata.functionType).toBe("action");
        expect(metadata.deploymentName).not.toBe("");
        expect(metadata.requestId).not.toBe("");
      }),
    );

    it.effect("provides metadata in HTTP handlers", () =>
      Effect.gen(function* () {
        const services = yield* Layer.build(FetchHttpClient.layer);
        return yield* Effect.gen(function* () {
          yield* LocalBackend.LocalBackend;
          const response = yield* HttpClient.get(
            "http://127.0.0.1:3211/context-metadata",
          );

          expect(response.status).toBe(200);
          const jsonResult = yield* response.json;
          expect(jsonResult).toEqual({
            functionName: expect.any(String),
            deploymentName: expect.any(String),
            requestId: expect.any(String),
          });
        }).pipe(Effect.provideContext(services));
      }).pipe(Effect.scoped),
    );
  },
);
