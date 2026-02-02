import { Context, Effect, Layer, Predicate } from "effect";
import type * as Api from "./Api";
import type { Groups as ApiGroups } from "./Api";
import type * as GroupImpl from "./GroupImpl";

export const TypeId = "@confect/server/Impl";
export type TypeId = typeof TypeId;

export const isImpl = (u: unknown): u is AnyWithProps =>
  Predicate.hasProperty(u, TypeId);

export interface Impl<
  Api_ extends Api.AnyWithProps,
  FinalizationStatus_ extends FinalizationStatus,
> {
  readonly [TypeId]: TypeId;
  readonly api: Api_;
  readonly finalizationStatus: FinalizationStatus_;
}

export type FinalizationStatus = "Unfinalized" | "Finalized";

export interface AnyWithProps
  extends Impl<Api.AnyWithProps, FinalizationStatus> {}

export const Impl = <
  Api_ extends Api.AnyWithProps,
  FinalizationStatus_ extends FinalizationStatus,
>() =>
  Context.GenericTag<Impl<Api_, FinalizationStatus_>>(`@confect/server/Impl`);

export const make = <Api_ extends Api.AnyWithProps>(
  api: Api_,
): Layer.Layer<
  Impl<Api_, "Unfinalized">,
  never,
  GroupImpl.FromGroups<ApiGroups<Api_>>
> =>
  Layer.effect(
    Impl<Api_, "Unfinalized">(),
    Effect.succeed({
      [TypeId]: TypeId,
      api,
      finalizationStatus: "Unfinalized" as const,
    }),
  );

export const finalize = <Api_ extends Api.AnyWithProps>(
  impl: Layer.Layer<Impl<Api_, "Unfinalized">>,
): Layer.Layer<Impl<Api_, "Finalized">> =>
  Layer.map(impl, (context) =>
    Context.make(Impl<Api_, "Finalized">(), {
      [TypeId]: TypeId,
      api: Context.get(context, Impl<Api_, "Unfinalized">()).api,
      finalizationStatus: "Finalized",
    }),
  );
