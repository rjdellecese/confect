# HTTP APIs

Confect allows you to use Effect to build your Convex HTTP API(s).

## Usage

### 1. Define your HTTP API

{% @github-files/github-code-block url="https://github.com/rjdellecese/confect/blob/main/example/convex/http/api.ts" fullWidth="false" %}

### 2. Make a Convex HTTP router

{% hint style="info" %}
You can mount your Effect HTTP API to the root path of your [Convex site URL](https://docs.convex.dev/functions/http-actions), or to any subpath. You can even mount multiple Effect HTTP APIs to different subpaths!
{% endhint %}

{% hint style="warning" %}
If you'd like to mount an Effect HTTP API to a subpath, you must be sure that your API is prefixed with the same subpath, as this will not (yet) be done automatically for you. The easiest way to do this right now is [`myApi.prefix("my-subpath")`](https://effect-ts.github.io/effect/platform/HttpApi.ts.html#httpapi-interface).
{% endhint %}

{% @github-files/github-code-block url="https://github.com/rjdellecese/confect/blob/main/example/convex/http.ts" fullWidth="false" %}

## OpenAPI Documentation

Each Effect HTTP API will be accompanied by its own live OpenAPI documentation page, powered by [Scalar](https://github.com/scalar/scalar). This can be configured via the `scalar` property.

## Read more

See the [`@effect/platform` HTTP API docs](https://github.com/Effect-TS/effect/blob/main/packages/platform/README.md#http-api) for detailed information on how to build an HTTP API with Effect.
