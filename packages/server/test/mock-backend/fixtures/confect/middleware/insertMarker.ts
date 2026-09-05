import * as Effect from "effect/Effect";
import { DatabaseWriter } from "../_generated/services";

/**
 * Shared by the marker middlewares below, which record the order the chain runs
 * in by appending to the `notes` table. Server-only, and imported only by
 * `*.impl.ts` modules — a `*.spec.ts` may not reach it.
 */
export const insertMarker = Effect.fnUntraced(function* (text: string) {
  const writer = yield* DatabaseWriter;

  yield* writer.table("notes").insert({ text });
}, Effect.orDie);
