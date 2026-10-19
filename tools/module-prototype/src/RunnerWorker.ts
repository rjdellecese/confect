import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import {
  ESModulesEvaluator,
  ModuleRunner,
  ssrDynamicImportKey,
  ssrImportKey,
} from "vite/module-runner";

import {
  ChildRequest,
  EvaluationFailed,
  type NativeRequest,
  type Request,
  type Response,
} from "./Protocol.ts";

const Invocation = Schema.Struct({
  type: Schema.Literal("custom"),
  event: Schema.Literal("vite:invoke"),
  data: Schema.Struct({
    name: Schema.String,
    data: Schema.Array(Schema.Unknown),
  }),
});

const failure = (cause: unknown): EvaluationFailed =>
  Schema.is(EvaluationFailed)(cause)
    ? cause
    : new EvaluationFailed({
        message: cause instanceof Error ? cause.message : String(cause),
      });

const evaluate = (request: Request) =>
  Effect.tryPromise({
    try: () => {
      const { snapshot } = request;
      const modules = new Map(
        snapshot.modules.map((module) => [module.id, module]),
      );
      const externals = new Map(
        snapshot.externals.map((external) => [external.id, external]),
      );
      const ids = [...modules.keys(), ...externals.keys()];
      if (
        new Set(ids).size !==
          snapshot.modules.length + snapshot.externals.length ||
        !modules.has(snapshot.entry)
      ) {
        throw new EvaluationFailed({
          message: "Snapshot has duplicate IDs or no entry module",
        });
      }
      const keys = new Map(ids.map((id, index) => [id, `/@snapshot/${index}`]));
      const keyIds = new Map(Array.from(keys, ([id, key]) => [key, id]));
      const urls = new Set(snapshot.externals.map((external) => external.url));
      const resolve = (
        importer: string,
        specifier: string,
      ): Result.Result<string, EvaluationFailed> => {
        const module = modules.get(importer);
        const target =
          module && Object.hasOwn(module.imports, specifier)
            ? module.imports[specifier]
            : undefined;
        const key = target === undefined ? undefined : keys.get(target);
        return key === undefined
          ? Result.fail(
              new EvaluationFailed({
                message: `Import ${specifier} from ${importer} is not in the snapshot`,
              }),
            )
          : Result.succeed(key);
      };
      const evaluator = new ESModulesEvaluator();
      const runner = new ModuleRunner(
        {
          hmr: false,
          sourcemapInterceptor: false,
          transport: {
            invoke(payload) {
              const invocation = Result.getOrThrow(
                Schema.decodeUnknownResult(Invocation)(payload).pipe(
                  Result.mapError(failure),
                ),
              );
              if (invocation.data.name === "getBuiltins")
                return Promise.resolve({ result: [] });
              if (invocation.data.name !== "fetchModule") {
                throw new EvaluationFailed({
                  message: `Unknown runner operation ${invocation.data.name}`,
                });
              }
              const [key] = invocation.data.data;
              const id = typeof key === "string" ? keyIds.get(key) : undefined;
              const module = id === undefined ? undefined : modules.get(id);
              if (module) {
                return Promise.resolve({
                  result: {
                    code: module.code,
                    file: module.file,
                    id: key,
                    url: key,
                    invalidate: false,
                  },
                });
              }
              const external = id === undefined ? undefined : externals.get(id);
              if (external)
                return Promise.resolve({
                  result: { externalize: external.url, type: external.type },
                });
              throw new EvaluationFailed({
                message: `Module ${String(key)} is not in the snapshot`,
              });
            },
          },
        },
        {
          startOffset: evaluator.startOffset,
          runInlinedModule(context, code, module) {
            const id = keyIds.get(module.id);
            if (id === undefined)
              throw new EvaluationFailed({
                message: `Module ${module.id} is not in the snapshot`,
              });
            const importModule = context[ssrImportKey];
            const dynamicImportModule = context[ssrDynamicImportKey];
            return evaluator.runInlinedModule(
              {
                ...context,
                [ssrImportKey]: (specifier, metadata) =>
                  importModule(
                    Result.getOrThrow(resolve(id, specifier)),
                    metadata,
                  ),
                [ssrDynamicImportKey]: (specifier, options) =>
                  dynamicImportModule(
                    Result.getOrThrow(resolve(id, specifier)),
                    options,
                  ),
              },
              code,
            );
          },
          runExternalModule(url) {
            if (!urls.has(url))
              throw new EvaluationFailed({
                message: `External ${url} is not in the snapshot`,
              });
            return evaluator.runExternalModule(url);
          },
        },
      );
      const entryKey = keys.get(snapshot.entry);
      if (entryKey === undefined)
        throw new EvaluationFailed({ message: "Snapshot entry is missing" });
      return runner
        .import<Record<string, unknown>>(entryKey)
        .then((exports) => {
          if (!Object.hasOwn(exports, request.exportName)) {
            throw new EvaluationFailed({
              message: `Export ${request.exportName} is missing`,
            });
          }
          const value = exports[request.exportName];
          if (!request.invoke) return value;
          if (typeof value !== "function")
            throw new EvaluationFailed({
              message: `Export ${request.exportName} is not callable`,
            });
          return value();
        })
        .finally(() => runner.close());
    },
    catch: failure,
  });

const send = (response: Response): void => {
  try {
    if (!process.send) process.exit(1);
    process.send(response, (cause) => process.exit(cause ? 1 : 0));
  } catch (cause) {
    if (response._tag === "Failure") process.exit(1);
    send({ _tag: "Failure", message: failure(cause).message });
  }
};

const evaluateNative = (request: NativeRequest) =>
  Effect.tryPromise({
    try: () =>
      import(request.url).then((exports: Record<string, unknown>) => {
        if (!Object.hasOwn(exports, request.exportName)) {
          throw new EvaluationFailed({
            message: `Export ${request.exportName} is missing`,
          });
        }
        const value = exports[request.exportName];
        if (!request.invoke) return value;
        if (typeof value !== "function")
          throw new EvaluationFailed({
            message: `Export ${request.exportName} is not callable`,
          });
        return value();
      }),
    catch: failure,
  });

process.once("message", (message: unknown) => {
  const program = Schema.decodeUnknownEffect(ChildRequest)(message).pipe(
    Effect.mapError(failure),
    Effect.flatMap((request) =>
      "_tag" in request ? evaluateNative(request) : evaluate(request),
    ),
    Effect.match({
      onFailure: (error): Response => ({
        _tag: "Failure",
        message: error.message,
      }),
      onSuccess: (value): Response => ({ _tag: "Success", value }),
    }),
  );
  void Effect.runPromise(program).then(send, (cause) =>
    send({ _tag: "Failure", message: failure(cause).message }),
  );
});
