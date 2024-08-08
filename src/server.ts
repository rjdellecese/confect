import * as Schema from "@effect/schema/Schema";
import {
	type DefaultFunctionArgs,
	type GenericActionCtx,
	type GenericMutationCtx,
	type GenericQueryCtx,
	type GenericSchema,
	type PublicHttpAction,
	type RegisteredAction,
	type RegisteredMutation,
	type RegisteredQuery,
	actionGeneric,
	httpActionGeneric,
	internalActionGeneric,
	internalMutationGeneric,
	internalQueryGeneric,
	mutationGeneric,
	queryGeneric,
} from "convex/server";
import { Effect, pipe } from "effect";

import {
	type ConfectActionCtx,
	type ConfectMutationCtx,
	type ConfectQueryCtx,
	makeConfectActionCtx,
	makeConfectMutationCtx,
	makeConfectQueryCtx,
} from "~/src/ctx";
import type {
	DataModelFromConfectDataModel,
	GenericConfectDataModel,
} from "~/src/data-model";
import {
	type DatabaseSchemasFromConfectDataModel,
	databaseSchemasFromConfectSchema,
} from "~/src/database";
import type {
	ConfectDataModelFromConfectSchema,
	ConfectSchemaDefinition,
	GenericConfectSchema,
} from "~/src/schema";
import { compileArgsSchema } from "./schema-to-validator";

export const confectServer = <
	ConvexSchema extends GenericSchema,
	ConfectSchema extends GenericConfectSchema,
>(
	confectSchemaDefinition: ConfectSchemaDefinition<ConvexSchema, ConfectSchema>,
) => {
	const databaseSchemas = databaseSchemasFromConfectSchema(
		confectSchemaDefinition.confectSchema,
	);

	const query = <
		ConvexValue extends DefaultFunctionArgs,
		ConfectValue,
		Output,
	>({
		args,
		handler,
	}: {
		args: Schema.Schema<ConfectValue, ConvexValue>;
		handler: (
			ctx: ConfectQueryCtx<ConfectDataModelFromConfectSchema<ConfectSchema>>,
			a: ConfectValue,
		) => Effect.Effect<Output>;
	}): RegisteredQuery<"public", ConvexValue, Promise<Output>> =>
		queryGeneric(confectQueryFunction({ databaseSchemas, args, handler }));

	const internalQuery = <
		ConvexValue extends DefaultFunctionArgs,
		Confectvalue,
		Output,
	>({
		args,
		handler,
	}: {
		args: Schema.Schema<Confectvalue, ConvexValue>;
		handler: (
			ctx: ConfectQueryCtx<ConfectDataModelFromConfectSchema<ConfectSchema>>,
			a: Confectvalue,
		) => Effect.Effect<Output>;
	}): RegisteredQuery<"internal", ConvexValue, Promise<Output>> =>
		internalQueryGeneric(
			confectQueryFunction({ databaseSchemas, args, handler }),
		);

	const mutation = <
		ConvexValue extends DefaultFunctionArgs,
		ConfectValue,
		Output,
	>({
		args,
		handler,
	}: {
		args: Schema.Schema<ConfectValue, ConvexValue>;
		handler: (
			ctx: ConfectMutationCtx<ConfectDataModelFromConfectSchema<ConfectSchema>>,
			a: ConfectValue,
		) => Effect.Effect<Output>;
	}): RegisteredMutation<"public", ConvexValue, Promise<Output>> =>
		mutationGeneric(effectMutationFunction({ databaseSchemas, args, handler }));

	const internalMutation = <
		ConvexValue extends DefaultFunctionArgs,
		ConfectValue,
		Output,
	>({
		args,
		handler,
	}: {
		args: Schema.Schema<ConfectValue, ConvexValue>;
		handler: (
			ctx: ConfectMutationCtx<ConfectDataModelFromConfectSchema<ConfectSchema>>,
			a: ConfectValue,
		) => Effect.Effect<Output>;
	}): RegisteredMutation<"internal", ConvexValue, Promise<Output>> =>
		internalMutationGeneric(
			effectMutationFunction({ databaseSchemas, args, handler }),
		);

	const action = <
		ConvexValue extends DefaultFunctionArgs,
		ConfectValue,
		Output,
	>({
		args,
		handler,
	}: {
		args: Schema.Schema<ConfectValue, ConvexValue>;
		handler: (
			ctx: ConfectActionCtx<ConfectDataModelFromConfectSchema<ConfectSchema>>,
			a: ConfectValue,
		) => Effect.Effect<Output>;
	}): RegisteredAction<"public", ConvexValue, Promise<Output>> =>
		actionGeneric(effectActionFunction({ args, handler }));

	const internalAction = <
		ConvexValue extends DefaultFunctionArgs,
		ConfectValue,
		Output,
	>({
		args,
		handler,
	}: {
		args: Schema.Schema<ConfectValue, ConvexValue>;
		handler: (
			ctx: ConfectActionCtx<ConfectDataModelFromConfectSchema<ConfectSchema>>,
			a: ConfectValue,
		) => Effect.Effect<Output>;
	}): RegisteredAction<"internal", ConvexValue, Promise<Output>> =>
		internalActionGeneric(effectActionFunction({ args, handler }));

	const httpAction = (
		handler: (
			ctx: ConfectActionCtx<ConfectDataModelFromConfectSchema<ConfectSchema>>,
			request: Request,
		) => Effect.Effect<Response>,
	): PublicHttpAction =>
		// @ts-expect-error
		httpActionGeneric(effectHttpActionFunction({ handler }));

	return {
		query,
		internalQuery,
		mutation,
		internalMutation,
		action,
		internalAction,
		httpAction,
	};
};

