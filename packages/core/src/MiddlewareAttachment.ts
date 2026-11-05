import * as Data from "effect/Data";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import type * as MiddlewareSpec from "./MiddlewareSpec";

export type MiddlewareAttachment<
  MiddlewareSpec_ extends MiddlewareSpec.AnyMiddlewareSpec =
    MiddlewareSpec.AnyMiddlewareSpec,
> = MiddlewareSpec_ extends MiddlewareSpec.AnyMiddlewareSpec
  ? {
      readonly spec: MiddlewareSpec_;
      readonly options: [MiddlewareSpec_["~Options"]] extends [never]
        ? undefined
        : MiddlewareSpec.Options<MiddlewareSpec_>;
    }
  : never;

export type Args<MiddlewareSpec_ extends MiddlewareSpec.AnyMiddlewareSpec> = [
  MiddlewareSpec_["~Options"],
] extends [never]
  ? []
  : [options: MiddlewareSpec.Options<MiddlewareSpec_>];

export type ValidationError = Data.TaggedEnum<{
  InvalidOptions: {
    readonly middlewareKey: string;
    readonly location: string;
    readonly attachmentIndex: number;
  };
  ConflictingSpecs: {
    readonly middlewareKey: string;
    readonly location: string;
    readonly attachmentIndex: number;
    readonly previousIndex: number;
  };
  EquivalentOptions: {
    readonly middlewareKey: string;
    readonly location: string;
    readonly attachmentIndex: number;
    readonly previousIndex: number;
  };
}>;

export const ValidationError = Data.taggedEnum<ValidationError>();

export const formatValidationError = ValidationError.$match({
  InvalidOptions: ({ middlewareKey, location, attachmentIndex }) =>
    `Middleware "${middlewareKey}" has invalid options at attachment ${attachmentIndex + 1} on ${location}`,
  ConflictingSpecs: ({ middlewareKey, location }) =>
    `Different middleware specs share key "${middlewareKey}" on ${location}`,
  EquivalentOptions: ({
    middlewareKey,
    location,
    attachmentIndex,
    previousIndex,
  }) =>
    `Middleware "${middlewareKey}" has equivalent options at attachments ${previousIndex + 1} and ${attachmentIndex + 1} on ${location}`,
});

export const validateAll = (
  attachments: ReadonlyArray<MiddlewareAttachment>,
  location: string,
): Result.Result<void, ValidationError> => {
  for (const [index, attachment] of attachments.entries()) {
    const schema = attachment.spec.options;
    if (schema !== undefined && !Schema.is(schema)(attachment.options)) {
      return Result.fail(
        ValidationError.InvalidOptions({
          middlewareKey: attachment.spec.key,
          location,
          attachmentIndex: index,
        }),
      );
    }
    const equivalent =
      schema === undefined ? undefined : Schema.toEquivalence(schema);
    for (const [previousIndex, previous] of attachments.entries()) {
      if (previousIndex === index) break;
      if (previous.spec.key !== attachment.spec.key) continue;
      if (previous.spec !== attachment.spec) {
        return Result.fail(
          ValidationError.ConflictingSpecs({
            middlewareKey: attachment.spec.key,
            location,
            attachmentIndex: index,
            previousIndex,
          }),
        );
      }
      if (
        equivalent === undefined ||
        equivalent(previous.options, attachment.options)
      ) {
        return Result.fail(
          ValidationError.EquivalentOptions({
            middlewareKey: attachment.spec.key,
            location,
            attachmentIndex: index,
            previousIndex,
          }),
        );
      }
    }
  }
  return Result.void;
};
