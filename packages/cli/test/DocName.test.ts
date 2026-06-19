import { describe, expect, test } from "@effect/vitest";

import { toDocName } from "@confect/cli/DocName";

describe("toDocName", () => {
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
    expect(toDocName(tableName)).toBe(expected);
  });

  test("folds camelCase and snake_case spellings to the same name", () => {
    expect(toDocName("userProfiles")).toBe(toDocName("user_profiles"));
  });
});
