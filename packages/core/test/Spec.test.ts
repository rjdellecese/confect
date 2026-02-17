import { describe, expect, it } from "@effect/vitest";
import * as Spec from "../src/Spec";

describe("isSpec", () => {
  it("checks whether a value is a spec", () => {
    const spec: unknown = Spec.make();

    expect(Spec.isSpec(spec)).toStrictEqual(true);
  });
});
