import {
	type DefaultFunctionArgs,
	type GenericActionCtx,
	type GenericMutationCtx,
	type GenericQueryCtx,
	type RegisteredAction,
	type RegisteredMutation,
	type RegisteredQuery,
	actionGeneric,
	internalActionGeneric,
	internalMutationGeneric,
	internalQueryGeneric,
	mutationGeneric,
	queryGeneric,
} from "convex/server";
import { Effect, Schema, pipe } from "effect";

import {
	type ConfectActionCtx,
	type ConfectMutationCtx,
	type ConfectQueryCtx,
	makeConfectActionCtx,
	makeConfectMutationCtx,
	makeConfectQueryCtx,
} from "~/src/server/ctx";
import type {
	DataModelFromConfectDataModel,
	GenericConfectDataModel,
} from "~/src/server/data-model";
import {
	type DatabaseSchemasFromConfectDataModel,
	databaseSchemasFromConfectSchema,
} from "~/src/server/database";
import type {
	ConfectDataModelFromConfectSchema,
	ConfectSchemaDefinition,
	GenericConfectSchema,
} from "~/src/server/schema";
import {
	compileArgsSchema,
	compileReturnsSchema,
} from "~/src/server/schema-to-validator";

export const makeFunctions = <ConfectSchema extends GenericConfectSchema>(
	confectSchemaDefinition: ConfectSchemaDefinition<ConfectSchema>,
) => {
	const databaseSchemas = databaseSchemasFromConfectSchema(
		confectSchemaDefinition.confectSchema,
	);

	const query = <
		ConvexArgs extends DefaultFunctionArgs,
		ConfectArgs,
		ConvexReturns,
		ConfectReturns,
	>({
		args,
		returns,
		handler,
	}: {
		args: Schema.Schema<ConfectArgs, ConvexArgs>;
		returns: Schema.Schema<ConfectReturns, ConvexReturns>;
		handler: (
			ctx: ConfectQueryCtx<ConfectDataModelFromConfectSchema<ConfectSchema>>,
			a: ConfectArgs,
		) => Effect.Effect<ConvexReturns>;
	}): RegisteredQuery<"public", ConvexArgs, Promise<ConvexReturns>> =>
		queryGeneric(
			confectQueryFunction({ databaseSchemas, args, returns, handler }),
		);

	const internalQuery = <
		ConvexArgs extends DefaultFunctionArgs,
		ConfectArgs,
		ConvexReturns,
		ConfectReturns,
	>({
		args,
		handler,
		returns,
	}: {
		args: Schema.Schema<ConfectArgs, ConvexArgs>;
		returns: Schema.Schema<ConfectReturns, ConvexReturns>;
		handler: (
			ctx: ConfectQueryCtx<ConfectDataModelFromConfectSchema<ConfectSchema>>,
			a: ConfectArgs,
		) => Effect.Effect<ConvexReturns>;
	}): RegisteredQuery<"internal", ConvexArgs, Promise<ConvexReturns>> =>
		internalQueryGeneric(
			confectQueryFunction({ databaseSchemas, args, returns, handler }),
		);

	const mutation = <
		ConvexValue extends DefaultFunctionArgs,
		ConfectValue,
		ConvexReturns,
		ConfectReturns,
	>({
		args,
		returns,
		handler,
	}: {
		args: Schema.Schema<ConfectValue, ConvexValue>;
		returns: Schema.Schema<ConfectReturns, ConvexReturns>;
		handler: (
			ctx: ConfectMutationCtx<ConfectDataModelFromConfectSchema<ConfectSchema>>,
			a: ConfectValue,
		) => Effect.Effect<ConvexReturns>;
	}): RegisteredMutation<"public", ConvexValue, Promise<ConvexReturns>> =>
		mutationGeneric(
			confectMutationFunction({ databaseSchemas, args, returns, handler }),
		);

	const internalMutation = <
		ConvexValue extends DefaultFunctionArgs,
		ConfectValue,
		ConvexReturns,
		ConfectReturns,
	>({
		args,
		returns,
		handler,
	}: {
		args: Schema.Schema<ConfectValue, ConvexValue>;
		returns: Schema.Schema<ConfectReturns, ConvexReturns>;
		handler: (
			ctx: ConfectMutationCtx<ConfectDataModelFromConfectSchema<ConfectSchema>>,
			a: ConfectValue,
		) => Effect.Effect<ConvexReturns>;
	}): RegisteredMutation<"internal", ConvexValue, Promise<ConvexReturns>> =>
		internalMutationGeneric(
			confectMutationFunction({ databaseSchemas, args, returns, handler }),
		);

	const action = <
		ConvexValue extends DefaultFunctionArgs,
		ConfectValue,
		ConvexReturns,
		ConfectReturns,
	>({
		args,
		returns,
		handler,
	}: {
		args: Schema.Schema<ConfectValue, ConvexValue>;
		returns: Schema.Schema<ConfectReturns, ConvexReturns>;
		handler: (
			ctx: ConfectActionCtx<ConfectDataModelFromConfectSchema<ConfectSchema>>,
			a: ConfectValue,
		) => Effect.Effect<ConvexReturns>;
	}): RegisteredAction<"public", ConvexValue, Promise<ConvexReturns>> =>
		actionGeneric(confectActionFunction({ args, returns, handler }));

	const internalAction = <
		ConvexValue extends DefaultFunctionArgs,
		ConfectValue,
		ConvexReturns,
		ConfectReturns,
	>({
		args,
		returns,
		handler,
	}: {
		args: Schema.Schema<ConfectValue, ConvexValue>;
		returns: Schema.Schema<ConfectReturns, ConvexReturns>;
		handler: (
			ctx: ConfectActionCtx<ConfectDataModelFromConfectSchema<ConfectSchema>>,
			a: ConfectValue,
		) => Effect.Effect<ConvexReturns>;
	}): RegisteredAction<"internal", ConvexValue, Promise<ConvexReturns>> =>
		internalActionGeneric(confectActionFunction({ args, returns, handler }));

	return {
		query,
		internalQuery,
		mutation,
		internalMutation,
		action,
		internalAction,
	};
};

