import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { expect, test } from "bun:test";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Record from "effect/Record";
import * as Schema from "effect/Schema";
import * as String from "effect/String";
import * as ChildProcess from "effect/process/ChildProcess";
import { ChildProcessSpawner } from "effect/process/ChildProcessSpawner";
import * as Stream from "effect/Stream";
import config from "../.oxlintrc.json" with { type: "json" };
import effectPolicy from "../tsconfig.effect.json" with { type: "json" };

test("enables every installed Effect rule except the explicit policy opt-outs", () => {
  const disabledRules: ReadonlyArray<string> = [
    "effecttsgo/api-stability-leak",
    "effecttsgo/missing-pipeable-signature",
    "effecttsgo/unstable-api-usage",
  ];
  const require = createRequire(import.meta.url);
  const schema: unknown = require(
    fileURLToPath(
      new URL(
        "oxlint-schema.json",
        import.meta.resolve("@effect/tsgo/package.json"),
      ),
    ),
  );
  const declared = Schema.decodeUnknownEffect(
    Schema.Struct({
      definitions: Schema.Struct({
        DummyRuleMap: Schema.Struct({
          properties: Schema.Record(Schema.String, Schema.Unknown),
        }),
      }),
    }),
  )(schema).pipe(Effect.runSync);
  const effectRules = Array.filter(
    Record.keys(declared.definitions.DummyRuleMap.properties),
    String.startsWith("effecttsgo/"),
  );
  expect(effectRules.length).toBeGreaterThan(0);
  const configuredRules: Readonly<Record<string, unknown>> = config.rules;
  for (const rule of effectRules) {
    expect(configuredRules[rule], rule).toBe(
      Array.contains(disabledRules, rule) ? "off" : "error",
    );
  }
  for (const override of config.overrides) {
    const rules: Readonly<Record<string, unknown>> = override.rules;
    for (const rule of effectRules) {
      if (rule in rules) {
        expect(rules[rule], rule).toBe(
          Array.contains(disabledRules, rule) ? "off" : "error",
        );
      }
    }
  }
});

test("disables compiler diagnostics without per-export unstable API grants", () => {
  for (const plugin of effectPolicy.compilerOptions.plugins) {
    expect(plugin.diagnostics).toBe(false);
    expect(plugin).not.toHaveProperty("allowedUnstableApis");
  }
});

test("allows unstable APIs without per-export grants", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner;
    const repository = path.resolve(import.meta.dirname, "..");
    const directory = yield* fs.makeTempDirectoryScoped({
      directory: repository,
      prefix: "effect-policy-",
    });
    const fixture = path.join(directory, "probe.ts");
    const tsconfig = yield* Schema.encodeEffect(
      Schema.fromJsonString(Schema.Unknown),
    )({
      extends: path.join(repository, "tsconfig.effect.json"),
      compilerOptions: {
        module: "ESNext",
        moduleResolution: "Bundler",
        target: "ESNext",
        skipLibCheck: true,
      },
      files: ["probe.ts"],
    });
    yield* fs.writeFileString(path.join(directory, "tsconfig.json"), tsconfig);
    yield* fs.writeFileString(
      fixture,
      `import * as HttpClientRequest from "effect/http/HttpClientRequest";
void HttpClientRequest.get("https://example.com");
void HttpClientRequest.put("https://example.com");
`,
    );
    const child = yield* spawner.spawn(
      ChildProcess.make(process.execPath, [
        fileURLToPath(
          new URL(
            "dist/effect-tsgo.cjs",
            import.meta.resolve("@effect/tsgo/package.json"),
          ),
        ),
        "--tsrs-lint",
        "oxlint",
        "--config",
        path.join(repository, ".oxlintrc.json"),
        "--format",
        "json",
        fixture,
      ]),
    );
    const output = yield* child.stdout.pipe(
      Stream.decodeText(),
      Stream.mkString,
    );
    const exitCode = yield* child.exitCode;
    const report = yield* Schema.decodeEffect(
      Schema.fromJsonString(
        Schema.Struct({
          diagnostics: Schema.Array(
            Schema.Struct({ code: Schema.String, message: Schema.String }),
          ),
        }),
      ),
    )(output);
    expect<number>(exitCode).toBe(0);
    expect(report.diagnostics).toHaveLength(0);
  }).pipe(
    Effect.scoped,
    Effect.provide(NodeServices.layer),
    Effect.runPromise,
  ));
