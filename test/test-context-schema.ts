import type { Expand } from "convex/server";

import type { GenericConfectTableDefinition } from "~/src/schema";

const prefixTableNames = <
	Prefix extends string,
	Tables extends Record<string, GenericConfectTableDefinition>,
>(
	prefix: Prefix,
	tables: Tables,
): Expand<PrefixedKeys<Prefix, Tables>> =>
	Object.entries(tables).reduce(
		(acc, [key, value]) => {
			acc[`${prefix}__${key}`] = value as any;
			return acc;
		},
		{} as Expand<PrefixedKeys<Prefix, Tables>>,
	);

interface TestContextSchema<
	Prefix extends string,
	Tables extends Record<string, GenericConfectTableDefinition>,
> {
	readonly tables: Expand<PrefixedKeys<Prefix, Tables>>;
	tableName: (
		tableName: keyof Tables & string,
	) => `${Prefix}__${typeof tableName}`;
}

class TextContextSchemaImpl<
	Prefix extends string,
	Tables extends Record<string, GenericConfectTableDefinition>,
> implements TestContextSchema<Prefix, Tables>
{
	private readonly prefix: Prefix;
	public readonly tables: Expand<PrefixedKeys<Prefix, Tables>>;

	constructor(prefix: Prefix, tables: Tables) {
		this.prefix = prefix;
		this.tables = prefixTableNames(prefix, tables);
	}

	tableName = (tableName: keyof Tables & string): `${Prefix}__${string}` =>
		`${this.prefix}__${tableName}`;
}

export const make = <
	Prefix extends string,
	Tables extends Record<string, GenericConfectTableDefinition>,
>(
	prefix: Prefix,
	tables: Tables,
): TestContextSchema<Prefix, Tables> => {
	return new TextContextSchemaImpl(prefix, tables);
};

type PrefixedKeys<Prefix extends string, T extends Record<string, any>> = {
	[K in keyof T as `${Prefix}__${K & string}`]: T[K];
};
