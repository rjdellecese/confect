import * as Schema from "effect/Schema";

export const ImplModulePath = Schema.String.check(
  Schema.isEndingWith(".impl.ts"),
).pipe(Schema.brand("@confect/cli/ImplModulePath"));

export type ImplModulePath = typeof ImplModulePath.Type;
