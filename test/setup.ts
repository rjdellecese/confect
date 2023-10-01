import { execSync } from "child_process";
import { ConvexHttpClient } from "convex/browser";
import dotenv from "dotenv";
import { Config, Effect, pipe } from "effect";
import path from "path";
import { afterEach, beforeAll } from "vitest";

import { api } from "./convex/_generated/api";

beforeAll(() => {
  execSync("pnpm exec convex dev --once", { stdio: "pipe" });
});

afterEach(async () => {
  await global.convexHttpClient.mutation(api.clearDatabase.default);
});

declare global {
  // eslint-disable-next-line no-var
  var convexHttpClient: ConvexHttpClient;
}

if (!global.convexHttpClient) {
  global["convexHttpClient"] = pipe(
    Effect.sync(() =>
      dotenv.config({ path: path.resolve(process.cwd(), ".env.local") })
    ),
    Effect.flatMap(() => Effect.config(Config.string("CONVEX_URL"))),
    Effect.map((convexUrl) => new ConvexHttpClient(convexUrl)),
    Effect.runSync
  );
}
