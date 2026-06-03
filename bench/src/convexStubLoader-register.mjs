// Registers the stub resolution hook, then loads the real cross-check script.
import { register } from "node:module";
register("./convexStubLoader.mjs", import.meta.url);
await import("./backendCheck.mjs");
