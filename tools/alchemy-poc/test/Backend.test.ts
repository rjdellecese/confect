import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as Backend from "../src/Backend";

it.effect(
  "registers the actual Alchemy provider without resolving deployment credentials",
  () =>
    Layer.build(Backend.providers).pipe(
      Effect.asVoid,
      Effect.scoped,
      Effect.provide(Layer.mergeAll(NodeServices.layer, FetchHttpClient.layer)),
    ),
);

it.effect(
  "always requests an update so source-only edits and secret rotation cannot be skipped",
  () =>
    Effect.gen(function* () {
      expect(yield* Backend.lifecycle.diff()).toEqual({ action: "update" });
      expect(yield* Backend.lifecycle.diff()).toEqual({ action: "update" });
    }),
);

it.effect("does not delete or enumerate the existing database", () =>
  Effect.gen(function* () {
    expect(yield* Backend.lifecycle.list()).toEqual([]);
    expect(yield* Backend.lifecycle.delete()).toBeUndefined();
  }),
);
