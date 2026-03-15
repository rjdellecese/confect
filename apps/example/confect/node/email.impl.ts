import { FunctionImpl, GroupImpl } from "@confect/server";
import { Command } from "@effect/platform";
import { Console, Duration, Effect, Layer } from "effect";
import nodeApi from "../_generated/nodeApi";

const send = FunctionImpl.make(
  nodeApi,
  "email",
  "send",
  Effect.fn(function* ({ to, subject, body }) {
    const result = yield* Command.make(
      "echo",
      `Sending email to ${to} with subject ${subject} and body ${body}…`,
    ).pipe(Command.stdout("pipe"), Command.string, Effect.orDie);

    yield* Console.log(result);

    yield* Effect.sleep(Duration.seconds(1));

    yield* Console.log("Email sent!");

    return null;
  }),
);

const getInbox = FunctionImpl.make(
  nodeApi,
  "email",
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

export const email = GroupImpl.make(nodeApi, "email").pipe(
  Layer.provide(send),
  Layer.provide(getInbox),
);
