import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vitest/config";

export const defineLocalBackendConfig = ({
  root,
  name,
  base,
}: {
  readonly root: string;
  readonly name: string;
  readonly base: Parameters<typeof mergeConfig>[0];
}) =>
  mergeConfig(
    base,
    defineConfig({
      test: {
        root,
        name: `${name} (local-backend)`,
        include: ["test/local-backend/**/*.test.ts"],
        fileParallelism: false,
        globalSetup: [fileURLToPath(new URL("./setup.ts", import.meta.url))],
        testTimeout: 60_000,
        hookTimeout: 120_000,
        typecheck: { enabled: false },
        coverage: { enabled: false },
      },
    }),
  );
