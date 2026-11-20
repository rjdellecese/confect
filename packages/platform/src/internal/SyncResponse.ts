import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Predicate from "effect/Predicate";
import * as Schema from "effect/Schema";

type Tick = "ts" | "snapshotTs" | "syncedTs";

export const decode =
  <A>(shape: "page" | "active" | "list", schema: Schema.Decoder<A>) =>
  (body: unknown) =>
    Effect.gen(function* () {
      const sources = {
        ts: new WeakMap<object, string>(),
        snapshotTs: new WeakMap<object, string>(),
        syncedTs: new WeakMap<object, string>(),
      };
      const json = Schema.fromJsonString(Schema.Unknown, {
        reviver(
          this: object,
          key: string,
          value: unknown,
          context?: { source?: string },
        ) {
          if (
            (key === "ts" || key === "snapshotTs" || key === "syncedTs") &&
            typeof value === "number" &&
            context?.source !== undefined
          ) {
            sources[key].set(this, context.source);
          }
          return value;
        },
      });
      const response = yield* Schema.decodeUnknownEffect(json)(body);
      const restore = (holder: unknown, key: Tick) => {
        if (!Predicate.isObject(holder)) return;
        const source = sources[key].get(holder);
        if (source !== undefined && /^-?\d{1,19}$/.test(source))
          holder[key] = BigInt(source);
      };
      if (Predicate.isObject(response)) {
        if (shape === "page") {
          restore(response.status, "snapshotTs");
          if (Array.isArray(response.values)) {
            for (const entry of response.values) restore(entry, "ts");
          }
        } else if (shape === "active") {
          restore(response.status, "syncedTs");
        } else if (Array.isArray(response.syncs)) {
          for (const sync of response.syncs) {
            if (Predicate.isObject(sync)) restore(sync.status, "syncedTs");
          }
        }
      }
      return yield* Schema.decodeUnknownEffect(schema)(response);
    });
