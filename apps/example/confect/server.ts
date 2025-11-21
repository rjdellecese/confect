import {
  ConfectApi,
  ConfectApiBuilder,
  ConfectApiFunction,
  ConfectApiGroup,
  ConfectApiServer,
  ConfectApiSpec,
} from "@rjdellecese/confect/api";
import {
  ConfectDatabaseReader,
  ConfectDatabaseWriter,
  GenericId,
} from "@rjdellecese/confect/server";
import { Effect, Layer, Schema } from "effect";
import schema from "./schema";

const NotesGroup = ConfectApiGroup.make("notes")
  .addFunction(
    ConfectApiFunction.mutation({
      name: "insert",
      args: Schema.Struct({ text: Schema.String }),
      returns: GenericId.GenericId("notes"),
    })
  )
  .addFunction(
    ConfectApiFunction.query({
      name: "list",
      args: Schema.Struct({}),
      returns: Schema.Array(GenericId.GenericId("notes")),
    })
  )
  .addFunction(
    ConfectApiFunction.mutation({
      name: "delete_",
      args: Schema.Struct({ noteId: GenericId.GenericId("notes") }),
      returns: Schema.Null,
    })
  )
  .addFunction(
    ConfectApiFunction.query({
      name: "getFirst",
      args: Schema.Struct({}),
      returns: Schema.Option(GenericId.GenericId("notes")),
    })
  );

const RandomGroup = ConfectApiGroup.make("random").addFunction(
  ConfectApiFunction.action({
    name: "getNumber",
    args: Schema.Struct({}),
    returns: Schema.Number,
  })
);

const Spec = ConfectApiSpec.make("api").add(NotesGroup).add(RandomGroup);

const Api = ConfectApi.make(schema, Spec);

const NotesGroupLive = ConfectApiBuilder.group(Api, "notes", (handlers) =>
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

const RandomGroupLive = ConfectApiBuilder.group(Api, "random", (handlers) =>
  handlers.handle("getNumber", () =>
    Effect.succeed(Math.random()).pipe(Effect.orDie)
  )
);

const ApiLive = ConfectApiBuilder.api(Api).pipe(
  Layer.provide(NotesGroupLive),
  Layer.provide(RandomGroupLive)
);

const server = ConfectApiServer.make.pipe(
  Effect.provide(ApiLive),
  Effect.runSync
);

export default server;
