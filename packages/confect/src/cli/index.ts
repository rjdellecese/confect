#!/usr/bin/env node

import { Command, Options } from "@effect/cli";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { Console, Effect } from "effect";
import packageJson from "../../package.json" with { type: "json" };

// Define a simple dummy command
const nameOption = Options.text("name").pipe(
  Options.withAlias("n"),
  Options.withDescription("Your name"),
  Options.withDefault("World")
);

const greetCommand = Command.make("greet", { name: nameOption }, ({ name }) =>
  Console.log(`Hello, ${name}!`).pipe(
    Effect.tap(() => Console.log("This is a dummy Confect CLI command."))
  )
).pipe(Command.withDescription("A simple greeting command"));

// Define the main CLI application
const cli = Command.make("confect").pipe(
  Command.withDescription("Confect CLI - Use Effect with Convex!"),
  Command.withSubcommands([greetCommand])
);

// Run the CLI
const main = Command.run(cli, {
  name: "Confect CLI",
  version: packageJson.version,
});

main(process.argv).pipe(Effect.provide(NodeContext.layer), NodeRuntime.runMain);
