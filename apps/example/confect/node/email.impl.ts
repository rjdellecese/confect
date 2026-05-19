import { FunctionImpl, GroupImpl } from "@confect/server";
import { Console, Duration, Effect, Layer } from "effect";
import nodeApi from "../_generated/nodeApi";

// v3 invoked an `echo` subprocess via `@effect/platform`'s `Command.make` to
// demo shelling out from a Node action. The example's observable behavior is
// just a log line, so the Effect 4 example keeps that behavior inline.
const send = FunctionImpl.make(
  nodeApi,
  "email",
  "send",
  Effect.fn(function* ({ to, subject, body }) {
    yield* Console.log(
      `Sending email to ${to} with subject ${subject} and body ${body}…`,
    );

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
