/**
 * A three-state result type for asynchronous data, inspired by Effect v4's
 * `AsyncResult`. Replaces `T | undefined` for loading states in React hooks,
 * and carries typed errors in the `Failure` variant.
 *
 * - `Initial` — no result yet (loading / first fetch).
 * - `Success` — the operation succeeded with a value.
 * - `Failure` — the operation failed with a typed error.
 *
 * Every variant carries a `waiting` flag that is `true` while a refetch is
 * in-flight, allowing UIs to show both the stale value *and* a loading
 * indicator simultaneously.
 */

import { Option } from "effect";

// ---------------------------------------------------------------------------
// Type ID
// ---------------------------------------------------------------------------

export const TypeId: unique symbol = Symbol.for("@confect/core/AsyncResult");
export type TypeId = typeof TypeId;

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

export type AsyncResult<A, E = never> =
  | Initial<A, E>
  | Success<A, E>
  | Failure<A, E>;

export interface Initial<_A = never, _E = never> {
  readonly [TypeId]: TypeId;
  readonly _tag: "Initial";
  readonly waiting: boolean;
}

export interface Success<A, _E = never> {
  readonly [TypeId]: TypeId;
  readonly _tag: "Success";
  readonly value: A;
  readonly waiting: boolean;
}

export interface Failure<A = never, E = never> {
  readonly [TypeId]: TypeId;
  readonly _tag: "Failure";
  readonly error: E;
  readonly previousValue: Option.Option<A>;
  readonly waiting: boolean;
}

// ---------------------------------------------------------------------------
// Constructors
// ---------------------------------------------------------------------------

export const initial = <A = never, E = never>(
  waiting = false,
): Initial<A, E> => ({
  [TypeId]: TypeId,
  _tag: "Initial",
  waiting,
});

export const success = <A, E = never>(
  value: A,
  options?: { readonly waiting?: boolean },
): Success<A, E> => ({
  [TypeId]: TypeId,
  _tag: "Success",
  value,
  waiting: options?.waiting ?? false,
});

export const failure = <A = never, E = never>(
  error: E,
  options?: {
    readonly previousValue?: Option.Option<A>;
    readonly waiting?: boolean;
  },
): Failure<A, E> => ({
  [TypeId]: TypeId,
  _tag: "Failure",
  error,
  previousValue: options?.previousValue ?? Option.none(),
  waiting: options?.waiting ?? false,
});

// ---------------------------------------------------------------------------
// Refinements / Guards
// ---------------------------------------------------------------------------

export const isAsyncResult = (u: unknown): u is AsyncResult<unknown, unknown> =>
  typeof u === "object" && u !== null && TypeId in u;

export const isInitial = <A, E>(
  result: AsyncResult<A, E>,
): result is Initial<A, E> => result._tag === "Initial";

export const isSuccess = <A, E>(
  result: AsyncResult<A, E>,
): result is Success<A, E> => result._tag === "Success";

export const isFailure = <A, E>(
  result: AsyncResult<A, E>,
): result is Failure<A, E> => result._tag === "Failure";

export const isWaiting = <A, E>(result: AsyncResult<A, E>): boolean =>
  result.waiting;

// ---------------------------------------------------------------------------
// Combinators
// ---------------------------------------------------------------------------

export const waiting = <A, E>(self: AsyncResult<A, E>): AsyncResult<A, E> => {
  if (self.waiting) return self;
  return { ...self, waiting: true };
};

export const value = <A, E>(self: AsyncResult<A, E>): Option.Option<A> => {
  switch (self._tag) {
    case "Success":
      return Option.some(self.value);
    case "Failure":
      return self.previousValue;
    case "Initial":
      return Option.none();
  }
};

export function getOrElse<B>(
  orElse: () => B,
): <A, E>(self: AsyncResult<A, E>) => A | B;
export function getOrElse<A, E, B>(
  self: AsyncResult<A, E>,
  orElse: () => B,
): A | B;
export function getOrElse(...args: [any, any?]): any {
  if (args.length === 1) {
    return (self: AsyncResult<unknown, unknown>) =>
      Option.getOrElse(value(self), args[0]);
  }
  return Option.getOrElse(value(args[0]), args[1]);
}

export function map<A, B>(
  f: (a: A) => B,
): <E>(self: AsyncResult<A, E>) => AsyncResult<B, E>;
export function map<A, E, B>(
  self: AsyncResult<A, E>,
  f: (a: A) => B,
): AsyncResult<B, E>;
export function map(...args: [any, any?]): any {
  if (args.length === 1) {
    return (self: AsyncResult<unknown, unknown>) => mapImpl(self, args[0]);
  }
  return mapImpl(args[0], args[1]);
}

const mapImpl = <A, E, B>(
  self: AsyncResult<A, E>,
  f: (a: A) => B,
): AsyncResult<B, E> => {
  switch (self._tag) {
    case "Initial":
      return self as unknown as AsyncResult<B, E>;
    case "Success":
      return success(f(self.value), { waiting: self.waiting });
    case "Failure":
      return failure(self.error, {
        previousValue: Option.map(self.previousValue, f),
        waiting: self.waiting,
      });
  }
};

export function match<A, E, X, Y, Z>(options: {
  readonly onInitial: (result: Initial<A, E>) => X;
  readonly onSuccess: (result: Success<A, E>) => Y;
  readonly onFailure: (result: Failure<A, E>) => Z;
}): (self: AsyncResult<A, E>) => X | Y | Z;
export function match<A, E, X, Y, Z>(
  self: AsyncResult<A, E>,
  options: {
    readonly onInitial: (result: Initial<A, E>) => X;
    readonly onSuccess: (result: Success<A, E>) => Y;
    readonly onFailure: (result: Failure<A, E>) => Z;
  },
): X | Y | Z;
export function match(...args: [any, any?]): any {
  if (args.length === 1) {
    return (self: AsyncResult<unknown, unknown>) => matchImpl(self, args[0]);
  }
  return matchImpl(args[0], args[1]);
}

const matchImpl = <A, E, X, Y, Z>(
  self: AsyncResult<A, E>,
  options: {
    readonly onInitial: (result: Initial<A, E>) => X;
    readonly onSuccess: (result: Success<A, E>) => Y;
    readonly onFailure: (result: Failure<A, E>) => Z;
  },
): X | Y | Z => {
  switch (self._tag) {
    case "Initial":
      return options.onInitial(self);
    case "Success":
      return options.onSuccess(self);
    case "Failure":
      return options.onFailure(self);
  }
};

// ---------------------------------------------------------------------------
// Namespace helpers
// ---------------------------------------------------------------------------

export declare namespace AsyncResult {
  type Value<R> = R extends AsyncResult<infer A, infer _E> ? A : never;
  type Error<R> = R extends AsyncResult<infer _A, infer E> ? E : never;
}
