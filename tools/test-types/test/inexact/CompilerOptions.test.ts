import { expectTypeOf } from "@effect/vitest";
import type * as CompilerOptions from "confect-test-types/CompilerOptions";

expectTypeOf<CompilerOptions.AllowsExplicitUndefined>().toEqualTypeOf<true>();
