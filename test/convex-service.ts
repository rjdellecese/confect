/// <reference types="vite/client" />

import { TestConvex } from "convex-test";
import { convexTest } from "convex-test";
import { Context, Layer } from "effect";

import schema from "~/test/convex/schema";

// TODO: Make an interface, Effect-ify
// TODO: Maybe just rename this to ConvexTestService

export type ConvexService = TestConvex<typeof schema>;

export const ConvexService = Context.GenericTag<ConvexService>(
  "@services/ConvexService"
);

export const ConvexServiceTest = Layer.succeed(
  ConvexService,
  convexTest(schema, import.meta.glob("./**/!(*.*.*)*.*s"))
);
