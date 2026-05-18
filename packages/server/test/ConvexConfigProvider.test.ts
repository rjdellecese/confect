import { Config, Effect } from "effect";
import type { ConfigProvider, Option } from "effect";
import { defineApp, defineComponent } from "convex/server";
import { v } from "convex/values";
import { describe, expect, expectTypeOf, test } from "vitest";

import * as ConvexConfigProvider from "../src/ConvexConfigProvider";

describe("ConvexConfigProvider", () => {
  test("reads from an explicit env snapshot", async () => {
    const provider = ConvexConfigProvider.make({
      env: { API_KEY: "secret" },
    });

    const value = await Effect.runPromise(
      Config.string("API_KEY").parse(provider),
    );

    expect(value).toBe("secret");
  });

  test("provides key-safe config helpers for defineApp env definitions", () => {
    const _app = defineApp({
      env: {
        API_KEY: v.string(),
        MODE: v.union(v.literal("dev"), v.literal("prod")),
        OPTIONAL: v.optional(v.string()),
      },
    });

    const env = ConvexConfigProvider.fromApp<typeof _app>();

    expectTypeOf(env.string)
      .parameter(0)
      .toEqualTypeOf<"API_KEY" | "MODE" | "OPTIONAL">();
    expectTypeOf(env.string("API_KEY")).toEqualTypeOf<Config.Config<string>>();
    expectTypeOf(env.string("MODE")).toEqualTypeOf<
      Config.Config<"dev" | "prod">
    >();
    expectTypeOf(env.option).parameter(0).toEqualTypeOf<"OPTIONAL">();
    expectTypeOf(env.option("OPTIONAL")).toEqualTypeOf<
      Config.Config<Option.Option<string>>
    >();
  });

  test("provides key-safe config helpers for defineComponent env definitions", () => {
    const _component = defineComponent("search", {
      env: {
        INDEX_NAME: v.string(),
      },
    });

    const env = ConvexConfigProvider.fromComponent<typeof _component>();

    expectTypeOf(env.string).parameter(0).toEqualTypeOf<"INDEX_NAME">();
    expectTypeOf(env.string("INDEX_NAME")).toEqualTypeOf<
      Config.Config<string>
    >();
  });

  test("provides key-safe config helpers for local env shapes", () => {
    const env = ConvexConfigProvider.fromEnv<{
      API_KEY: string;
      OPTIONAL?: string;
    }>();

    expectTypeOf(env.string)
      .parameter(0)
      .toEqualTypeOf<"API_KEY" | "OPTIONAL">();
    expectTypeOf(env.string("API_KEY")).toEqualTypeOf<Config.Config<string>>();
    expectTypeOf(env.option).parameter(0).toEqualTypeOf<"OPTIONAL">();
  });

  test("keeps default ConfigProvider.fromEnv behavior available", () => {
    expectTypeOf(
      ConvexConfigProvider.make(),
    ).toEqualTypeOf<ConfigProvider.ConfigProvider>();
  });
});
