import { Context, Effect, Layer } from "effect";
import type * as Api from "./Api";
import type { Groups as ApiGroups } from "./Api";
import type * as GroupImpl from "./GroupImpl";

export class Impl extends Context.Tag("@rjdellecese/confect/server/Impl")<
  Impl,
  {
    readonly api: Api.AnyWithProps;
    readonly context: Context.Context<never>;
  }
>() {}

export const make = <Api_ extends Api.AnyWithProps>(
  api: Api_,
): Layer.Layer<Impl, never, GroupImpl.FromGroups<ApiGroups<Api_>>> =>
  Layer.effect(
    Impl,
    Effect.map(Effect.context(), (context) => ({
      api,
      context,
    })),
  );
