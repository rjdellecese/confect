import { Context, Effect, Layer } from "effect";
import type * as Api from "./Api";
import type * as GroupImpl from "./GroupImpl";

export class Impl extends Context.Tag("@rjdellecese/confect/server/Impl")<
  Impl,
  {
    readonly api: Api.Api.AnyWithProps;
    readonly context: Context.Context<never>;
  }
>() {}

export const make = <Api_ extends Api.Api.AnyWithProps>(
  api: Api_,
): Layer.Layer<
  Impl,
  never,
  GroupImpl.GroupImpl.FromGroups<Api.Api.Groups<Api_>>
> =>
  Layer.effect(
    Impl,
    Effect.map(Effect.context(), (context) => ({
      api,
      context,
    })),
  );
