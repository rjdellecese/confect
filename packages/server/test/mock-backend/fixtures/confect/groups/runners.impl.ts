import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { FunctionImpl, GroupImpl } from "../_generated/server";
import refs from "../_generated/refs";
import {
  ActionRunner,
  MutationRunner,
  QueryRunner,
} from "../_generated/services";
import runnersSpec from "./runners.spec";

const insertNoteViaRunner = FunctionImpl.make(
  runnersSpec,
  "insertNoteViaRunner",
  ({ text }) =>
    Effect.gen(function* () {
      const { runMutation } = yield* MutationRunner;
      return yield* runMutation(refs.public.groups.notes.insert, { text });
    }).pipe(Effect.orDie),
);

const getNumberViaRunner = FunctionImpl.make(
  runnersSpec,
  "getNumberViaRunner",
  () =>
    Effect.gen(function* () {
      const { runAction } = yield* ActionRunner;
      return yield* runAction(refs.public.groups.random.getNumber, {});
    }).pipe(Effect.orDie),
);

const countNotesViaRunner = FunctionImpl.make(
  runnersSpec,
  "countNotesViaRunner",
  () =>
    Effect.gen(function* () {
      const { runQuery } = yield* QueryRunner;
      const notes = yield* runQuery(refs.public.groups.notes.list, {});
      return notes.length;
    }).pipe(Effect.orDie),
);

export default GroupImpl.make(runnersSpec).pipe(
  Layer.provide(insertNoteViaRunner),
  Layer.provide(getNumberViaRunner),
  Layer.provide(countNotesViaRunner),
  GroupImpl.finalize,
);
