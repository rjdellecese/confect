export const consumerFiles = (
  profile: "react" | "foldkit",
): Readonly<Record<string, string>> => ({
  "tsconfig.json": `${JSON.stringify(
    {
      compilerOptions: {
        target: "ESNext",
        module: "ESNext",
        moduleResolution: "Bundler",
        lib: ["ESNext", "DOM"],
        strict: true,
        exactOptionalPropertyTypes: true,
        noUncheckedIndexedAccess: true,
        skipLibCheck: false,
        noEmit: true,
        types: profile === "react" ? ["node", "react"] : ["node"],
        ...(profile === "react" ? { jsx: "react-jsx" } : {}),
      },
      include: ["**/*.ts", "**/*.tsx"],
      exclude: ["node_modules"],
    },
    null,
    2,
  )}\n`,
  "convex.json": '{ "functions": "convex/" }\n',
  "convex/convex.config.ts": `import { defineApp } from "convex/server";
export default defineApp();
`,
  "confect/probes.ts": `export const schemaBuilds = { table: 0, args: 0, returns: 0 };
`,
  "confect/tables/notes.ts": `import { Table } from "@confect/core";
import * as Schema from "effect/Schema";
import { Id } from "../_generated/id";
import { schemaBuilds } from "../probes";

export default Table.make(() => {
  schemaBuilds.table += 1;
  return Schema.Struct({
    text: Schema.String,
    parent: Schema.optionalKey(Id("notes")),
  });
});
`,
  "confect/notes.spec.ts": `import { FunctionSpec, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";
import { schemaBuilds } from "./probes";

export default GroupSpec.make().addFunction(FunctionSpec.publicQuery({
  name: "count",
  args: () => {
    schemaBuilds.args += 1;
    return { count: Schema.FiniteFromString };
  },
  returns: () => {
    schemaBuilds.returns += 1;
    return Schema.FiniteFromString;
  },
}));
`,
  "confect/notes.impl.ts": `import { FunctionImpl, GroupImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import databaseSchema from "./_generated/schema";
import { Auth } from "./_generated/services";
import notes from "./notes.spec";

export const count = Effect.fn("notes.count")(function* (args: { readonly count: number }) {
  const auth = yield* Auth;
  const identity = yield* auth.getUserIdentity.pipe(Effect.orDie);
  return args.count + identity.subject.length;
});

const countImpl = FunctionImpl.make(databaseSchema, notes, "count", count);
export default GroupImpl.make(databaseSchema, notes).pipe(
  Layer.provide(countImpl),
  GroupImpl.finalize,
);
`,
  "consumer.ts": `import type { Ref } from "@confect/core";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import refs from "./confect/_generated/refs";
import type { NotesDoc } from "./confect/_generated/docs";
import { Id } from "./confect/_generated/id";
import { DatabaseReader } from "./confect/_generated/services";

export const args: Ref.Args<typeof refs.public.notes.count> = { count: 41 };
export const result: Ref.Returns<typeof refs.public.notes.count> = 42;
export const noteId: Id<"notes"> = Schema.decodeUnknownSync(Id("notes"))("consumer-note");
export const readNotes: () => Effect.Effect<ReadonlyArray<NotesDoc>, never, DatabaseReader> =
  Effect.fn("consumer.readNotes")(function* () {
    const reader = yield* DatabaseReader;
    return yield* reader.table("notes").index("by_creation_time").collect().pipe(Effect.orDie);
  });

// @ts-expect-error The consumer passes decoded numbers, not encoded strings.
export const encodedArgsAreNotDecodedArgs: Ref.Args<typeof refs.public.notes.count> = { count: "41" };
`,
  "smoke.ts": `import assert from "node:assert/strict";
import { Ref } from "@confect/core";
import { FunctionRegistryItem, GroupImpl, Registry, type RegistryItems } from "@confect/server";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as MutableRef from "effect/Ref";
import refs from "./confect/_generated/refs";
import { Auth } from "./confect/_generated/services";
import notes from "./confect/_generated/tables/notes";
import notesImpl, { count } from "./confect/notes.impl";
import { schemaBuilds } from "./confect/probes";

assert.deepEqual(schemaBuilds, { table: 0, args: 0, returns: 0 });

let acquired = 0;
let released = 0;
const authLayer = Layer.effect(Auth, Effect.acquireRelease(
  Effect.sync(() => {
    acquired += 1;
    return Auth.of({ getUserIdentity: Effect.succeed({
      subject: "x", issuer: "consumer", tokenIdentifier: "consumer|x",
    }) });
  }),
  () => Effect.sync(() => { released += 1; }),
));

await Effect.runPromise(Effect.gen(function* () {
  const registry = yield* MutableRef.make<RegistryItems.RegistryItems>({});
  const context = yield* Layer.build(notesImpl).pipe(Effect.provideService(Registry.Registry, registry));
  const group = Context.get(context, GroupImpl.GroupImpl({ finalizationStatus: "Finalized" }));
  assert.deepEqual(group.registeredFunctionNames, ["count"]);
  const items = yield* MutableRef.get(registry);
  assert(FunctionRegistryItem.isFunctionRegistryItem(items.count));
  assert.equal(items.count.handler, count);
  assert.deepEqual(schemaBuilds, { table: 0, args: 0, returns: 0 });
  assert.equal(yield* count({ count: 41 }).pipe(Effect.provide(authLayer)), 42);
}).pipe(Effect.scoped));
assert.equal(acquired, 1);
assert.equal(released, 1);

assert.equal(Ref.hasErrorSchema(refs.public.notes.count), false);
assert.deepEqual(Ref.encodeArgsSync(refs.public.notes.count, { count: 41 }), { count: "41" });
assert.deepEqual(Ref.decodeArgsSync(refs.public.notes.count, { count: "41" }), { count: 41 });
assert.equal(Ref.decodeReturnsSync(refs.public.notes.count, "42"), 42);
assert.deepEqual(schemaBuilds, { table: 0, args: 1, returns: 1 });
assert.throws(() => Ref.decodeReturnsSync(refs.public.notes.count, "not-a-number"));
assert.equal(notes.Doc, notes.Doc);
assert.equal(schemaBuilds.table, 1);
assert.equal(await Effect.runPromise(Ref.runWithCodec(refs.public.notes.count, { count: 41 }, (_ref, args) => {
  assert.deepEqual(args, { count: "41" });
  return Promise.resolve("42");
})), 42);
console.log("Installed consumer smoke passed");
`,
  ...(profile === "react"
    ? {
        "client.tsx": `import { useQuery } from "@confect/react";
import type * as QueryResult from "@confect/react/QueryResult";
import refs from "./confect/_generated/refs";

export function useCount(count: number): QueryResult.QueryResult<number> {
  return useQuery(refs.public.notes.count, { count });
}

export function Count() {
  const result = useCount(41);
  return <output>{result._tag === "Success" ? result.value.toFixed() : "Loading"}</output>;
}
`,
      }
    : {
        "client.ts": `import { Client, Command } from "@confect/foldkit";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { defineMessageUnion } from "foldkit/message";
import refs from "./confect/_generated/refs";

export const Message = defineMessageUnion({
  SucceededCount: { count: Schema.Number },
  FailedCount: { error: Schema.Unknown },
});
export type Message = typeof Message.Type;

export const FetchCount = Command.query("FetchCount", refs.public.notes.count, {
  messages: [Message.SucceededCount, Message.FailedCount],
  onSuccess: (count) => Message.SucceededCount({ count }),
  onError: (error) => Message.FailedCount({ error }),
});

export const command: Effect.Effect<Message, never, Client.Client> = FetchCount({ count: 41 }).effect;
`,
      }),
});
