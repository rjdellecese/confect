import type { paths as LogStreamPaths } from "@convex-dev/platform/logStreamApi";

export type ConvexEventLog = LogStreamPaths["schemas"];
export type * as DeploymentApi from "@convex-dev/platform/deploymentApi";
export type * as ManagementApi from "@convex-dev/platform/managementApi";
export * as DeploymentClient from "./DeploymentClient.js";
export * as ManagementClient from "./ManagementClient.js";
export * as PlatformError from "./PlatformError.js";
