import { FunctionImpl, GroupImpl } from "@confect/server";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import * as Console from "effect/Console";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import databaseSchema from "./_generated/schema";
import email from "./email.spec";

const send = FunctionImpl.make(
  databaseSchema,
  email,
  "send",
  Effect.fn(function* ({ to, subject, body }) {
    const spawner = yield* ChildProcessSpawner;
    const result = yield* spawner
      .string(
        ChildProcess.make("echo", [
          `Sending email to ${to} with subject ${subject} and body ${body}…`,
        ]),
      )
      .pipe(Effect.orDie);

    yield* Console.log(result);

    yield* Effect.sleep(Duration.seconds(1));

    yield* Console.log("Email sent!");

    return null;
  }),
);

const getInbox = FunctionImpl.make(
  databaseSchema,
  email,
  "getInbox",
  Effect.fn(function* () {
    yield* Console.log("Getting inbox…");

    yield* Effect.sleep(Duration.seconds(1));

    yield* Console.log("Inbox retrieved!");

    return [
      {
        to: "test@example.com",
        subject: "Test email",
        body: "Test email body",
      },
    ];
  }),
);

export default GroupImpl.make(databaseSchema, email).pipe(
  Layer.provide(send),
  Layer.provide(getInbox),
  GroupImpl.finalize,
);
