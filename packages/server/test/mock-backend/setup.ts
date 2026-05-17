import path from "node:path";
import { setupForFixture } from "../setup";

export const setup = setupForFixture(
  path.resolve(import.meta.dirname, "./fixtures"),
);
