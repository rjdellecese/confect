import type { ReadonlyOrMutableValue } from "~/src/schema-to-validator-compiler";

export type IsUnion<T, U extends T = T> = T extends unknown
	? [U] extends [T]
		? false
		: true
	: never;

// https://stackoverflow.com/a/52806744
export type IsValueLiteral<Vl extends ReadonlyOrMutableValue> = [Vl] extends [
	never,
]
	? never
	: [Vl] extends [string | number | bigint | boolean]
		? [string] extends [Vl]
			? false
			: [number] extends [Vl]
				? false
				: [boolean] extends [Vl]
					? false
					: [bigint] extends [Vl]
						? false
						: true
		: false;

// Vendored from Arktype
// https://github.com/arktypeio/arktype/blob/2e911d01a741ccee7a17e31ee144049817fabbb8/ark/util/unionToTuple.ts#L9
// TODO: Write some tests still?
export type UnionToTuple<t> = _unionToTuple<t, []> extends infer result
	? conform<result, t[]>
	: never;

type _unionToTuple<
	t,
	result extends unknown[],
> = getLastBranch<t> extends infer current
	? [t] extends [never]
		? result
		: _unionToTuple<Exclude<t, current>, [current, ...result]>
	: never;

type getLastBranch<t> = intersectUnion<
	t extends unknown ? (x: t) => void : never
> extends (x: infer branch) => void
	? branch
	: never;

type intersectUnion<t> = (t extends unknown ? (_: t) => void : never) extends (
	_: infer intersection,
) => void
	? intersection
	: never;

type conform<t, base> = t extends base ? t : base;
