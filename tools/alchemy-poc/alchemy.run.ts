import { Stack } from "alchemy/Stack";
import { localState } from "alchemy/State/LocalState";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Backend from "./src/Backend";

export default Stack(
  "confect-proof-of-concept",
  {
    providers: Backend.providers,
    state: localState(),
  },
  Effect.gen(function* () {
    const backend = yield* Backend.Backend("Backend", {
      cwd: yield* Config.String("CONFECT_POC_CWD"),
      url: yield* Config.String("CONFECT_POC_URL"),
      deployKeyEnv: "CONFECT_POC_DEPLOY_KEY",
      env: { APP_ENV: "CONFECT_POC_APP_ENV" },
    });
    return { url: backend.url };
  }),
);
