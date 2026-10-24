import { BaseSequencer, type TestSpecification } from "vitest/node";

const durations: Readonly<Record<string, number>> = {
  "codegen.test.ts": 88_289,
  "Evaluation.test.ts": 86_267,
  "dev.test.ts": 33_052,
  "CompilationConfig.test.ts": 24_207,
  "templates.test.ts": 20_623,
  "Compilation.test.ts": 15_485,
  "Watcher.test.ts": 9_932,
  "CompilationPlugin.test.ts": 8_443,
  "EffectTracing.test.ts": 7_575,
  "integration/devConfiguration.test.ts": 63_855,
  "integration/devIncremental.test.ts": 66_074,
  "integration/devRecovery.test.ts": 78_179,
  "integration/devOutputs.test.ts": 72_125,
};

const testPath = (moduleId: string) =>
  moduleId.replaceAll("\\", "/").split("/test/").at(-1) ?? moduleId;

const duration = (moduleId: string) => durations[testPath(moduleId)] ?? 1_000;

export const sortCliTests = <T extends { readonly moduleId: string }>(
  files: ReadonlyArray<T>,
): Array<T> =>
  files.toSorted((a, b) => {
    const difference = duration(b.moduleId) - duration(a.moduleId);
    if (difference !== 0) return difference;
    const left = testPath(a.moduleId);
    const right = testPath(b.moduleId);
    return left < right ? -1 : left > right ? 1 : 0;
  });

export const partitionCliTests = <T extends { readonly moduleId: string }>(
  files: ReadonlyArray<T>,
  count: number,
): Array<Array<T>> => {
  const shards = Array.from({ length: count }, () => ({
    duration: 0,
    files: new Array<T>(),
  }));
  for (const [moduleId, group] of Map.groupBy(
    sortCliTests(files),
    (file) => file.moduleId,
  )) {
    const shard = shards.reduce((shortest, candidate) =>
      candidate.duration < shortest.duration ? candidate : shortest,
    );
    shard.files.push(...group);
    shard.duration += duration(moduleId);
  }
  return shards.map((shard) => shard.files);
};

export default class CliTestSequencer extends BaseSequencer {
  override shard(files: Array<TestSpecification>) {
    const shard = this.ctx.config.shard;
    if (!shard) return Promise.resolve(sortCliTests(files));
    return Promise.resolve(
      partitionCliTests(files, shard.count)[shard.index - 1],
    );
  }

  override sort(files: Array<TestSpecification>) {
    return Promise.resolve(sortCliTests(files));
  }
}
