import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

export const version = 1;
export const esbuildVersion = "0.28.2";
export const maxFrameBytes = 8_388_608;
export const maxCallbacks = 32;
export const capabilities = [
  "resolve-rpc",
  "file-scope",
  "capture-v1",
  "cancel-v1",
] as const;

export class ProtocolError extends Schema.TaggedError<ProtocolError>()(
  "NativeProtocolError",
  {
    operation: Schema.String,
    reason: Schema.String,
  },
) {}

const Id = Schema.Number.check(
  Schema.isInt(),
  Schema.isBetween({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
);
const Strings = Schema.Array(Schema.String);
const Attributes = Schema.Record(Schema.String, Schema.String);
const Location = Schema.NullOr(
  Schema.Struct({
    file: Schema.String,
    namespace: Schema.String,
    line: Schema.Finite,
    column: Schema.Finite,
    length: Schema.Finite,
    lineText: Schema.String,
    suggestion: Schema.String,
  }),
);
export const Diagnostic = Schema.Struct({
  id: Schema.String,
  pluginName: Schema.String,
  text: Schema.String,
  location: Location,
  notes: Schema.Array(
    Schema.Struct({ text: Schema.String, location: Location }),
  ),
});
export interface Diagnostic extends Schema.Schema.Type<typeof Diagnostic> {}
const Diagnostics = Schema.Array(Diagnostic);
const probeFields = {
  path: Schema.String,
  namespace: Schema.String,
  suffix: Schema.String,
  external: Schema.Boolean,
  sideEffects: Schema.Boolean,
  errors: Diagnostics,
  warnings: Diagnostics,
};
export const ResolveDecision = Schema.Struct({
  ...probeFields,
  watchFiles: Strings,
  watchDirs: Strings,
});
export interface ResolveDecision extends Schema.Schema.Type<
  typeof ResolveDecision
> {}
export const Decision = Schema.Union([
  Schema.Struct({ mode: Schema.Literal("probe") }),
  Schema.Struct({ mode: Schema.Literal("result"), result: ResolveDecision }),
]);
export type Decision = typeof Decision.Type;
export const Options = Schema.Struct({
  root: Schema.String,
  entries: Strings,
  outdir: Schema.String,
  conditions: Strings,
  tsconfigRaw: Schema.String,
});
export interface Options extends Schema.Schema.Type<typeof Options> {}
export const CreateOptions = Options;
export interface CreateOptions extends Options {}
const host = { version: Schema.Literal(version), id: Id };
const build = { buildId: Id, epoch: Id };
export const Request = Schema.Union([
  Schema.Struct({
    ...host,
    tag: Schema.Literal("Hello"),
    esbuildVersion: Schema.String,
    capabilities: Strings,
  }),
  Schema.Struct({ ...host, tag: Schema.Literal("Create"), options: Options }),
  Schema.Struct({ ...host, tag: Schema.Literal("Rebuild"), ...build }),
  Schema.Struct({
    ...host,
    tag: Schema.Literal("ResolveResult"),
    ...build,
    callbackId: Id,
    decision: Decision,
  }),
  Schema.Struct({
    ...host,
    tag: Schema.Literal("CallbackCancelled"),
    ...build,
    callbackId: Id,
  }),
  Schema.Struct({ ...host, tag: Schema.Literal("Cancel"), buildId: Id }),
  Schema.Struct({ ...host, tag: Schema.Literal("Dispose") }),
]);
export type Request = typeof Request.Type;
const event = { version: Schema.Literal(version), id: Schema.Literal(0) };
export const Resolve = Schema.Struct({
  ...event,
  tag: Schema.Literal("Resolve"),
  ...build,
  callbackId: Id,
  args: Schema.Struct({
    path: Schema.String,
    importer: Schema.String,
    namespace: Schema.String,
    resolveDir: Schema.String,
    kind: Schema.Literals([
      "entry-point",
      "import-statement",
      "require-call",
      "dynamic-import",
      "require-resolve",
      "import-rule",
      "composes-from",
      "url-token",
    ]),
    with: Attributes,
  }),
  probe: Schema.Struct(probeFields),
});
export interface Resolve extends Schema.Schema.Type<typeof Resolve> {}
export const Capture = Schema.Struct({
  ...host,
  tag: Schema.Literal("Capture"),
  ...build,
  status: Schema.Literals(["Succeeded", "Failed", "Cancelled"]),
  provisional: Schema.Literal(true),
  sources: Schema.Array(
    Schema.Struct({
      path: Schema.String,
      namespace: Schema.Literals(["file", "confect-generated"]),
      suffix: Schema.String,
      attributes: Attributes,
      loader: Schema.Literals([
        "js",
        "ts",
        "jsx",
        "tsx",
        "default",
        "json",
        "text",
        "binary",
      ]),
      resolveDir: Schema.String,
      sha256: Schema.String,
      originalSha256: Schema.String,
      bytesBase64: Schema.String,
    }),
  ),
  outputs: Schema.Array(
    Schema.Struct({
      path: Schema.String,
      sha256: Schema.String,
      bytesBase64: Schema.String,
    }),
  ),
  metafile: Schema.String,
  errors: Diagnostics,
  warnings: Diagnostics,
});
export interface Capture extends Schema.Schema.Type<typeof Capture> {}
export const Response = Schema.Union([
  Schema.Struct({
    ...host,
    tag: Schema.Literal("Hello"),
    esbuildVersion: Schema.String,
    capabilities: Strings,
    maxFrameBytes: Schema.Finite,
    maxCallbacks: Schema.Finite,
  }),
  Schema.Struct({
    ...host,
    tag: Schema.Literal("Created"),
    contextId: Schema.Literal(1),
  }),
  Resolve,
  Schema.Struct({
    ...event,
    tag: Schema.Literal("CancelCallbacks"),
    ...build,
    callbackIds: Schema.Array(Id),
  }),
  Capture,
  Schema.Struct({ ...host, tag: Schema.Literal("Cancelled"), buildId: Id }),
  Schema.Struct({
    ...host,
    tag: Schema.Literal("Disposed"),
    contextId: Schema.Literal(1),
    disposeCount: Schema.Literal(1),
  }),
  Schema.Struct({
    ...host,
    tag: Schema.Literal("Rejected"),
    code: Schema.String,
    message: Schema.String,
  }),
]);
export type Response = typeof Response.Type;

const failure = (operation: string, reason: string) =>
  new ProtocolError({ operation, reason });

const parseJson = (text: string): Result.Result<unknown, ProtocolError> => {
  let at = 0;
  const skip = () => {
    while (/\s/.test(text[at] ?? "") && at < text.length) at++;
  };
  const string = (): Result.Result<string, ProtocolError> => {
    const start = at++;
    while (at < text.length) {
      const char = text[at++];
      if (char === "\\") at++;
      else if (char === '"')
        return Result.try({
          try: () => JSON.parse(text.slice(start, at)) as string,
          catch: () => failure("json", "Invalid string"),
        });
    }
    return Result.fail(failure("json", "Unterminated string"));
  };
  const visit = (depth: number): ProtocolError | undefined => {
    if (depth > 128) return failure("json", "Nesting exceeds 128");
    skip();
    const char = text[at];
    if (char === '"') {
      const result = string();
      return Result.isFailure(result) ? result.failure : undefined;
    }
    if (char === "{" || char === "[") {
      at++;
      const end = char === "{" ? "}" : "]";
      const keys = new Set<string>();
      skip();
      if (text[at] === end) {
        at++;
        return;
      }
      while (at < text.length) {
        if (char === "{") {
          skip();
          if (text[at] !== '"') return failure("json", "Expected object key");
          const key = string();
          if (Result.isFailure(key)) return key.failure;
          if (keys.has(key.success))
            return failure("json", "Duplicate object key");
          keys.add(key.success);
          skip();
          if (text[at++] !== ":") return failure("json", "Expected colon");
        }
        const error = visit(depth + 1);
        if (error) return error;
        skip();
        if (text[at] === end) {
          at++;
          return;
        }
        if (text[at++] !== ",") return failure("json", "Expected separator");
      }
      return failure("json", "Unterminated container");
    }
    const start = at;
    while (at < text.length && !/[\s,\]}]/.test(text[at]!)) at++;
    return start === at ? failure("json", "Expected value") : undefined;
  };
  const error = visit(0);
  if (error) return Result.fail(error);
  skip();
  if (at !== text.length) return Result.fail(failure("json", "Trailing JSON"));
  return Result.try({
    try: () => JSON.parse(text) as unknown,
    catch: () => failure("json", "Invalid JSON"),
  });
};

