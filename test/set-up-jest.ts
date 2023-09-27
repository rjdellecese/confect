import { beforeAll } from "@jest/globals";
import { execSync } from "child_process";
import { ConvexHttpClient } from "convex/browser";
import dotenv from "dotenv";
import { Config, Effect, pipe } from "effect";
import path from "path";

beforeAll(() => {
  execSync("pnpm exec convex dev --once");
});

declare global {
  // eslint-disable-next-line no-var
  var convexHttpClient: ConvexHttpClient;
}

global["convexHttpClient"] = pipe(
  Effect.sync(() =>
    dotenv.config({ path: path.resolve(process.cwd(), ".env.local") })
  ),
  Effect.flatMap(() => Effect.config(Config.string("CONVEX_URL"))),
  Effect.map((convexUrl) => new ConvexHttpClient(convexUrl)),
  Effect.runSync
);
