import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpClient from "effect/http/HttpClient";
import * as LocalBackend from "./LocalBackend";

layer(LocalBackend.layer, { timeout: "120 seconds" })("HttpRouter", (it) => {
  it.effect("streams a 100 MiB response through the Effect router", () =>
    Effect.gen(function* () {
      yield* LocalBackend.LocalBackend;
      const response = yield* HttpClient.get(
        "http://127.0.0.1:3211/large-stream",
      );

      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toBe("application/octet-stream");
      const bytes = yield* response.stream.pipe(
        Stream.runFold(
          () => 0,
          (total, chunk) => {
            expect(chunk.every((byte) => byte === 120)).toBe(true);
            return total + chunk.byteLength;
          },
        ),
      );
      expect(bytes).toBe(100 * 1024 * 1024);
    }).pipe(Effect.provide(FetchHttpClient.layer)),
  );
});
