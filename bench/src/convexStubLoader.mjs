// Node module-resolution hook that stubs the logging/telemetry libraries
// Convex ships pre-bundled in its CLI (and therefore aren't installable as loose
// deps): @sentry/node, chalk, ora, find-up, @babel/parser. These are only used
// for logging/telemetry on the bundle() code path (with externalPackagesAllowList
// empty, the package-resolution helpers that need find-up/@babel are never
// called), so no-op stubs let us drive Convex's real esbuild bundler offline.
//
// Registered via:  node --import ./src/convexStubLoader-register.mjs <script>

const STUBS = {
  "@sentry/node": `
    const noop = () => {};
    export const captureException = noop;
    export const captureMessage = noop;
    export const close = async () => true;
    export const flush = async () => true;
    export const init = noop;
    export const setTag = noop;
    export const setContext = noop;
    export const withScope = (fn) => fn({ setTag: noop, setContext: noop });
    export default { captureException, captureMessage, close, flush, init };
  `,
  chalk: `
    const mk = () => new Proxy(function () { return arguments[0] ?? ""; }, {
      get: () => mk(),
      apply: (_t, _th, args) => args[0] ?? "",
    });
    export const chalkStderr = mk();
    export const chalkStdout = mk();
    export const Chalk = function () { return mk(); };
    export default mk();
  `,
  ora: `
    const spinner = new Proxy({}, { get: () => (..._a) => spinner, set: () => true });
    export default () => spinner;
  `,
  "find-up": `
    export const findUp = async () => undefined;
    export const findUpSync = () => undefined;
    export default findUp;
  `,
  "@babel/parser": `
    export const parse = () => ({ type: "File", program: { body: [] } });
    export const parseExpression = () => ({});
    export default { parse, parseExpression };
  `,
  commander: `
    const chain = () => new Proxy(function () { return chain(); }, {
      get: () => chain(), apply: () => chain(), construct: () => chain(),
    });
    export const Command = chain();
    export const Option = chain();
    export const Argument = chain();
    export const program = chain();
    export const Help = chain();
    export const InvalidArgumentError = chain();
    export const InvalidOptionArgumentError = chain();
    export const CommanderError = chain();
    export const createCommand = chain();
    export const createOption = chain();
    export const createArgument = chain();
    export default chain();
  `,
  "fetch-retry": `
    export default () => (globalThis.fetch ?? (async () => ({})));
  `,
  "openapi-fetch": `
    const chain = () => new Proxy(function () { return chain(); }, {
      get: () => chain(), apply: () => chain(),
    });
    export default () => chain();
  `,
};

export async function resolve(specifier, context, nextResolve) {
  if (Object.prototype.hasOwnProperty.call(STUBS, specifier)) {
    return { url: `stub:${specifier}`, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith("stub:")) {
    const key = url.slice("stub:".length);
    return { format: "module", source: STUBS[key], shortCircuit: true };
  }
  return nextLoad(url, context);
}
