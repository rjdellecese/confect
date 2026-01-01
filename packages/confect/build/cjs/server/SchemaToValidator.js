const require_rolldown_runtime = require('../_virtual/rolldown_runtime.js');
const require_api_GenericId = require('../api/GenericId.js');
let effect = require("effect");
let convex_values = require("convex/values");

//#region src/server/SchemaToValidator.ts
var SchemaToValidator_exports = /* @__PURE__ */ require_rolldown_runtime.__export({
	EmptyTupleIsNotSupportedError: () => EmptyTupleIsNotSupportedError,
	IndexSignaturesAreNotSupportedError: () => IndexSignaturesAreNotSupportedError,
	MixedIndexAndPropertySignaturesAreNotSupportedError: () => MixedIndexAndPropertySignaturesAreNotSupportedError,
	OptionalTupleElementsAreNotSupportedError: () => OptionalTupleElementsAreNotSupportedError,
	TopLevelMustBeObjectError: () => TopLevelMustBeObjectError,
	TopLevelMustBeObjectOrUnionError: () => TopLevelMustBeObjectOrUnionError,
	UnsupportedPropertySignatureKeyTypeError: () => UnsupportedPropertySignatureKeyTypeError,
	UnsupportedSchemaTypeError: () => UnsupportedSchemaTypeError,
	compileArgsSchema: () => compileArgsSchema,
	compileAst: () => compileAst,
	compileReturnsSchema: () => compileReturnsSchema,
	compileSchema: () => compileSchema,
	compileTableSchema: () => compileTableSchema,
	isRecursive: () => isRecursive
});
const compileArgsSchema = (argsSchema) => {
	const ast = effect.Schema.encodedSchema(argsSchema).ast;
	return (0, effect.pipe)(ast, effect.Match.value, effect.Match.tag("TypeLiteral", (typeLiteralAst) => effect.Array.isEmptyReadonlyArray(typeLiteralAst.indexSignatures) ? handlePropertySignatures(typeLiteralAst) : effect.Effect.fail(new IndexSignaturesAreNotSupportedError())), effect.Match.orElse(() => effect.Effect.fail(new TopLevelMustBeObjectError())), runSyncThrow);
};
const compileReturnsSchema = (schema) => runSyncThrow(compileAst(effect.Schema.encodedSchema(schema).ast));
const compileTableSchema = (schema) => {
	const ast = effect.Schema.encodedSchema(schema).ast;
	return (0, effect.pipe)(ast, effect.Match.value, effect.Match.tag("TypeLiteral", ({ indexSignatures }) => effect.Array.isEmptyReadonlyArray(indexSignatures) ? compileAst(ast) : effect.Effect.fail(new IndexSignaturesAreNotSupportedError())), effect.Match.tag("Union", (unionAst) => compileAst(unionAst)), effect.Match.orElse(() => effect.Effect.fail(new TopLevelMustBeObjectOrUnionError())), runSyncThrow);
};
const compileSchema = (schema) => runSyncThrow(compileAst(schema.ast));
const isRecursive = (ast) => (0, effect.pipe)(ast, effect.Match.value, effect.Match.tag("Literal", "BooleanKeyword", "StringKeyword", "NumberKeyword", "BigIntKeyword", "UnknownKeyword", "AnyKeyword", "Declaration", "UniqueSymbol", "SymbolKeyword", "UndefinedKeyword", "VoidKeyword", "NeverKeyword", "Enums", "TemplateLiteral", "ObjectKeyword", "Transformation", () => false), effect.Match.tag("Union", ({ types }) => effect.Array.some(types, (type) => isRecursive(type))), effect.Match.tag("TypeLiteral", ({ propertySignatures }) => effect.Array.some(propertySignatures, ({ type }) => isRecursive(type))), effect.Match.tag("TupleType", ({ elements: optionalElements, rest: elements }) => effect.Array.some(optionalElements, (optionalElement) => isRecursive(optionalElement.type)) || effect.Array.some(elements, (element) => isRecursive(element.type))), effect.Match.tag("Refinement", ({ from }) => isRecursive(from)), effect.Match.tag("Suspend", () => true), effect.Match.exhaustive);
const compileAst = (ast, isOptionalPropertyOfTypeLiteral = false) => isRecursive(ast) ? effect.Effect.succeed(convex_values.v.any()) : (0, effect.pipe)(ast, effect.Match.value, effect.Match.tag("Literal", ({ literal }) => (0, effect.pipe)(literal, effect.Match.value, effect.Match.whenOr(effect.Match.string, effect.Match.number, effect.Match.bigint, effect.Match.boolean, (l) => convex_values.v.literal(l)), effect.Match.when(effect.Match.null, () => convex_values.v.null()), effect.Match.exhaustive, effect.Effect.succeed)), effect.Match.tag("BooleanKeyword", () => effect.Effect.succeed(convex_values.v.boolean())), effect.Match.tag("StringKeyword", (stringAst) => require_api_GenericId.tableName(stringAst).pipe(effect.Option.match({
	onNone: () => effect.Effect.succeed(convex_values.v.string()),
	onSome: (tableName$1) => effect.Effect.succeed(convex_values.v.id(tableName$1))
}))), effect.Match.tag("NumberKeyword", () => effect.Effect.succeed(convex_values.v.float64())), effect.Match.tag("BigIntKeyword", () => effect.Effect.succeed(convex_values.v.int64())), effect.Match.tag("Union", (unionAst) => handleUnion(unionAst, isOptionalPropertyOfTypeLiteral)), effect.Match.tag("TypeLiteral", (typeLiteralAst) => handleTypeLiteral(typeLiteralAst)), effect.Match.tag("TupleType", (tupleTypeAst) => handleTupleType(tupleTypeAst)), effect.Match.tag("UnknownKeyword", "AnyKeyword", () => effect.Effect.succeed(convex_values.v.any())), effect.Match.tag("Declaration", (declaration) => effect.Effect.mapBoth(declaration.decodeUnknown(...declaration.typeParameters)(/* @__PURE__ */ new ArrayBuffer(0), {}, declaration), {
	onSuccess: () => convex_values.v.bytes(),
	onFailure: () => new UnsupportedSchemaTypeError({ schemaType: declaration._tag })
})), effect.Match.tag("Refinement", ({ from }) => compileAst(from)), effect.Match.tag("Suspend", () => effect.Effect.succeed(convex_values.v.any())), effect.Match.tag("UniqueSymbol", "SymbolKeyword", "UndefinedKeyword", "VoidKeyword", "NeverKeyword", "Enums", "TemplateLiteral", "ObjectKeyword", "Transformation", () => new UnsupportedSchemaTypeError({ schemaType: ast._tag })), effect.Match.exhaustive);
const handleUnion = ({ types: [first, second, ...rest] }, isOptionalPropertyOfTypeLiteral) => effect.Effect.gen(function* () {
	const validatorEffects = isOptionalPropertyOfTypeLiteral ? effect.Array.filterMap([
		first,
		second,
		...rest
	], (type) => effect.Predicate.not(effect.SchemaAST.isUndefinedKeyword)(type) ? effect.Option.some(compileAst(type)) : effect.Option.none()) : effect.Array.map([
		first,
		second,
		...rest
	], (type) => compileAst(type));
	const [firstValidator, secondValidator, ...restValidators] = yield* effect.Effect.all(validatorEffects);
	/* v8 ignore start */
	if (firstValidator === void 0) return yield* effect.Effect.dieMessage("First validator of union is undefined; this should be impossible.");
	else if (secondValidator === void 0) return firstValidator;
	else return convex_values.v.union(firstValidator, secondValidator, ...restValidators);
});
const handleTypeLiteral = (typeLiteralAst) => (0, effect.pipe)(typeLiteralAst.indexSignatures, effect.Array.head, effect.Option.match({
	onNone: () => effect.Effect.map(handlePropertySignatures(typeLiteralAst), convex_values.v.object),
	onSome: ({ parameter, type }) => (0, effect.pipe)(typeLiteralAst.propertySignatures, effect.Array.head, effect.Option.match({
		onNone: () => effect.Effect.map(effect.Effect.all({
			parameter_: compileAst(parameter),
			type_: compileAst(type)
		}), ({ parameter_, type_ }) => convex_values.v.record(parameter_, type_)),
		onSome: () => effect.Effect.fail(new MixedIndexAndPropertySignaturesAreNotSupportedError())
	}))
}));
const handleTupleType = ({ elements, rest }) => effect.Effect.gen(function* () {
	const restValidator = (0, effect.pipe)(rest, effect.Array.head, effect.Option.map(({ type }) => compileAst(type)), effect.Effect.flatten);
	const [f, s, ...r] = elements;
	const elementToValidator = ({ type, isOptional }) => effect.Effect.if(isOptional, {
		onTrue: () => effect.Effect.fail(new OptionalTupleElementsAreNotSupportedError()),
		onFalse: () => compileAst(type)
	});
	const arrayItemsValidator = yield* f === void 0 ? (0, effect.pipe)(restValidator, effect.Effect.catchTag("NoSuchElementException", () => effect.Effect.fail(new EmptyTupleIsNotSupportedError()))) : s === void 0 ? elementToValidator(f) : effect.Effect.gen(function* () {
		const firstValidator = yield* elementToValidator(f);
		const secondValidator = yield* elementToValidator(s);
		const restValidators = yield* effect.Effect.forEach(r, elementToValidator);
		return convex_values.v.union(firstValidator, secondValidator, ...restValidators);
	});
	return convex_values.v.array(arrayItemsValidator);
});
const handlePropertySignatures = (typeLiteralAst) => (0, effect.pipe)(typeLiteralAst.propertySignatures, effect.Effect.forEach(({ type, name, isOptional }) => {
	if (effect.String.isString(name)) return effect.Option.match(effect.Number.parse(name), {
		onNone: () => effect.Effect.gen(function* () {
			const validator = yield* compileAst(type, isOptional);
			return {
				propertyName: name,
				validator: isOptional ? convex_values.v.optional(validator) : validator
			};
		}),
		onSome: (number) => effect.Effect.fail(new UnsupportedPropertySignatureKeyTypeError({ propertyKey: number }))
	});
	else return effect.Effect.fail(new UnsupportedPropertySignatureKeyTypeError({ propertyKey: name }));
}), effect.Effect.andThen((propertyNamesWithValidators) => (0, effect.pipe)(propertyNamesWithValidators, effect.Array.reduce({}, (acc, { propertyName, validator }) => ({
	[propertyName]: validator,
	...acc
})), effect.Effect.succeed)));
const runSyncThrow = (effect$1) => (0, effect.pipe)(effect$1, effect.Effect.runSyncExit, effect.Exit.match({
	onSuccess: (validator) => validator,
	onFailure: (cause) => {
		throw effect.Cause.squash(cause);
	}
}));
var TopLevelMustBeObjectError = class extends effect.Data.TaggedError("TopLevelMustBeObjectError") {
	/* v8 ignore start */
	get message() {
		return "Top level schema must be an object";
	}
};
var TopLevelMustBeObjectOrUnionError = class extends effect.Data.TaggedError("TopLevelMustBeObjectOrUnionError") {
	/* v8 ignore start */
	get message() {
		return "Top level schema must be an object or a union";
	}
};
var UnsupportedPropertySignatureKeyTypeError = class extends effect.Data.TaggedError("UnsupportedPropertySignatureKeyTypeError") {
	/* v8 ignore start */
	get message() {
		return `Unsupported property signature '${this.propertyKey.toString()}'. Property is of type '${typeof this.propertyKey}' but only 'string' properties are supported.`;
	}
};
var EmptyTupleIsNotSupportedError = class extends effect.Data.TaggedError("EmptyTupleIsNotSupportedError") {
	/* v8 ignore start */
	get message() {
		return "Tuple must have at least one element";
	}
};
var UnsupportedSchemaTypeError = class extends effect.Data.TaggedError("UnsupportedSchemaTypeError") {
	/* v8 ignore start */
	get message() {
		return `Unsupported schema type '${this.schemaType}'`;
	}
};
var IndexSignaturesAreNotSupportedError = class extends effect.Data.TaggedError("IndexSignaturesAreNotSupportedError") {
	/* v8 ignore start */
	get message() {
		return "Index signatures are not supported";
	}
};
var MixedIndexAndPropertySignaturesAreNotSupportedError = class extends effect.Data.TaggedError("MixedIndexAndPropertySignaturesAreNotSupportedError") {
	/* v8 ignore start */
	get message() {
		return "Mixed index and property signatures are not supported";
	}
};
var OptionalTupleElementsAreNotSupportedError = class extends effect.Data.TaggedError("OptionalTupleElementsAreNotSupportedError") {
	/* v8 ignore start */
	get message() {
		return "Optional tuple elements are not supported";
	}
};

