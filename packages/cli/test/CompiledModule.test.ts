import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Ref from "effect/Ref";
import * as CompiledModule from "@confect/cli/CompiledModule";
import type { Receipt } from "@confect/cli/CompilationState";

it.effect("consumes a backend-neutral origin-only projection", () =>
  Effect.gen(function* () {
    const origin = { context: 1, revision: 2, roots: ["native"] };
    const recorded = yield* Ref.make<ReadonlyArray<Receipt>>([]);
    yield* CompiledModule.consume({ origin }).pipe(
      Effect.provideService(CompiledModule.Consumption, {
        record: (receipt) =>
          Ref.update(recorded, (current) => [...current, receipt]),
      }),
    );
    yield* CompiledModule.consume({});
    expect(yield* Ref.get(recorded)).toEqual([origin]);
  }),
);

it.effect.each(["export default 42", 'throw new Error("failed evaluation")'])(
  "records attempted consumption after loading %s",
  (source) =>
    Effect.gen(function* () {
      const origin = { context: 1, revision: 2, roots: ["entry"] };
      const recorded = yield* Ref.make<ReadonlyArray<Receipt>>([]);
      const result = yield* CompiledModule.load({
        url: `data:text/javascript,${encodeURIComponent(source)}`,
        metafile: { inputs: {}, outputs: {} },
        warnings: [],
        origin,
      }).pipe(
        Effect.provideService(CompiledModule.Consumption, {
          record: (receipt) =>
            Ref.update(recorded, (current) => [...current, receipt]),
        }),
        Effect.result,
      );
      expect(Result.isSuccess(result)).toBe(source.startsWith("export"));
      expect(yield* Ref.get(recorded)).toEqual([origin]);
    }),
);

it.effect(
  "explicitly consumes compile-only validation artifacts without evaluating them",
  () =>
    Effect.gen(function* () {
      const origin = { context: 1, revision: 2, roots: ["optional"] };
      const recorded = yield* Ref.make<ReadonlyArray<Receipt>>([]);
      yield* CompiledModule.consume({
        url: 'data:text/javascript,throw new Error("must not evaluate")',
        metafile: { inputs: {}, outputs: {} },
        warnings: [],
        origin,
      }).pipe(
        Effect.provideService(CompiledModule.Consumption, {
          record: (receipt) =>
            Ref.update(recorded, (current) => [...current, receipt]),
        }),
      );
      expect(yield* Ref.get(recorded)).toEqual([origin]);
    }),
);
