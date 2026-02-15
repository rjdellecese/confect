import type { FunctionType as ConvexFunctionType } from "convex/server";

export type Runtime = "Convex" | "Node";

export type FunctionType<Runtime_ extends Runtime> = Runtime_ extends "Convex"
  ? ConvexFunctionType
  : Runtime_ extends "Node"
    ? "action"
    : never;
