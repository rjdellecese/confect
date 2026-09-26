import * as templates from "@confect/cli/templates";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

it.effect("exports metadata services as aliases of the server tags", () =>
  Effect.gen(function* () {
    const contents = yield* templates.services({
      schemaImportPath: "./schema",
    });

    for (const name of [
      "ExecutionMetadata",
      "RequestMetadata",
      "TransactionMetadata",
    ]) {
      expect(contents).toContain(`${name} as ${name}_,`);
      expect(contents).toContain(`export const ${name} = ${name}_.${name};`);
      expect(contents).toContain(
        `export type ${name} = typeof ${name}.Identifier;`,
      );
    }
  }),
);
