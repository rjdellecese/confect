import { describe, expect, test } from "@effect/vitest";

import * as DocName from "@confect/cli/DocName";

describe("fromTableName", () => {
  test.each([
    ["notes", "NotesDoc"],
    ["tags", "TagsDoc"],
    ["users", "UsersDoc"],
    ["userProfiles", "UserProfilesDoc"],
    ["user_profiles", "UserProfilesDoc"],
    ["my_table", "MyTableDoc"],
    ["table2", "Table2Doc"],
    ["table_2", "Table2Doc"],
  ])("%s -> %s", (tableName, expected) => {
    expect(DocName.fromTableName(tableName)).toBe(expected);
  });

  test("folds camelCase and snake_case spellings to the same name", () => {
    expect(DocName.fromTableName("userProfiles")).toBe(
      DocName.fromTableName("user_profiles"),
    );
  });
});
