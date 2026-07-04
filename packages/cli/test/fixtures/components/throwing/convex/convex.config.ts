import { defineApp } from "convex/server";

const app = defineApp();

const alwaysThrows = () => {
  throw new Error("convex.config.ts evaluation failed");
};
alwaysThrows();

export default app;
