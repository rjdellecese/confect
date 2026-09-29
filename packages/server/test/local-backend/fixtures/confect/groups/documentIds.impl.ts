import { FunctionImpl, GroupImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import databaseSchema from "../_generated/schema";
import { DatabaseWriter, DocumentIds } from "../_generated/services";
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
    return {
      parsed: Option.getOrNull(yield* ids.parse(table, input)),
      normalized: Option.getOrNull(yield* ids.normalize(table, input)),
      identified: Option.getOrNull(yield* ids.identify(input)),
    };
  });

const createAndDelete = FunctionImpl.make(
  databaseSchema,
  documentIds,
  "createAndDelete",
  () =>
    Effect.gen(function* () {
      const writer = yield* DatabaseWriter;
      const table = writer.table("transactionNotes");
      const id = yield* table.insert({
        caseId: "document-id-inspection",
        value: "deleted",
      });
      yield* table.delete(id);
      return id;
    }).pipe(Effect.orDie),
);

export default GroupImpl.make(databaseSchema, documentIds).pipe(
  Layer.provide(
    FunctionImpl.make(databaseSchema, documentIds, "inspect", inspect),
  ),
  Layer.provide(
    FunctionImpl.make(
      databaseSchema,
      documentIds,
      "inspectFromMutation",
      inspect,
    ),
  ),
  Layer.provide(createAndDelete),
  GroupImpl.finalize,
);
