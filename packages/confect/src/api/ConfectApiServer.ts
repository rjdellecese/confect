import { Effect, Layer, Runtime } from "effect";
import * as ConfectApi from "./ConfectApi";
import * as ConfectApiBuilder from "./ConfectApiBuilder";
import * as ConfectApiGroup from "./ConfectApiGroup";

export const make = <
  ApiName extends string,
  Groups extends ConfectApiGroup.ConfectApiGroup.AnyWithProps,
>(
  apiInterface: ConfectApi.ConfectApi<ApiName, Groups>,
  apiServiceLayer: Layer.Layer<
    ConfectApiBuilder.ConfectApiService<ApiName, Groups>
  >
) =>
  Effect.gen(function* () {
    const layerRuntime = yield* Layer.toRuntime(apiServiceLayer);

    return Runtime.runCallback(layerRuntime)(
      Effect.gen(function* () {
        const api = yield* ConfectApiBuilder.ConfectApiService(
          apiInterface.name,
          apiInterface.groups
        );

        // TODO
        return api;
      })
    );
  });
