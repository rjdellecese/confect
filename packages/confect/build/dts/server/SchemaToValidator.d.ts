import { GenericId as GenericId$1 } from "../api/GenericId.js";
import { DeepMutable, IsAny, IsOptional, IsRecordType, IsRecursive, IsUnion, IsValueLiteral, TypeError, UnionToTuple } from "../internal/typeUtils.js";
import { Cause, Effect, Schema, SchemaAST } from "effect";
import { OptionalProperty, PropertyValidators, VAny, VArray, VBoolean, VBytes, VFloat64, VId, VInt64, VLiteral, VNull, VObject, VOptional, VRecord, VString, VUnion, Validator } from "convex/values";
import * as effect_Types0 from "effect/Types";

//#region src/server/SchemaToValidator.d.ts
declare namespace SchemaToValidator_d_exports {
  export { EmptyTupleIsNotSupportedError, IndexSignaturesAreNotSupportedError, MixedIndexAndPropertySignaturesAreNotSupportedError, OptionalTupleElementsAreNotSupportedError, ReadonlyRecordValue, ReadonlyValue, TableSchemaToTableValidator, TopLevelMustBeObjectError, TopLevelMustBeObjectOrUnionError, UndefinedOrValueToValidator, UnsupportedPropertySignatureKeyTypeError, UnsupportedSchemaTypeError, ValueToValidator, compileArgsSchema, compileAst, compileReturnsSchema, compileSchema, compileTableSchema, isRecursive };
}
declare const compileArgsSchema: <ConfectValue, ConvexValue>(argsSchema: Schema.Schema<ConfectValue, ConvexValue>) => PropertyValidators;
declare const compileReturnsSchema: <ConfectValue, ConvexValue>(schema: Schema.Schema<ConfectValue, ConvexValue>) => Validator<any, any, any>;
/**
 * Convert a table `Schema` to a table `Validator`.
 */
