import { ConfectApiBuilder } from "@rjdellecese/confect/api";
import {
  ConfectDatabaseReader,
  ConfectDatabaseWriter,
} from "@rjdellecese/confect/server";
import { Effect } from "effect";
import api from "../api";

export default ConfectApiBuilder.group(api, "notes", (handlers) =>
  handlers
    .handle("insert", ({ text }) =>
      Effect.gen(function* () {
        const writer =
          yield* ConfectDatabaseWriter.ConfectDatabaseWriter<any>();

        return yield* writer.insert("notes", { text });
      }).pipe(Effect.orDie)
    )
    .handle("list", () =>
      Effect.gen(function* () {
        const reader =
          yield* ConfectDatabaseReader.ConfectDatabaseReader<any>();

        return yield* reader
          .table("notes")
          .index("by_creation_time", "desc")
          .collect();
      }).pipe(Effect.orDie)
    )
    .handle("delete_", ({ noteId }) =>
      Effect.gen(function* () {
        const writer =
          yield* ConfectDatabaseWriter.ConfectDatabaseWriter<any>();

        yield* writer.delete("notes", noteId);

        return null;
      }).pipe(Effect.orDie)
    )
    .handle("getFirst", () =>
      Effect.gen(function* () {
        const reader =
          yield* ConfectDatabaseReader.ConfectDatabaseReader<any>();

        return yield* reader.table("notes").index("by_creation_time").first();
      }).pipe(Effect.orDie)
    )
);
