import { Effect } from "effect";
import { httpAction } from "~/test/convex/confect";

export const get = httpAction(() =>
	Effect.succeed(new Response("Hello, world!", { status: 200 })),
);
