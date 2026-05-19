/**
 * Simplified GlobeCommerce-style unit schemas for document codec benchmarks.
 * Mirrors `~/src/units/Quantity` and `Units` transformOrFail + BigDecimal wire encoding.
 */
import { GenericId } from "@confect/core";
import type { BigDecimal } from "effect";
import { Effect, ParseResult, Predicate, Schema } from "effect";

export const BaseUnit = Schema.Literal("Meters", "Grams", "Each");
export type BaseUnit = typeof BaseUnit.Type;

const TypeId = Symbol.for("effect-units/Quantity");

export interface Quantity<U extends BaseUnit> {
  readonly [TypeId]: typeof TypeId;
  readonly unit: U;
  readonly value: BigDecimal.BigDecimal;
}

const isQuantity =
  <U extends BaseUnit>(unit?: U) =>
  (u: unknown): u is Quantity<U> =>
    Predicate.hasProperty(u, TypeId) &&
    (unit === undefined ||
      (Predicate.hasProperty(u, "unit") && u.unit === unit));

const quantityProto = {
  [TypeId]: TypeId,
};

const makeQuantity = <U extends BaseUnit>(
  unit: U,
  value: BigDecimal.BigDecimal,
): Quantity<U> => Object.assign(Object.create(quantityProto), { unit, value });

export const QuantityFromSelf = <U extends BaseUnit>(unit: U) =>
  Schema.declare((u: unknown): u is Quantity<U> => isQuantity(unit)(u));

export const Quantity = <U extends BaseUnit>(unit: U) =>
  Schema.transformOrFail(
    Schema.Struct({
      unit: Schema.Literal(unit),
      value: Schema.String,
    }),
    QuantityFromSelf(unit),
    {
      decode: ({ unit: wireUnit, value }) =>
        Effect.gen(function* () {
          return makeQuantity(
            wireUnit,
            yield* ParseResult.decode(Schema.BigDecimal)(value),
          );
        }),
      encode: ({ unit: wireUnit, value }) =>
        Effect.gen(function* () {
          return {
            unit: wireUnit,
            value: yield* ParseResult.encode(Schema.BigDecimal)(value),
          };
        }),
    },
  );

export const Length = Quantity("Meters");
export const Mass = Quantity("Grams");
/** Count-style units (`packSize`, cartons per pallet, etc.). */
export const Units = Quantity("Each");

const dimensionStruct = <S extends Schema.Schema.Any>(quantity: S) =>
  Schema.Struct({
    length: Schema.NullOr(quantity),
    width: Schema.NullOr(quantity),
    height: Schema.NullOr(quantity),
  });

export const Dimensions = dimensionStruct(Length);

/** GlobeCommerce `CatalogProductConfiguration` table fields (without system fields). */
export const CatalogProductConfigurationFields = Schema.Struct({
  catalogProductModelId: GenericId.GenericId("catalogProductModels"),
  name: Schema.String,
  fob: Schema.NullOr(Schema.Number),
  isPackagingECommerceReady: Schema.NullOr(Schema.Boolean),
  isPackagingRetailReady: Schema.NullOr(Schema.Boolean),
  packSize: Schema.NullOr(Units),
  sellableUnitsPerMasterCarton: Schema.NullOr(Units),
  masterCartonDimensions: Dimensions,
  masterCartonGrossWeight: Schema.NullOr(Mass),
  packagingDimensions: Dimensions,
  packagingGrossWeight: Schema.NullOr(Mass),
  podDimensions: Dimensions,
  podGrossWeight: Schema.NullOr(Mass),
  masterCartonsPerPod: Schema.NullOr(Units),
  podsPerContainer: Schema.NullOr(Units),
  masterCartonsPerContainer: Schema.NullOr(Units),
  masterCartonsPerStoragePallet: Schema.NullOr(Units),
});

export type CatalogProductConfigurationWire =
  typeof CatalogProductConfigurationFields.Encoded;

const length = (value: string) => ({ unit: "Meters" as const, value });
const mass = (value: string) => ({ unit: "Grams" as const, value });
const units = (value: string) => ({ unit: "Each" as const, value });

const populatedDimensions = {
  length: length("0.45"),
  width: length("0.30"),
  height: length("0.22"),
};

/** Many `NullOr` fields set; realistic edit form payload. */
export const catalogProductConvexDocFull: CatalogProductConfigurationWire & {
  _id: string;
  _creationTime: number;
} = {
  _id: "cp7f2k8m3n4p5q6r7s8t9u0v1w2x3y4z5",
  _creationTime: 1_700_000_003_000,
  catalogProductModelId: "cm7f2k8m3n4p5q6r7s8t9u0v1w2x3y4",
  name: "12oz Insulated Tumbler — Matte Black",
  fob: 4.85,
  isPackagingECommerceReady: true,
  isPackagingRetailReady: false,
  packSize: units("1"),
  sellableUnitsPerMasterCarton: units("24"),
  masterCartonDimensions: populatedDimensions,
  masterCartonGrossWeight: mass("8.400"),
  packagingDimensions: {
    length: length("0.12"),
    width: length("0.09"),
    height: length("0.09"),
  },
  packagingGrossWeight: mass("0.520"),
  podDimensions: {
    length: length("1.20"),
    width: length("1.00"),
    height: length("1.80"),
  },
  podGrossWeight: mass("420.000"),
  masterCartonsPerPod: units("48"),
  podsPerContainer: units("10"),
  masterCartonsPerContainer: units("480"),
  masterCartonsPerStoragePallet: units("40"),
};

/** Required + name only; remaining `NullOr` fields null (list/index shape). */
export const catalogProductConvexDocSparse: CatalogProductConfigurationWire & {
  _id: string;
  _creationTime: number;
} = {
  _id: "cp8g3l9n4o5p6q7r8s9t0u1v2w3x4y5z6",
  _creationTime: 1_700_000_004_000,
  catalogProductModelId: "cm7f2k8m3n4p5q6r7s8t9u0v1w2x3y4",
  name: "Draft configuration",
  fob: null,
  isPackagingECommerceReady: null,
  isPackagingRetailReady: null,
  packSize: null,
  sellableUnitsPerMasterCarton: null,
  masterCartonDimensions: { length: null, width: null, height: null },
  masterCartonGrossWeight: null,
  packagingDimensions: { length: null, width: null, height: null },
  packagingGrossWeight: null,
  podDimensions: { length: null, width: null, height: null },
  podGrossWeight: null,
  masterCartonsPerPod: null,
  podsPerContainer: null,
  masterCartonsPerContainer: null,
  masterCartonsPerStoragePallet: null,
};