//#endregion
exports.EmptyTupleIsNotSupportedError = EmptyTupleIsNotSupportedError;
exports.IndexSignaturesAreNotSupportedError = IndexSignaturesAreNotSupportedError;
exports.MixedIndexAndPropertySignaturesAreNotSupportedError = MixedIndexAndPropertySignaturesAreNotSupportedError;
exports.OptionalTupleElementsAreNotSupportedError = OptionalTupleElementsAreNotSupportedError;
Object.defineProperty(exports, 'SchemaToValidator_exports', {
  enumerable: true,
  get: function () {
    return SchemaToValidator_exports;
  }
});
exports.TopLevelMustBeObjectError = TopLevelMustBeObjectError;
exports.TopLevelMustBeObjectOrUnionError = TopLevelMustBeObjectOrUnionError;
exports.UnsupportedPropertySignatureKeyTypeError = UnsupportedPropertySignatureKeyTypeError;
exports.UnsupportedSchemaTypeError = UnsupportedSchemaTypeError;
exports.compileArgsSchema = compileArgsSchema;
exports.compileAst = compileAst;
exports.compileReturnsSchema = compileReturnsSchema;
exports.compileSchema = compileSchema;
exports.compileTableSchema = compileTableSchema;
exports.isRecursive = isRecursive;
//# sourceMappingURL=SchemaToValidator.cjs.map