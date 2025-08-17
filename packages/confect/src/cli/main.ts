#!/usr/bin/env bun

/**
 * @fileoverview Confect CLI tool for generating TypeScript error types from Confect functions.
 *
 * This CLI tool scans Convex directories for Confect functions and generates TypeScript
 * type definitions that provide compile-time type safety for error handling.
 *
 * @since 1.0.0
 * @example
 * ```bash
 * # Generate types from default convex directory
 * confect-generate
 *
 * # Generate types with custom paths
 * confect-generate --convex-dir ./my-convex --output ./my-types.d.ts
 *
 * # Watch mode for development
 * confect-generate --watch
 * ```
 */

import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Options from "@effect/cli/Options";
import * as Command from "@effect/cli/Command";
import * as Stream from "effect/Stream";
import * as BunContext from "@effect/platform-bun/BunContext";
import * as BunRuntime from "@effect/platform-bun/BunRuntime";
import * as FileSystem from "@effect/platform/FileSystem";
import { ConfectTypeGeneratorService } from "./services/type-generator-service";
import { ConfectTypeExtractorService } from "./services/type-extractor-service";
import { ErrorTypesGeneratorService } from "./services/error-types-generator-service";
import { cliOptionsLayer } from "./services/cli-option-tag";

/**
 * CLI option for specifying the Convex directory path.
 * @since 1.0.0
 */
const convexDirOption = Options.text("convex-dir").pipe(
  Options.withAlias("d"),
  Options.withDefault("./convex"),
  Options.withDescription("Convex functions directory"),
);

/**
 * CLI option for specifying the output file path.
 * @since 1.0.0
 */
const outputOption = Options.text("output").pipe(
  Options.withAlias("o"),
  Options.withDefault("./confect-generated-env.d.ts"),
  Options.withDescription("Output file path"),
);

/**
 * CLI option for enabling watch mode.
 * @since 1.0.0
 */
const watchOption = Options.boolean("watch").pipe(
  Options.withAlias("w"),
  Options.withDefault(false),
  Options.withDescription("Watch mode - automatically regenerate on changes"),
);

/**
 * Main CLI command for generating Confect error types.
 * @since 1.0.0
 */
const generateCommand = Command.make("confect-generate", {
  convexDir: convexDirOption,
  output: outputOption,
  watch: watchOption,
}).pipe(
  Command.withDescription(
    "Generate TypeScript error types for Confect functions from Convex schema",
  ),
  Command.withHandler(({ convexDir, output, watch }) =>
    Effect.gen(function* () {
      yield* Console.log("🚀 Confect Error Types Generator");

      const fileSystem = yield* FileSystem.FileSystem;
      const dirExists = yield* fileSystem.exists(convexDir);
      if (!dirExists) {
        yield* Console.error(`❌ Convex directory not found: ${convexDir}`);
        return yield* Effect.fail(
          new Error(`Convex directory not found: ${convexDir}`),
        );
      }
      const typeGenerator = yield* ConfectTypeGeneratorService;

      if (watch) {
        yield* typeGenerator.generate;
        yield* Console.log("� Watching for changes...");

        yield* fileSystem.watch(convexDir, { recursive: true }).pipe(
          Stream.filter((event) => event.path.endsWith(".ts")),
          Stream.debounce("500 millis"),
          Stream.mapEffect(() => typeGenerator.generate),
          Stream.runDrain,
          Effect.forkScoped,
        );

        yield* Effect.never;
      } else {
        yield* typeGenerator.generate;
      }
    }).pipe(Effect.provide(cliOptionsLayer({ convexDir, output }))),
  ),
);

const programMain = Command.run(generateCommand, {
  name: "confect-generate",
  version: "1.0.0",
})(process.argv).pipe(
  Effect.provide(ConfectTypeGeneratorService.Default),
  Effect.provide(ConfectTypeExtractorService.Default),
  Effect.provide(ErrorTypesGeneratorService.Default),
  Effect.provide(BunContext.layer),
  Effect.scoped,
);

BunRuntime.runMain(programMain);
