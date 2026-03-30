import { describe, it } from "@effect/vitest";
import { assertEquals, assertTrue } from "@effect/vitest/utils";
import { Effect } from "effect";
import { BlobNotFoundError } from "../src/BlobNotFoundError";

describe("BlobNotFoundError", () => {
  it.effect("has a descriptive message with the storage id", () =>
    Effect.sync(() => {
      const error = new BlobNotFoundError({ id: "storage123" });
      assertTrue(error.message.includes("storage123"));
      assertTrue(error.message.includes("not found"));
      assertEquals(error._tag, "BlobNotFoundError");
      assertEquals(error.id, "storage123");
    }),
  );
});
