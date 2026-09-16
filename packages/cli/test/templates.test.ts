import * as templates from "@confect/cli/templates";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

it.effect("separates generated function exports with blank lines", () =>
  Effect.gen(function* () {
    const output = yield* templates.functions({
      functionNames: ["first", "second"],
      registeredFunctionsImportPath:
        "../confect/_generated/registeredFunctions/notes",
    });

    expect(output).toBe(
      'import registeredFunctions from "../confect/_generated/registeredFunctions/notes";\n\n' +
        "export const first = registeredFunctions.first;\n\n" +
        "export const second = registeredFunctions.second;\n",
    );
  }),
);
