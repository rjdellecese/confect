import type * as Api from "@convex-dev/platform/deploymentApi";
import * as Record from "effect/Record";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

const Inclusion = Schema.Literals(["included", "excluded"]);
const Excluded = Schema.Literal("excluded");
const reserved = { _other: Schema.optionalKey(Schema.Never) };

const dictionary = Schema.declare(
  (input): input is Readonly<Record<string, unknown>> => {
    if (typeof input !== "object" || input === null) return false;
    const proto: unknown = Object.getPrototypeOf(input);
    return proto === null || proto === Object.prototype;
  },
);
const named = <F extends Schema.Struct.Fields, A extends Schema.Constraint>(
  fields: F,
  value: A,
) =>
  dictionary.pipe(
    Schema.decodeTo(
      Schema.StructWithRest(Schema.Struct(fields), [
        Schema.Record(Schema.String, value),
      ]),
    ),
  );
const node = <F extends Schema.Struct.Fields>(fields: F) =>
  dictionary.pipe(Schema.decodeTo(Schema.Struct(fields)));
const Table = node({
  default: Inclusion,
  columns: Schema.optionalKey(
    named(
      { ...reserved, _id: Schema.optionalKey(Schema.Literal("included")) },
      Inclusion,
    ),
  ),
});
const Component = node({
  default: Inclusion,
  tables: Schema.optionalKey(named(reserved, Schema.Union([Excluded, Table]))),
});
const SelectionSchema = node({
  default: Inclusion,
  components: Schema.optionalKey(
    named(reserved, Schema.Union([Excluded, Component])),
  ),
});
export type Selection = typeof SelectionSchema.Type;

const toWire = <A, B>(
  fallback: Api.InclusionDefault,
  entries: Readonly<Record<string, A>> | undefined,
  encode: (item: A) => B,
) => Object.assign(Record.map(entries ?? {}, encode), { _other: fallback });

export const encode = (value: Selection) =>
  Result.map(
    Schema.decodeResult(SelectionSchema, { onExcessProperty: "error" })(value),
    (selection): Api.Selection =>
      toWire(
        selection.default,
        selection.components,
        (component: "excluded" | typeof Component.Type) =>
          component === "excluded"
            ? component
            : toWire(
                component.default,
                component.tables,
                (table: "excluded" | typeof Table.Type) =>
                  table === "excluded"
                    ? table
                    : { ...table.columns, _other: table.default },
              ),
      ),
  );

const decodeTable = (value: Api.TableSelection) => {
  if (value === "excluded") return value;
  const { _other, ...columns } = value;
  return Record.isEmptyRecord(columns)
    ? { default: _other }
    : { default: _other, columns };
};

const decodeComponent = (value: Api.ComponentSelection) => {
  if (value === "excluded") return value;
  const { _other, ...tables } = value;
  return Record.isEmptyRecord(tables)
    ? { default: _other }
    : { default: _other, tables: Record.map(tables, decodeTable) };
};

export const decode = ({ _other, ...components }: Api.Selection): Selection =>
  Record.isEmptyRecord(components)
    ? { default: _other }
    : { default: _other, components: Record.map(components, decodeComponent) };