const confectQueryFunction = <
	ConfectDataModel extends GenericConfectDataModel,
	ConvexArgs extends DefaultFunctionArgs,
	ConfectArgs,
	ConvexReturns,
	ConfectReturns,
>({
	databaseSchemas,
	args,
	returns,
	handler,
}: {
	databaseSchemas: DatabaseSchemasFromConfectDataModel<ConfectDataModel>;
	args: Schema.Schema<ConfectArgs, ConvexArgs>;
	returns: Schema.Schema<ConfectReturns, ConvexReturns>;
	handler: (
		ctx: ConfectQueryCtx<ConfectDataModel>,
		a: ConfectArgs,
	) => Effect.Effect<ConvexReturns>;
}) => ({
	args: compileArgsSchema(args),
	returns: compileReturnsSchema(returns),
	handler: (
		ctx: GenericQueryCtx<DataModelFromConfectDataModel<ConfectDataModel>>,
		actualArgs: ConvexArgs,
	): Promise<ConvexReturns> =>
		pipe(
			actualArgs,
			Schema.decode(args),
			Effect.orDie,
			Effect.andThen((decodedArgs) =>
				handler(makeConfectQueryCtx(ctx, databaseSchemas), decodedArgs),
			),
			Effect.andThen((convexReturns) =>
				Schema.encodeUnknown(returns)(convexReturns),
			),
			Effect.runPromise,
		),
});

const confectMutationFunction = <
	ConfectDataModel extends GenericConfectDataModel,
	ConvexValue extends DefaultFunctionArgs,
	ConfectValue,
	ConvexReturns,
	ConfectReturns,
>({
	databaseSchemas,
	args,
	returns,
	handler,
}: {
	databaseSchemas: DatabaseSchemasFromConfectDataModel<ConfectDataModel>;
	args: Schema.Schema<ConfectValue, ConvexValue>;
	returns: Schema.Schema<ConfectReturns, ConvexReturns>;
	handler: (
		ctx: ConfectMutationCtx<ConfectDataModel>,
		a: ConfectValue,
	) => Effect.Effect<ConvexReturns>;
}) => ({
	args: compileArgsSchema(args),
	returns: compileReturnsSchema(returns),
	handler: (
		ctx: GenericMutationCtx<DataModelFromConfectDataModel<ConfectDataModel>>,
		actualArgs: ConvexValue,
	): Promise<ConvexReturns> =>
		pipe(
			actualArgs,
			Schema.decode(args),
			Effect.orDie,
			Effect.andThen((decodedArgs) =>
				handler(makeConfectMutationCtx(ctx, databaseSchemas), decodedArgs),
			),
			Effect.andThen((convexReturns) =>
				Schema.encodeUnknown(returns)(convexReturns),
			),
			Effect.runPromise,
		),
});

const confectActionFunction = <
	ConfectDataModel extends GenericConfectDataModel,
	ConvexValue extends DefaultFunctionArgs,
	ConfectValue,
	ConvexReturns,
	ConfectReturns,
>({
	args,
	returns,
	handler,
}: {
	args: Schema.Schema<ConfectValue, ConvexValue>;
	returns: Schema.Schema<ConfectReturns, ConvexReturns>;
	handler: (
		ctx: ConfectActionCtx<ConfectDataModel>,
		a: ConfectValue,
	) => Effect.Effect<ConvexReturns>;
}) => ({
	args: compileArgsSchema(args),
	returns: compileReturnsSchema(returns),
	handler: (
		ctx: GenericActionCtx<DataModelFromConfectDataModel<ConfectDataModel>>,
		actualArgs: ConvexValue,
	): Promise<ConvexReturns> =>
		pipe(
			actualArgs,
			Schema.decode(args),
			Effect.orDie,
			Effect.andThen((decodedArgs) =>
				handler(makeConfectActionCtx(ctx), decodedArgs),
			),
			Effect.andThen((convexReturns) =>
				Schema.encodeUnknown(returns)(convexReturns),
			),
			Effect.runPromise,
		),
});
