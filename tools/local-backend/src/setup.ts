import { setupForFixture } from "./setupForFixture";

export const setup = setupForFixture(import.meta.dirname, "../fixtures", [
  "components/counter/convex",
  "components/parent/convex",
]);
