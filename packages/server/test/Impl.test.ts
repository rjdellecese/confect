import { Impl } from "@confect/server";
import { describe, expect, it } from "@effect/vitest";
import { Layer } from "effect";
import api from "./mock-backend/fixtures/confect/_generated/api";
import notes from "./mock-backend/fixtures/confect/groups/notes.impl";

describe("buildForGroup", () => {
  it("builds a finalized impl from a single group layer", () => {
    const layer = Impl.buildForGroup(api, notes);
    expect(Layer.isLayer(layer)).toBe(true);
  });
});
