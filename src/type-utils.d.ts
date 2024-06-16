import { HasReadonlyKeys, HasWritableKeys } from "type-fest";

export type IsEntirelyReadonly<T extends object> =
  HasReadonlyKeys<T> extends true
    ? HasWritableKeys<T> extends false
      ? true
      : false
    : false;

export type IsEntirelyWritable<T extends object> =
  HasWritableKeys<T> extends true
    ? HasReadonlyKeys<T> extends false
      ? true
      : false
    : false;