const confectQueryFunction = <
	ConfectDataModel extends GenericConfectDataModel,
	ConvexValue extends DefaultFunctionArgs,
	ConfectValue,
	Output,
>({
	databaseSchemas,
	args,
	handler,
}: {
	databaseSchemas: DatabaseSchemasFromConfectDataModel<ConfectDataModel>;
	args: Schema.Schema<ConfectValue, ConvexValue>;
	handler: (
		ctx: ConfectQueryCtx<ConfectDataModel>,
		a: ConfectValue,
	) => Effect.Effect<Output>;
}) => ({
	args: compileArgsSchema(args),
	handler: (
		ctx: GenericQueryCtx<DataModelFromConfectDataModel<ConfectDataModel>>,
		actualArgs: ConvexValue,
	): Promise<Output> =>
		pipe(
			actualArgs,
			Schema.decode(args),
			Effect.orDie,
			Effect.andThen((decodedArgs) =>
				handler(makeConfectQueryCtx(ctx, databaseSchemas), decodedArgs),
			),
			Effect.runPromise,
		),
});

const effectMutationFunction = <
	ConfectDataModel extends GenericConfectDataModel,
	ConvexValue extends DefaultFunctionArgs,
	ConfectValue,
	Output,
>({
	databaseSchemas,
	args,
	handler,
}: {
	databaseSchemas: DatabaseSchemasFromConfectDataModel<ConfectDataModel>;
	args: Schema.Schema<ConfectValue, ConvexValue>;
	handler: (
		ctx: ConfectMutationCtx<ConfectDataModel>,
		a: ConfectValue,
	) => Effect.Effect<Output>;
}) => ({
	args: compileArgsSchema(args),
	handler: (
		ctx: GenericMutationCtx<DataModelFromConfectDataModel<ConfectDataModel>>,
		actualArgs: ConvexValue,
	): Promise<Output> =>
		pipe(
			actualArgs,
			Schema.decode(args),
			Effect.orDie,
			Effect.andThen((decodedArgs) =>
				handler(makeConfectMutationCtx(ctx, databaseSchemas), decodedArgs),
			),
			Effect.runPromise,
		),
});

const effectActionFunction = <
	ConfectDataModel extends GenericConfectDataModel,
	ConvexValue extends DefaultFunctionArgs,
	ConfectValue,
	Output,
>({
	args,
	handler,
}: {
	args: Schema.Schema<ConfectValue, ConvexValue>;
	handler: (
		ctx: ConfectActionCtx<ConfectDataModel>,
		a: ConfectValue,
	) => Effect.Effect<Output>;
}) => ({
	args: compileArgsSchema(args),
	handler: (
		ctx: GenericActionCtx<DataModelFromConfectDataModel<ConfectDataModel>>,
		actualArgs: ConvexValue,
	): Promise<Output> =>
		pipe(
			actualArgs,
			Schema.decode(args),
			Effect.orDie,
			Effect.andThen((decodedArgs) =>
				handler(makeConfectActionCtx(ctx), decodedArgs),
			),
			Effect.runPromise,
		),
});

const effectHttpActionFunction =
	<ConfectDataModel extends GenericConfectDataModel>({
		handler,
	}: {
		handler: (
			ctx: ConfectActionCtx<ConfectDataModel>,
			request: Request,
		) => Effect.Effect<Response>;
	}) =>
	(
		ctx: GenericActionCtx<DataModelFromConfectDataModel<ConfectDataModel>>,
		request: Request,
	): Promise<Response> =>
		Effect.runPromise(handler(makeConfectActionCtx(ctx), request));

// TODO: Need `ConfectDoc<TableName>` type
