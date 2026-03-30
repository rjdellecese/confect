import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup,
} from "@effect/platform";
import { describe, it } from "@effect/vitest";
import { assertTrue } from "@effect/vitest/utils";
import { Effect } from "effect";
import * as HttpApi_ from "../src/HttpApi";

class TestApi extends HttpApi.make("TestApi").add(
  HttpApiGroup.make("health").add(
    HttpApiEndpoint.get("check", "/health"),
  ),
) {}

const TestApiLive = HttpApiBuilder.group(TestApi, "health", (handlers) =>
  handlers.handle("check", () => Effect.void),
);

describe("HttpApi", () => {
  it.effect("make creates a ConvexHttpRouter with routes", () =>
    Effect.gen(function* () {
      const router = HttpApi_.make({
        "/": {
          apiLive: TestApiLive as any,
        },
      });

      assertTrue(router !== undefined);
      assertTrue(typeof router.route === "function");
      assertTrue(typeof router.isRouter === "boolean");
    }),
  );

  it.effect(
    "make creates a ConvexHttpRouter with custom path prefix",
    () =>
      Effect.gen(function* () {
        const router = HttpApi_.make({
          "/api/": {
            apiLive: TestApiLive as any,
          },
        });

        assertTrue(router !== undefined);
      }),
  );

  it.effect("make with middleware option", () =>
    Effect.gen(function* () {
      const router = HttpApi_.make({
        "/": {
          apiLive: TestApiLive as any,
          middleware: (httpApp) => httpApp as any,
        },
      });

      assertTrue(router !== undefined);
    }),
  );

  it.effect("make with scalar option", () =>
    Effect.gen(function* () {
      const router = HttpApi_.make({
        "/": {
          apiLive: TestApiLive as any,
          scalar: { theme: "purple" as any },
        },
      });

      assertTrue(router !== undefined);
    }),
  );

  it.effect("make with empty httpApis creates an empty router", () =>
    Effect.gen(function* () {
      const router = HttpApi_.make({});
      assertTrue(router !== undefined);
    }),
  );

  it.effect(
    "monkey-patched URL returns empty string for username and password",
    () =>
      Effect.gen(function* () {
        HttpApi_.make({});
        const url = new URL("https://user:pass@example.com");
        assertTrue(url.username === "");
        assertTrue(url.password === "");
      }),
  );

});
