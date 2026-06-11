import { FunctionImpl, GroupImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import databaseSchema from "../_generated/schema";
import refs from "../_generated/refs";
import {
  ActionRunner,
  MutationRunner,
  QueryRunner,
} from "../_generated/services";
import runners from "./runners.spec";

const insertNoteViaRunner = FunctionImpl.make(
  databaseSchema,
  runners,
  "insertNoteViaRunner",
  ({ text }) =>
    Effect.gen(function* () {
      const runMutation = yield* MutationRunner;
      return yield* runMutation(refs.public.groups.notes.insert, { text });
    }).pipe(Effect.orDie),
);

const getNumberViaRunner = FunctionImpl.make(
  databaseSchema,
  runners,
  "getNumberViaRunner",
  () =>
    Effect.gen(function* () {
      const runAction = yield* ActionRunner;
      return yield* runAction(refs.public.groups.random.getNumber, {});
    }).pipe(Effect.orDie),
);

const countNotesViaRunner = FunctionImpl.make(
  databaseSchema,
  runners,
  "countNotesViaRunner",
  () =>
    Effect.gen(function* () {
      const runQuery = yield* QueryRunner;
      const notes = yield* runQuery(refs.public.groups.notes.list, {});
      return notes.length;
    }).pipe(Effect.orDie),
);

export default GroupImpl.make(databaseSchema, runners).pipe(
  Layer.provide(insertNoteViaRunner),
  Layer.provide(getNumberViaRunner),
  Layer.provide(countNotesViaRunner),
  GroupImpl.finalize,
);
