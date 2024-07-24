import { Effect } from "effect";
import { httpAction } from "../confect_functions";

export const get = httpAction(() => {
	return Effect.succeed(new Response("Hello, world!", { status: 200 }));
});