type TableSchemaToTableValidator<TableSchema extends Schema.Schema.AnyNoContext> = ValueToValidator<TableSchema["Encoded"]> extends infer Vd extends VObject<any, any, any, any> | VUnion<any, any, any, any> ? Vd : never;
declare const compileTableSchema: <TableSchema extends Schema.Schema.AnyNoContext>(schema: TableSchema) => TableSchemaToTableValidator<TableSchema>;
type ReadonlyValue = string | number | bigint | boolean | ArrayBuffer | ReadonlyArrayValue | ReadonlyRecordValue | null;
type ReadonlyArrayValue = readonly ReadonlyValue[];
type ReadonlyRecordValue = {
  readonly [key: string]: ReadonlyValue | undefined;
};
type ValueToValidator<Vl$1> = IsRecursive<Vl$1> extends true ? VAny : [Vl$1] extends [never] ? never : IsAny<Vl$1> extends true ? VAny : [Vl$1] extends [ReadonlyValue] ? Vl$1 extends {
  __tableName: infer TableName extends string;
} ? VId<GenericId$1<TableName>> : IsValueLiteral<Vl$1> extends true ? VLiteral<Vl$1> : Vl$1 extends null ? VNull : Vl$1 extends number ? VFloat64 : Vl$1 extends bigint ? VInt64 : Vl$1 extends boolean ? VBoolean : Vl$1 extends string ? VString : Vl$1 extends ArrayBuffer ? VBytes : Vl$1 extends ReadonlyArray<ReadonlyValue> ? ArrayValueToValidator<Vl$1> : Vl$1 extends ReadonlyRecordValue ? RecordValueToValidator<Vl$1> : IsUnion<Vl$1> extends true ? UnionValueToValidator<Vl$1> : TypeError<"Unexpected value", Vl$1> : TypeError<"Provided value is not a valid Convex value", Vl$1>;
type ArrayValueToValidator<Vl$1 extends ReadonlyArray<ReadonlyValue>> = Vl$1 extends ReadonlyArray<infer El extends ReadonlyValue> ? ValueToValidator<El> extends infer Vd extends Validator<any, any, any> ? VArray<DeepMutable<El[]>, Vd> : never : never;
type RecordValueToValidator<Vl$1> = Vl$1 extends ReadonlyRecordValue ? { -readonly [K in keyof Vl$1]-?: IsAny<Vl$1[K]> extends true ? IsOptional<Vl$1, K> extends true ? VOptional<VAny> : VAny : UndefinedOrValueToValidator<Vl$1[K]> } extends infer VdRecord extends Record<string, any> ? { -readonly [K in keyof Vl$1]: DeepMutable<Vl$1[K]> } extends infer VlRecord extends Record<string, any> ? IsRecordType<VlRecord> extends true ? VRecord<VlRecord, VString, VdRecord[keyof VdRecord]> : VObject<VlRecord, VdRecord> : never : never : never;
type UndefinedOrValueToValidator<Vl$1 extends ReadonlyValue | undefined> = undefined extends Vl$1 ? [Vl$1] extends [(infer Val extends ReadonlyValue) | undefined] ? ValueToValidator<Val> extends infer Vd extends Validator<any, OptionalProperty, any> ? VOptional<Vd> : never : never : Vl$1 extends ReadonlyValue ? ValueToValidator<Vl$1> : never;
type UnionValueToValidator<Vl$1 extends ReadonlyValue> = [Vl$1] extends [ReadonlyValue] ? IsUnion<Vl$1> extends true ? UnionToTuple<Vl$1> extends infer VlTuple extends ReadonlyArray<ReadonlyValue> ? ValueTupleToValidatorTuple<VlTuple> extends infer VdTuple extends Validator<any, "required", any>[] ? VUnion<DeepMutable<Vl$1>, VdTuple> : TypeError<"Failed to convert value tuple to validator tuple"> : TypeError<"Failed to convert union to tuple"> : TypeError<"Expected a union of values, but got a single value instead"> : TypeError<"Provided value is not a valid Convex value">;
type ValueTupleToValidatorTuple<VlTuple$1 extends ReadonlyArray<ReadonlyValue>> = VlTuple$1 extends [true, false, ...infer VlRest extends ReadonlyArray<ReadonlyValue>] | [false, true, ...infer VlRest extends ReadonlyArray<ReadonlyValue>] ? ValueTupleToValidatorTuple<VlRest> extends infer VdRest extends Validator<any, any, any>[] ? [VBoolean<boolean>, ...VdRest] : never : VlTuple$1 extends [infer Vl extends ReadonlyValue, ...infer VlRest extends ReadonlyArray<ReadonlyValue>] ? ValueToValidator<Vl> extends infer Vd extends Validator<any, any, any> ? ValueTupleToValidatorTuple<VlRest> extends infer VdRest extends Validator<any, "required", any>[] ? [Vd, ...VdRest] : never : never : [];
declare const compileSchema: <T, E>(schema: Schema.Schema<T, E>) => ValueToValidator<(typeof schema)["Encoded"]>;
declare const isRecursive: (ast: SchemaAST.AST) => boolean;
declare const compileAst: (ast: SchemaAST.AST, isOptionalPropertyOfTypeLiteral?: boolean) => Effect.Effect<Validator<any, any, any>, UnsupportedSchemaTypeError | UnsupportedPropertySignatureKeyTypeError | IndexSignaturesAreNotSupportedError | MixedIndexAndPropertySignaturesAreNotSupportedError | OptionalTupleElementsAreNotSupportedError | EmptyTupleIsNotSupportedError>;
declare const TopLevelMustBeObjectError_base: new <A extends Record<string, any> = {}>(args: effect_Types0.Equals<A, {}> extends true ? void : { readonly [P in keyof A as P extends "_tag" ? never : P]: A[P] }) => Cause.YieldableError & {
  readonly _tag: "TopLevelMustBeObjectError";
} & Readonly<A>;
declare class TopLevelMustBeObjectError extends TopLevelMustBeObjectError_base {
  get message(): string;
}
declare const TopLevelMustBeObjectOrUnionError_base: new <A extends Record<string, any> = {}>(args: effect_Types0.Equals<A, {}> extends true ? void : { readonly [P in keyof A as P extends "_tag" ? never : P]: A[P] }) => Cause.YieldableError & {
  readonly _tag: "TopLevelMustBeObjectOrUnionError";
} & Readonly<A>;
declare class TopLevelMustBeObjectOrUnionError extends TopLevelMustBeObjectOrUnionError_base {
  get message(): string;
}
declare const UnsupportedPropertySignatureKeyTypeError_base: new <A extends Record<string, any> = {}>(args: effect_Types0.Equals<A, {}> extends true ? void : { readonly [P in keyof A as P extends "_tag" ? never : P]: A[P] }) => Cause.YieldableError & {
  readonly _tag: "UnsupportedPropertySignatureKeyTypeError";
} & Readonly<A>;
declare class UnsupportedPropertySignatureKeyTypeError extends UnsupportedPropertySignatureKeyTypeError_base<{
  readonly propertyKey: number | symbol;
}> {
  get message(): string;
}
declare const EmptyTupleIsNotSupportedError_base: new <A extends Record<string, any> = {}>(args: effect_Types0.Equals<A, {}> extends true ? void : { readonly [P in keyof A as P extends "_tag" ? never : P]: A[P] }) => Cause.YieldableError & {
  readonly _tag: "EmptyTupleIsNotSupportedError";
} & Readonly<A>;
declare class EmptyTupleIsNotSupportedError extends EmptyTupleIsNotSupportedError_base {
  get message(): string;
}
declare const UnsupportedSchemaTypeError_base: new <A extends Record<string, any> = {}>(args: effect_Types0.Equals<A, {}> extends true ? void : { readonly [P in keyof A as P extends "_tag" ? never : P]: A[P] }) => Cause.YieldableError & {
  readonly _tag: "UnsupportedSchemaTypeError";
} & Readonly<A>;
declare class UnsupportedSchemaTypeError extends UnsupportedSchemaTypeError_base<{
  readonly schemaType: SchemaAST.AST["_tag"];
}> {
  get message(): string;
}
declare const IndexSignaturesAreNotSupportedError_base: new <A extends Record<string, any> = {}>(args: effect_Types0.Equals<A, {}> extends true ? void : { readonly [P in keyof A as P extends "_tag" ? never : P]: A[P] }) => Cause.YieldableError & {
  readonly _tag: "IndexSignaturesAreNotSupportedError";
} & Readonly<A>;
declare class IndexSignaturesAreNotSupportedError extends IndexSignaturesAreNotSupportedError_base {
  get message(): string;
}
declare const MixedIndexAndPropertySignaturesAreNotSupportedError_base: new <A extends Record<string, any> = {}>(args: effect_Types0.Equals<A, {}> extends true ? void : { readonly [P in keyof A as P extends "_tag" ? never : P]: A[P] }) => Cause.YieldableError & {
  readonly _tag: "MixedIndexAndPropertySignaturesAreNotSupportedError";
} & Readonly<A>;
declare class MixedIndexAndPropertySignaturesAreNotSupportedError extends MixedIndexAndPropertySignaturesAreNotSupportedError_base {
  get message(): string;
}
declare const OptionalTupleElementsAreNotSupportedError_base: new <A extends Record<string, any> = {}>(args: effect_Types0.Equals<A, {}> extends true ? void : { readonly [P in keyof A as P extends "_tag" ? never : P]: A[P] }) => Cause.YieldableError & {
  readonly _tag: "OptionalTupleElementsAreNotSupportedError";
} & Readonly<A>;
declare class OptionalTupleElementsAreNotSupportedError extends OptionalTupleElementsAreNotSupportedError_base {
  get message(): string;
}
//#endregion
export { EmptyTupleIsNotSupportedError, IndexSignaturesAreNotSupportedError, MixedIndexAndPropertySignaturesAreNotSupportedError, OptionalTupleElementsAreNotSupportedError, ReadonlyRecordValue, ReadonlyValue, SchemaToValidator_d_exports, TableSchemaToTableValidator, TopLevelMustBeObjectError, TopLevelMustBeObjectOrUnionError, UndefinedOrValueToValidator, UnsupportedPropertySignatureKeyTypeError, UnsupportedSchemaTypeError, ValueToValidator, compileArgsSchema, compileAst, compileReturnsSchema, compileSchema, compileTableSchema, isRecursive };
//# sourceMappingURL=SchemaToValidator.d.ts.map