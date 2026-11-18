import * as Array from "effect/Array";
import * as Schema from "effect/Schema";
import * as String from "effect/String";

export const RelativeModulePath = Schema.String.check(
  Schema.makeFilter(
    (value) =>
      !/^[A-Za-z]:/.test(value) &&
      !String.includes("\0")(value) &&
      Array.every(
        String.split(value, /[/\\]/),
        (segment) =>
          String.isNonEmpty(segment) && segment !== "." && segment !== "..",
      ),
  ),
).pipe(Schema.brand("@confect/cli/RelativeModulePath"));

export type RelativeModulePath = typeof RelativeModulePath.Type;

export const withSuffix = (suffix: string) =>
  RelativeModulePath.check(
    Schema.makeFilter((value) => {
      const filename = Array.lastNonEmpty(String.split(value, /[/\\]/));
      return (
        String.endsWith(suffix)(filename) && filename.length > suffix.length
      );
    }),
  );