export const decodeResponse = (
  bytes: Uint8Array,
): Result.Result<Response, ProtocolError> => {
  const text = Result.try({
    try: () => new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    catch: () => failure("utf8", "Invalid UTF-8"),
  });
  if (Result.isFailure(text)) return Result.fail(text.failure);
  const json = parseJson(text.success);
  if (Result.isFailure(json)) return Result.fail(json.failure);
  return Schema.decodeUnknownResult(Response, { onExcessProperty: "error" })(
    json.success,
  ).pipe(Result.mapError(() => failure("schema", "Invalid response shape")));
};

export const encodeRequest = (
  request: Request,
): Result.Result<Buffer, ProtocolError> => {
  const decoded = Schema.decodeResult(Request, {
    onExcessProperty: "error",
  })(request);
  if (Result.isFailure(decoded))
    return Result.fail(failure("schema", "Invalid request shape"));
  const bytes = Buffer.from(JSON.stringify(decoded.success));
  if (bytes.length < 1 || bytes.length > maxFrameBytes)
    return Result.fail(failure("frame", "Invalid frame length"));
  const frame = Buffer.allocUnsafe(bytes.length + 4);
  frame.writeUInt32BE(bytes.length);
  bytes.copy(frame, 4);
  return Result.succeed(frame);
};

