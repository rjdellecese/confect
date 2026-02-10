import { GroupSpec, Spec } from "@confect/core";
import { describe, expect, test } from "@effect/vitest";
import { Option } from "effect";

import * as GroupPath from "../src/GroupPath";

describe("GroupPath.getGroupSpec", () => {
  const makeGroupPathObj = (pathSegments: readonly [string, ...string[]]) =>
    GroupPath.make(pathSegments);

  test("returns none for empty spec", () => {
    const spec = Spec.make();

    const result = GroupPath.getGroupSpec(
      spec,
      makeGroupPathObj(["nonexistent"]),
    );

    expect(Option.isNone(result)).toBe(true);
  });

  test("returns none when group does not exist", () => {
    const spec = Spec.make().add(GroupSpec.make("myGroup"));

    const result = GroupPath.getGroupSpec(
      spec,
      makeGroupPathObj(["nonexistent"]),
    );

    expect(Option.isNone(result)).toBe(true);
  });

  test("returns the group for a single-element path", () => {
    const myGroup = GroupSpec.make("myGroup");
    const spec = Spec.make().add(myGroup);

    const result = GroupPath.getGroupSpec(spec, makeGroupPathObj(["myGroup"]));

    expect(Option.isSome(result)).toBe(true);
    expect(Option.getOrThrow(result).name).toBe("myGroup");
  });

  test("returns none when nested group does not exist", () => {
    const outer = GroupSpec.make("outer");
    const spec = Spec.make().add(outer);

    const result = GroupPath.getGroupSpec(
      spec,
      makeGroupPathObj(["outer", "nonexistent"]),
    );

    expect(Option.isNone(result)).toBe(true);
  });

  test("returns the nested group for a two-element path", () => {
    const inner = GroupSpec.make("inner");
    const outer = GroupSpec.make("outer").addGroup(inner);
    const spec = Spec.make().add(outer);

    const result = GroupPath.getGroupSpec(
      spec,
      makeGroupPathObj(["outer", "inner"]),
    );

    expect(Option.isSome(result)).toBe(true);
    expect(Option.getOrThrow(result).name).toBe("inner");
  });

  test("returns the deeply nested group for a three-element path", () => {
    const level3 = GroupSpec.make("level3");
    const level2 = GroupSpec.make("level2").addGroup(level3);
    const level1 = GroupSpec.make("level1").addGroup(level2);
    const spec = Spec.make().add(level1);

    const result = GroupPath.getGroupSpec(
      spec,
      makeGroupPathObj(["level1", "level2", "level3"]),
    );

    expect(Option.isSome(result)).toBe(true);
    expect(Option.getOrThrow(result).name).toBe("level3");
  });

  test("returns none when path is partially valid but final segment does not exist", () => {
    const level2 = GroupSpec.make("level2");
    const level1 = GroupSpec.make("level1").addGroup(level2);
    const spec = Spec.make().add(level1);

    const result = GroupPath.getGroupSpec(
      spec,
      makeGroupPathObj(["level1", "level2", "nonexistent"]),
    );

    expect(Option.isNone(result)).toBe(true);
  });

  test("returns none when intermediate path segment does not exist", () => {
    const level2 = GroupSpec.make("level2");
    const level1 = GroupSpec.make("level1").addGroup(level2);
    const spec = Spec.make().add(level1);

    const result = GroupPath.getGroupSpec(
      spec,
      makeGroupPathObj(["level1", "nonexistent", "level2"]),
    );

    expect(Option.isNone(result)).toBe(true);
  });

  test("returns correct group when multiple groups exist at the same level", () => {
    const notes = GroupSpec.make("notes");
    const random = GroupSpec.make("random");
    const notesAndRandom = GroupSpec.make("notesAndRandom")
      .addGroup(notes)
      .addGroup(random);
    const spec = Spec.make().add(notesAndRandom);

    const notesResult = GroupPath.getGroupSpec(
      spec,
      makeGroupPathObj(["notesAndRandom", "notes"]),
    );
    const randomResult = GroupPath.getGroupSpec(
      spec,
      makeGroupPathObj(["notesAndRandom", "random"]),
    );

    expect(Option.isSome(notesResult)).toBe(true);
    expect(Option.getOrThrow(notesResult).name).toBe("notes");
    expect(Option.isSome(randomResult)).toBe(true);
    expect(Option.getOrThrow(randomResult).name).toBe("random");
  });

  test("returns correct group when multiple top-level groups exist", () => {
    const users = GroupSpec.make("users");
    const posts = GroupSpec.make("posts");
    const spec = Spec.make().add(users).add(posts);

    const usersResult = GroupPath.getGroupSpec(
      spec,
      makeGroupPathObj(["users"]),
    );
    const postsResult = GroupPath.getGroupSpec(
      spec,
      makeGroupPathObj(["posts"]),
    );

    expect(Option.isSome(usersResult)).toBe(true);
    expect(Option.getOrThrow(usersResult).name).toBe("users");
    expect(Option.isSome(postsResult)).toBe(true);
    expect(Option.getOrThrow(postsResult).name).toBe("posts");
  });
});
