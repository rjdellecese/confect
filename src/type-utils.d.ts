import type { ReadonlyOrMutableValue } from "~/src/schema-to-validator-compiler";

// biome-ignore lint/complexity/noBannedTypes:
export type IsOptional<T, K extends keyof T> = {} extends Pick<T, K>
	? true
	: false;

// biome-ignore format: Removes disambiguating parens
export type IsAny<T> = 0 extends (1 & T) ? true : false;

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

export type DeepMutable<T> = IsAny<T> extends true
	? any
	: T extends ReadonlyMap<infer K, infer V>
		? Map<DeepMutable<K>, DeepMutable<V>>
		: T extends ReadonlySet<infer V>
			? Set<DeepMutable<V>>
			: [keyof T] extends [never]
				? T
				: { -readonly [K in keyof T]: DeepMutable<T[K]> };

export type DeepReadonly<T> = IsAny<T> extends true
	? any
	: T extends Map<infer K, infer V>
		? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
		: T extends Set<infer V>
			? ReadonlySet<DeepReadonly<V>>
			: [keyof T] extends [never]
				? T
				: { readonly [K in keyof T]: DeepReadonly<T[K]> };

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
