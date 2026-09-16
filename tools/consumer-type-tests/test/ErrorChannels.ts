import type * as Command from "@confect/foldkit/Command";
import type * as HttpClient from "@confect/js/HttpClient";
import type * as WebSocketClient from "@confect/js/WebSocketClient";
import type * as React from "@confect/react";
import * as DatabaseSchema from "@confect/server/DatabaseSchema";
import * as FunctionImpl from "@confect/server/FunctionImpl";
import type * as Handler from "@confect/server/Handler";
import type * as QueryRunner from "@confect/server/QueryRunner";
import type * as TestConfect from "@confect/test/TestConfect";
import * as Effect from "effect/Effect";
import type * as Result from "effect/Result";
import type * as Schema from "effect/Schema";
import { expectTypeOf } from "vitest";
import type { AccessDenied, withError, withoutError } from "./fixtures";
import { authorizedRefs, group, refs } from "./fixtures";

const databaseSchema = DatabaseSchema.make({});
type NoErrorHandler = Handler.Handler<
  typeof databaseSchema,
  typeof withoutError
>;
type WithErrorHandler = Handler.Handler<
  typeof databaseSchema,
  typeof withError
>;

expectTypeOf<Effect.Error<ReturnType<NoErrorHandler>>>().toBeNever();
expectTypeOf<
  Effect.Error<ReturnType<WithErrorHandler>>
>().toEqualTypeOf<number>();
expectTypeOf<
  () => Effect.Effect<never, string>
>().not.toExtend<NoErrorHandler>();
expectTypeOf<
  () => Effect.Effect<never, string>
>().not.toExtend<WithErrorHandler>();

FunctionImpl.make(databaseSchema, group, "withoutError", () =>
  Effect.succeed("ok"),
);
FunctionImpl.make(databaseSchema, group, "withError", () => Effect.fail(123));

declare const runQuery: QueryRunner.QueryRunner;
declare const http: HttpClient.HttpClient;
declare const websocket: WebSocketClient.WebSocketClient;
declare const test: TestConfect.TestConfectWithoutIdentity<
  typeof databaseSchema
>;

const query = runQuery(refs.public.queries.withoutError);
const declaredQuery = runQuery(refs.public.queries.withError);
const authorizedQuery = runQuery(authorizedRefs.public.queries.withoutError);
expectTypeOf<Effect.Error<typeof query>>().toEqualTypeOf<Schema.SchemaError>();
expectTypeOf<Effect.Error<typeof declaredQuery>>().toEqualTypeOf<
  number | Schema.SchemaError
>();
expectTypeOf<Effect.Error<typeof authorizedQuery>>().toEqualTypeOf<
  AccessDenied | Schema.SchemaError
>();

const httpQuery = http.query(refs.public.queries.withoutError);
const httpDeclaredQuery = http.query(refs.public.queries.withError);
expectTypeOf<Effect.Error<typeof httpQuery>>().toEqualTypeOf<
  HttpClient.HttpClientError | Schema.SchemaError
>();
expectTypeOf<Effect.Error<typeof httpDeclaredQuery>>().toEqualTypeOf<
  number | HttpClient.HttpClientError | Schema.SchemaError
>();

const websocketQuery = websocket.query(refs.public.queries.withoutError);
const websocketDeclaredQuery = websocket.query(refs.public.queries.withError);
expectTypeOf<Effect.Error<typeof websocketQuery>>().toEqualTypeOf<
  WebSocketClient.WebSocketClientError | Schema.SchemaError
>();
expectTypeOf<Effect.Error<typeof websocketDeclaredQuery>>().toEqualTypeOf<
  number | WebSocketClient.WebSocketClientError | Schema.SchemaError
>();

const testQuery = test.query(refs.public.queries.withoutError);
const testDeclaredQuery = test.query(refs.public.queries.withError);
expectTypeOf<
  Effect.Error<typeof testQuery>
>().toEqualTypeOf<Schema.SchemaError>();
expectTypeOf<Effect.Error<typeof testDeclaredQuery>>().toEqualTypeOf<
  number | Schema.SchemaError
>();

expectTypeOf<
  React.InvokeReturn<typeof refs.public.queries.withoutError>
>().toEqualTypeOf<Promise<string>>();
expectTypeOf<
  React.InvokeReturn<typeof refs.public.queries.withError>
>().toEqualTypeOf<Promise<Result.Result<string, number>>>();
expectTypeOf<
  Command.Error<typeof refs.public.queries.withoutError>
>().toEqualTypeOf<WebSocketClient.WebSocketClientError | Schema.SchemaError>();
expectTypeOf<
  Command.Error<typeof refs.public.queries.withError>
>().toEqualTypeOf<
  number | WebSocketClient.WebSocketClientError | Schema.SchemaError
>();
