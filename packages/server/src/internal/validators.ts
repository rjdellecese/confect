import {
  compileArgsSchema,
  compileReturnsSchema,
} from "@confect/core/SchemaToValidator";
import type { PropertyValidators, Validator } from "convex/values";
import * as Data from "effect/Data";
import * as Result from "effect/Result";
import type * as Schema from "effect/Schema";

/**
 * A function's `args` or `returns` schema does not compile to a Convex
 * validator. Thrown by the validator's first read, which Convex makes while it
 * analyzes a push.
 */
export class ValidatorCompileError extends Data.TaggedError(
  "ValidatorCompileError",
)<{
  readonly functionName: string;
  readonly validator: "args" | "returns";
  readonly cause: unknown;
}> {
  override get message(): string {
    const reason =
      this.cause instanceof Error ? this.cause.message : String(this.cause);
    return `The ${this.validator} schema of function "${this.functionName}" does not compile to a Convex validator: ${reason}`;
  }
}

/**
 * A stand-in for the object `compute` returns. The first operation on the
 * stand-in runs `compute`, and every operation is forwarded to the result,
 * except that the stand-in cannot be made non-extensible.
 */
const lazyObject = <A extends object>(compute: () => A): A => {
  let computed: A | undefined;
  const value = () => (computed ??= compute());
  return new Proxy({} as A, {
    get: (_, key) => Reflect.get(value(), key),
    has: (_, key) => Reflect.has(value(), key),
    ownKeys: () => Reflect.ownKeys(value()),
    // A proxy may not report a property absent from its target as
    // non-configurable, and this target stays empty.
    getOwnPropertyDescriptor: (_, key) => {
      const descriptor = Reflect.getOwnPropertyDescriptor(value(), key);
      return descriptor === undefined
        ? undefined
        : { ...descriptor, configurable: true };
    },
    // Nor may it report keys absent from a non-extensible target, so the
    // target stays extensible.
    preventExtensions: () => false,
    getPrototypeOf: () => Reflect.getPrototypeOf(value()),
    setPrototypeOf: (_, prototype) =>
      Reflect.setPrototypeOf(value(), prototype),
    set: (_, key, next) => Reflect.set(value(), key, next),
    defineProperty: (_, key, descriptor) =>
      Reflect.defineProperty(value(), key, descriptor),
    deleteProperty: (_, key) => Reflect.deleteProperty(value(), key),
  });
};

const compiledOnFirstRead = <A extends object>(
  functionName: string,
  validator: "args" | "returns",
  compile: () => A,
): A =>
  lazyObject(() =>
    Result.getOrThrowWith(
      Result.try(compile),
      (cause) => new ValidatorCompileError({ functionName, validator, cause }),
    ),
  );

/**
 * The `args` validator Convex receives for a Confect function, compiled from
 * its schema when Convex first reads it. Convex reads a function's validators
 * only in `exportArgs`/`exportReturns`, when it analyzes a push and when
 * `convex-test` resolves the function. The validator is a value rather than a
 * getter so that it stays uncompiled through the spreads a definition passes
 * through on its way to Convex.
 */
export const argsValidator = (
  functionName: string,
  args: Schema.Codec<any, any>,
): PropertyValidators =>
  compiledOnFirstRead(functionName, "args", () => compileArgsSchema(args));

/**
 * The `returns` validator Convex receives for a Confect function, compiled from
 * its schema when Convex first reads it. See {@link argsValidator}.
 */
export const returnsValidator = (
  functionName: string,
  returns: Schema.Codec<any, any>,
): Validator<any, any, any> =>
  compiledOnFirstRead(functionName, "returns", () =>
    compileReturnsSchema(returns),
  );
