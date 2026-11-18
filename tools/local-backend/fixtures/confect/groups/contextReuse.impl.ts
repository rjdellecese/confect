import { GroupImpl } from "@confect/server";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { FunctionImpl } from "../_generated/server";
import {
  Auth,
  DatabaseReader,
  DatabaseWriter,
  ExecutionMetadata,
} from "../_generated/services";
import transactionNotesTable from "../_generated/tables/transactionNotes";
import contextReuse from "./contextReuse.spec";

const previousInvocations = new Map<
  string,
  { readonly subject: string | null; readonly nonce: number }
>();

const observeInvocation = Effect.fn("contextReuse.observeInvocation")(
  function* (nonce: number) {
    const auth = yield* Auth;
    const subject = yield* auth.getUserIdentity.pipe(
      Effect.map((identity) => identity.subject),
      Effect.catchTag("NoUserIdentityFoundError", () => Effect.succeed(null)),
    );
    const metadata = yield* ExecutionMetadata;
    const { type: functionType } = yield* metadata.getFunction();
    const previousInvocation = previousInvocations.get(functionType) ?? null;
    previousInvocations.set(functionType, { subject, nonce });
    return { subject, previousInvocation, functionType };
  },
);

const read = FunctionImpl.make(contextReuse, "read", ({ caseId, nonce }) =>
  Effect.gen(function* () {
    const observation = yield* observeInvocation(nonce);
    const reader = yield* DatabaseReader;
    const notes = yield* reader
      .table(transactionNotesTable)
      .index("by_caseId", (q) => q.eq("caseId", caseId))
      .collect();
    return { ...observation, values: Array.map(notes, (note) => note.value) };
  }).pipe(Effect.orDie),
);

const write = FunctionImpl.make(
  contextReuse,
  "write",
  ({ caseId, nonce, value }) =>
    Effect.gen(function* () {
      const observation = yield* observeInvocation(nonce);
      const reader = yield* DatabaseReader;
      const writer = yield* DatabaseWriter;
      const notes = yield* reader
        .table(transactionNotesTable)
        .index("by_caseId", (q) => q.eq("caseId", caseId))
        .collect();
      for (const note of notes) {
        yield* writer.table(transactionNotesTable).delete(note._id);
      }
      yield* writer.table(transactionNotesTable).insert({ caseId, value });
      const after = yield* reader
        .table(transactionNotesTable)
        .index("by_caseId", (q) => q.eq("caseId", caseId))
        .collect();
      return {
        ...observation,
        previousValues: Array.map(notes, (note) => note.value),
        values: Array.map(after, (note) => note.value),
      };
    }).pipe(Effect.orDie),
);

export default GroupImpl.make(contextReuse).pipe(
  Layer.provide(read),
  Layer.provide(write),
  GroupImpl.finalize,
);
