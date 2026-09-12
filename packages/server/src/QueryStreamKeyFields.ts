import * as Array from "effect/Array";
import * as Data from "effect/Data";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

/**
 * @experimental
 */
export const Names = Schema.Array(Schema.String);

/**
 * @experimental
 */
export type Names = typeof Names.Type;

/**
 * @experimental
 */
export const Equivalence = Schema.toEquivalence(Names);

type Field = Data.TaggedEnum<{
  Named: { readonly name: string };
  ImplicitId: {};
}>;

const Field = Data.taggedEnum<Field>();

/**
 * @experimental
 */
export class QueryStreamKeyFields extends Data.Class<{
  readonly fields: ReadonlyArray<Field>;
}> {}

/**
 * @experimental
 */
export const fromIndex = (names: Names): QueryStreamKeyFields => {
  const fields = Array.map(names, (name) => Field.Named({ name }));
  return new QueryStreamKeyFields({
    fields: Option.exists(Array.last(names), (name) => name === "_id")
      ? fields
      : Array.append(fields, Field.ImplicitId()),
  });
};

/**
 * @experimental
 */
export const names = (self: QueryStreamKeyFields): Names =>
  Array.map(
    self.fields,
    Field.$match({
      Named: ({ name }) => name,
      ImplicitId: () => "_id",
    }),
  );

/**
 * @experimental
 */
export const drop = (
  self: QueryStreamKeyFields,
  count: number,
): QueryStreamKeyFields =>
  new QueryStreamKeyFields({ fields: Array.drop(self.fields, count) });

/**
 * @experimental
 */
export const concat = (
  self: QueryStreamKeyFields,
  that: QueryStreamKeyFields,
): QueryStreamKeyFields =>
  new QueryStreamKeyFields({
    fields: Array.appendAll(self.fields, that.fields),
  });

/**
 * @experimental
 */
export const visibleKeyFields = (self: QueryStreamKeyFields): Names =>
  Array.map(Array.filter(self.fields, Field.$is("Named")), ({ name }) => name);

/**
 * @experimental
 */
export const runtimePrefixLength = (
  self: QueryStreamKeyFields,
  visibleLength: number,
): Result.Result<number, Error> => {
  if (visibleLength === 0) return Result.succeed(0);
  let remaining = visibleLength;
  for (const [index, field] of self.fields.entries()) {
    if (Field.$is("Named")(field) && --remaining === 0) {
      return Result.succeed(index + 1);
    }
  }
  return Result.fail(
    new Error(
      `QueryStream: prefix length ${visibleLength} exceeds the order key ([${Array.join(names(self), ", ")}])`,
    ),
  );
};

/**
 * @experimental
 */
export const rename = (
  self: QueryStreamKeyFields,
  key: Names,
): Result.Result<QueryStreamKeyFields, Error> => {
  const visible = visibleKeyFields(self);
  if (key.length !== visible.length) {
    return Result.fail(
      new Error(
        `QueryStream.renameKey: key ([${Array.join(key, ", ")}]) must have as many fields as the stream's order key ([${Array.join(visible, ", ")}])`,
      ),
    );
  }
  let index = 0;
  return Result.succeed(
    new QueryStreamKeyFields({
      fields: Array.map(
        self.fields,
        Field.$match({
          Named: () => Field.Named({ name: Array.getUnsafe(key, index++) }),
          ImplicitId: () => Field.ImplicitId(),
        }),
      ),
    }),
  );
};