export class FrameDecoder {
  private header = Buffer.alloc(4);
  private headerLength = 0;
  private body: Buffer | undefined;
  private bodyLength = 0;
  private error: ProtocolError | undefined;

  push(
    chunk: Uint8Array,
    emit: (bytes: Buffer) => void,
  ): Result.Result<void, ProtocolError> {
    if (this.error) return Result.fail(this.error);
    let offset = 0;
    while (offset < chunk.length) {
      if (!this.body) {
        const size = Math.min(4 - this.headerLength, chunk.length - offset);
        this.header.set(
          chunk.subarray(offset, offset + size),
          this.headerLength,
        );
        offset += size;
        this.headerLength += size;
        if (this.headerLength < 4) break;
        const length = this.header.readUInt32BE();
        if (length < 1 || length > maxFrameBytes) {
          this.error = failure("frame", "Invalid frame length");
          return Result.fail(this.error);
        }
        this.body = Buffer.allocUnsafe(length);
      }
      const size = Math.min(
        this.body.length - this.bodyLength,
        chunk.length - offset,
      );
      this.body.set(chunk.subarray(offset, offset + size), this.bodyLength);
      offset += size;
      this.bodyLength += size;
      if (this.bodyLength === this.body.length) {
        const body = this.body;
        this.body = undefined;
        this.bodyLength = this.headerLength = 0;
        emit(body);
      }
    }
    return Result.succeed(undefined);
  }

  finish(): Result.Result<void, ProtocolError> {
    return this.error
      ? Result.fail(this.error)
      : this.headerLength > 0 || this.body
        ? Result.fail(failure("frame", "Truncated frame"))
        : Result.succeed(undefined);
  }
}
