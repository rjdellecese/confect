import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { FunctionImpl, GroupImpl } from "../_generated/server";
import { DatabaseWriter, DocumentIds, QueryCtx } from "../_generated/services";
import transactionNotes from "../_generated/tables/transactionNotes";
import documentIds from "./documentIds.spec";

const inspect = ({
  table,
  input,
}: {
  table: "transactionNotes" | "_storage" | "_scheduled_functions";
  input: string;
}) =>
  Effect.gen(function* () {
    const ids = yield* DocumentIds;
    const parsed = yield* ids.parse(table, input);
    const identified = yield* ids.identify(input);
    return {
      parsed: Option.getOrNull(parsed),
      identified: Option.getOrNull(identified),
    };
  });

const createAndDelete = FunctionImpl.make(documentIds, "createAndDelete", () =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    const table = writer.table(transactionNotes);
    const id = yield* table.insert({
      caseId: "document-id-inspection",
      value: "deleted",
    });
    yield* table.delete(id);
    return id;
  }).pipe(Effect.orDie),
);

export default GroupImpl.make(documentIds).pipe(
  Layer.provide(
    FunctionImpl.make(documentIds, "nativeSampleId", ({ table, input }) =>
      Effect.gen(function* () {
        const { db } = yield* QueryCtx;
        return table === "transactionNotes"
          ? db.normalizeId(table, input)
          : db.system.normalizeId(table, input);
      }),
    ),
  ),
  Layer.provide(FunctionImpl.make(documentIds, "inspect", inspect)),
  Layer.provide(FunctionImpl.make(documentIds, "inspectFromMutation", inspect)),
  Layer.provide(createAndDelete),
  GroupImpl.finalize,
);
