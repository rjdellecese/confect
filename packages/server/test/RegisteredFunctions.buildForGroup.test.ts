import { describe, expect, it } from "@effect/vitest";
import { Layer } from "effect";
import {
  Impl,
  RegisteredConvexFunction,
  RegisteredFunctions,
} from "@confect/server";
import api from "./mock-backend/fixtures/confect/_generated/api";
import notes from "./mock-backend/fixtures/confect/groups/notes.impl";

describe("RegisteredFunctions.buildForGroup", () => {
  it("registers only the requested group", () => {
    const registered = RegisteredFunctions.buildForGroup(
      api,
      "groups.notes",
      notes,
      RegisteredConvexFunction.make,
    );

    expect(registered.list).toBeDefined();
    expect(registered.insert).toBeDefined();
  });
});

describe("Impl.buildForGroup", () => {
  it("builds a finalized impl from a single group layer", () => {
    const layer = Impl.buildForGroup(api, notes);
    expect(Layer.isLayer(layer)).toBe(true);
  });
});
