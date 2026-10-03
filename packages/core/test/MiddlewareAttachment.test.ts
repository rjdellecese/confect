import { describe, expect, it } from "@effect/vitest";
import * as MiddlewareAttachment from "@confect/core/MiddlewareAttachment";
import * as MiddlewareSpec from "@confect/core/MiddlewareSpec";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

describe("validateAll", () => {
  class RequireRole extends MiddlewareSpec.MiddlewareSpec<RequireRole>()(
    "RequireRole",
    {
      options: () =>
        Schema.Struct({
          roles: Schema.Array(Schema.Literals(["Internal", "Buyer"])),
        }),
      functionTypes: { query: true, mutation: true, action: true },
    },
  ) {}

  it("uses schema equivalence overrides rather than serialized or reference equality", () => {
    class RoleSet extends MiddlewareSpec.MiddlewareSpec<RoleSet>()("RoleSet", {
      options: () =>
        Schema.Struct({ roles: Schema.Array(Schema.String) }).pipe(
          Schema.overrideToEquivalence(
            () => (left, right) =>
              left.roles.every((role) => right.roles.includes(role)) &&
              right.roles.every((role) => left.roles.includes(role)),
          ),
        ),
      functionTypes: { query: true, mutation: false, action: false },
    }) {}
    const duplicate = MiddlewareAttachment.validateAll(
      [
        { spec: RoleSet, options: { roles: ["Internal", "Buyer"] } },
        { spec: RoleSet, options: { roles: ["Buyer", "Internal", "Buyer"] } },
      ],
      "test chain",
    );
    expect(duplicate).toEqual(
      Result.fail(
        MiddlewareAttachment.ValidationError.EquivalentOptions({
          middlewareKey: "RoleSet",
          location: "test chain",
          attachmentIndex: 1,
          previousIndex: 0,
        }),
      ),
    );
    expect(
      Result.mapError(duplicate, MiddlewareAttachment.formatValidationError),
    ).toEqual(
      Result.fail(
        'Middleware "RoleSet" has equivalent options at attachments 1 and 2 on test chain',
      ),
    );
    expect(
      MiddlewareAttachment.validateAll(
        [
          { spec: RequireRole, options: { roles: ["Internal", "Buyer"] } },
          { spec: RequireRole, options: { roles: ["Buyer", "Internal"] } },
        ],
        "test chain",
      ),
    ).toEqual(Result.succeed(undefined));
  });

  it("validates option values on the schema's type side", () => {
    class Limit extends MiddlewareSpec.MiddlewareSpec<Limit>()("Limit", {
      options: () => Schema.Struct({ limit: Schema.FiniteFromString }),
      functionTypes: { query: true, mutation: false, action: false },
    }) {}
    const valid: MiddlewareAttachment.MiddlewareAttachment<typeof Limit> = {
      spec: Limit,
      options: { limit: 5 },
    };
    expect(MiddlewareAttachment.validateAll([valid], "test chain")).toEqual(
      Result.succeed(undefined),
    );
    const invalid: MiddlewareAttachment.MiddlewareAttachment<typeof Limit> = {
      spec: Limit,
      // @ts-expect-error
      options: { limit: "5" },
    };
    const result = MiddlewareAttachment.validateAll([invalid], "test chain");
    expect(result).toEqual(
      Result.fail(
        MiddlewareAttachment.ValidationError.InvalidOptions({
          middlewareKey: "Limit",
          location: "test chain",
          attachmentIndex: 0,
        }),
      ),
    );
    expect(
      Result.mapError(result, MiddlewareAttachment.formatValidationError),
    ).toEqual(
      Result.fail(
        'Middleware "Limit" has invalid options at attachment 1 on test chain',
      ),
    );
  });

  it("rejects different spec declarations sharing an implementation key", () => {
    class OtherRole extends MiddlewareSpec.MiddlewareSpec<OtherRole>()(
      "RequireRole",
      {
        options: () => Schema.Struct({ roles: Schema.Array(Schema.String) }),
        functionTypes: { query: true, mutation: true, action: true },
      },
    ) {}
    const result = MiddlewareAttachment.validateAll(
      [
        { spec: RequireRole, options: { roles: ["Internal"] } },
        { spec: OtherRole, options: { roles: ["Buyer"] } },
      ],
      "test chain",
    );
    expect(result).toEqual(
      Result.fail(
        MiddlewareAttachment.ValidationError.ConflictingSpecs({
          middlewareKey: "RequireRole",
          location: "test chain",
          attachmentIndex: 1,
          previousIndex: 0,
        }),
      ),
    );
    expect(
      Result.mapError(result, MiddlewareAttachment.formatValidationError),
    ).toEqual(
      Result.fail(
        'Different middleware specs share key "RequireRole" on test chain',
      ),
    );
  });

  it("does not turn schema factory or equivalence bugs into validation failures", () => {
    const defect = new Error("schema bug");
    class BrokenSchema extends MiddlewareSpec.MiddlewareSpec<BrokenSchema>()(
      "BrokenSchema",
      {
        options: (): Schema.Schema<string> => {
          throw defect;
        },
        functionTypes: { query: true, mutation: false, action: false },
      },
    ) {}
    class BrokenEquivalence extends MiddlewareSpec.MiddlewareSpec<BrokenEquivalence>()(
      "BrokenEquivalence",
      {
        options: () =>
          Schema.String.pipe(
            Schema.overrideToEquivalence(() => () => {
              throw defect;
            }),
          ),
        functionTypes: { query: true, mutation: false, action: false },
      },
    ) {}

    expect(() =>
      MiddlewareAttachment.validateAll(
        [{ spec: BrokenSchema, options: "value" }],
        "test chain",
      ),
    ).toThrow(defect);
    expect(() =>
      MiddlewareAttachment.validateAll(
        [
          { spec: BrokenEquivalence, options: "first" },
          { spec: BrokenEquivalence, options: "second" },
        ],
        "test chain",
      ),
    ).toThrow(defect);
  });
});
