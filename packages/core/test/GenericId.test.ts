import { describe, expect, it } from "@effect/vitest";
import { Option } from "effect";
import * as GenericId from "../src/GenericId";

describe("tableName", () => {
  it("returns the table name of the GenericId", () => {
    const expectedTableName = "users" as const;
    const id = GenericId.GenericId(expectedTableName);

    const actualTableName = GenericId.tableName(id.ast);

    expect(actualTableName).toStrictEqual(Option.some(expectedTableName));
  });
});
