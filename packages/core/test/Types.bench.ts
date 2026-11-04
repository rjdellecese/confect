import { bench } from "confect-bench-harness";
import type { IsRecursive } from "@confect/core/Types";

void ({} as IsRecursive<any>);

bench("IsRecursive<string>", () => {
  return {} as IsRecursive<string>;
}).types([19, "instantiations"]);

type DeepObject = { a: { b: { c: { d: { e: { value: string } } } } } };

bench("IsRecursive (deep object)", () => {
  return {} as IsRecursive<DeepObject>;
}).types([375, "instantiations"]);

type OptionalObject = {
  status?: string;
  archived?: boolean;
  saved?: Array<{ status?: string }>;
};

bench("IsRecursive (assignable optional structures)", () => {
  return {} as IsRecursive<OptionalObject>;
}).types([321, "instantiations"]);

type SharedChild = { value: string; items: readonly number[] };
type SharedObject = {
  a: SharedChild;
  b: SharedChild;
  c: SharedChild;
  d: SharedChild;
};

bench("IsRecursive (shared subtrees)", () => {
  return {} as IsRecursive<SharedObject>;
}).types([280, "instantiations"]);

type ObjectUnion =
  | { kind: "text"; text: string }
  | { kind: "number"; value: number }
  | { kind: "boolean"; value: boolean }
  | { kind: "array"; values: readonly SharedChild[] }
  | { kind: "object"; value: SharedObject }
  | { kind: "optional"; value?: OptionalObject };

bench("IsRecursive (object union)", () => {
  return {} as IsRecursive<ObjectUnion>;
}).types([1236, "instantiations"]);

type RecursiveObject = { next?: RecursiveObject };
type RecursiveArray = RecursiveArray[];
type RecursiveUnion = string | { children: readonly RecursiveUnion[] };

bench("IsRecursive (recursive object)", () => {
  return {} as IsRecursive<RecursiveObject>;
}).types([132, "instantiations"]);

bench("IsRecursive (recursive array)", () => {
  return {} as IsRecursive<RecursiveArray>;
}).types([89, "instantiations"]);

bench("IsRecursive (recursive union)", () => {
  return {} as IsRecursive<RecursiveUnion>;
}).types([334, "instantiations"]);
