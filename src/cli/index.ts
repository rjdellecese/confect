// Import necessary modules from the libraries
import { Command as CliCommand } from "@effect/cli";
import { Command as PlatformCommand } from "@effect/platform";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { Effect, Console } from "effect";

// Define the top-level command
const command = CliCommand.make("generate", {}, () =>
	Effect.gen(function* () {
		const output = yield* PlatformCommand.string(PlatformCommand.make("pwd"));
		yield* Console.log(output);
	}),
);

// Set up the CLI application
const cli = CliCommand.run(command, {
	name: "Confect CLI",
	version: "v1.0.0",
});

// Prepare and run the CLI application
cli(process.argv).pipe(Effect.provide(NodeContext.layer), NodeRuntime.runMain);
