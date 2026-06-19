import * as Array from "effect/Array";
import * as Brand from "effect/Brand";
import { pipe } from "effect/Function";
import * as String from "effect/String";

/**
 * The name of a table's generated document interface in
 * `confect/_generated/docs.ts` (e.g. `UserProfilesDoc`). Branded so it can't be
 * confused with an arbitrary string — construct it with {@link fromTableName}.
 */
export type DocName = string & Brand.Brand<"DocName">;

const DocName = Brand.nominal<DocName>();

/**
 * Convert a Convex table name to the name of its generated document interface
 * in `confect/_generated/docs.ts`.
 *
 * The table name is split on underscores and the first letter of each segment
 * is upper-cased, then a `Doc` suffix is appended — so both `snake_case` and
 * `camelCase` spellings of a table fold to the same idiomatic PascalCase type
 * name (`user_profiles` and `userProfiles` both become `UserProfilesDoc`).
 * That folding can make two distinct tables map to the same document name;
 * codegen guards against it (see `validateNoDocNameCollisions`).
 *
 * Note this name is purely cosmetic: the `Docs` registry is keyed by the
 * verbatim table name, which is what document lookups index through.
 */
export const fromTableName = (tableName: string): DocName =>
  DocName(
    pipe(
      tableName,
      String.split("_"),
      Array.filter(String.isNonEmpty),
      Array.map(String.capitalize),
      Array.join(""),
      String.concat("Doc"),
    ),
  );
