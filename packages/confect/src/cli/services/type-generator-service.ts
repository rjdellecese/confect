#!/usr/bin/env node

import * as Effect from "effect/Effect";
import * as Console from "effect/Console";
import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import { ConfectTypeExtractorService } from "./type-extractor-service";
import { ErrorTypesGeneratorService } from "./error-types-generator-service";

/**
 * Effect-based service for generating Confect error types.
 *
 * This service orchestrates the extraction of Confect functions and generation
 * of TypeScript type definitions using Effect-native FileSystem operations.
 *
 * @since 1.0.0
 * @example
 * ```typescript
 * const generator = yield* ConfectTypeGeneratorService
 * yield* generator.generate
 * ```
 */
export class ConfectTypeGeneratorService extends Effect.Service<ConfectTypeGeneratorService>()(
  "ConfectTypeGeneratorService",
  {
    dependencies: [
      ConfectTypeExtractorService.Default,
      ErrorTypesGeneratorService.Default,
    ],
    effect: Effect.gen(function* () {
      const extractor = yield* ConfectTypeExtractorService;
      return {
        /**
         * Generates TypeScript error type definitions for Confect functions.
         *
         * @returns Effect that completes when type generation is done
         * @since 1.0.0
         */
        generate: Effect.gen(function* () {
          yield* Console.log("⚡ Generating types...");
          const result = yield* extractor.extract;
          const generator = yield* ErrorTypesGeneratorService;
          yield* generator.generate(result.functions);
          yield* createEnvironmentFiles();
        }),
      };
    }),
  },
) {}

/**
 * Detects if this is a monorepo and finds app directories dynamically.
 *
 * @param monorepoRoot - Root directory of the monorepo
 * @returns Effect that resolves to monorepo info and app directories
 * @since 1.0.0
 * @internal
 */
const detectAppDirectories = (monorepoRoot: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const packageJsonPath = path.join(monorepoRoot, "package.json");
    const exists = yield* fs.exists(packageJsonPath);

    if (!exists) {
      return { isMonorepo: false, appDirectories: [] };
    }

    const content = yield* fs.readFileString(packageJsonPath);
    const packageJson = JSON.parse(content);

    // Check if this has workspaces (indicating monorepo)
    if (!packageJson.workspaces) {
      return { isMonorepo: false, appDirectories: [] };
    }

    const workspaces = Array.isArray(packageJson.workspaces)
      ? packageJson.workspaces
      : packageJson.workspaces.packages || [];

    const appDirectories: string[] = [];

    // Process each workspace pattern
    for (const workspace of workspaces) {
      if (workspace.includes("*")) {
        // Handle glob patterns like 'apps/*'
        const baseDir = workspace.replace("/*", "");
        const basePath = path.join(monorepoRoot, baseDir);
        const baseDirExists = yield* fs.exists(basePath);

        if (baseDirExists) {
          const entries = yield* fs.readDirectory(basePath);
          for (const entry of entries) {
            const entryPath = path.join(basePath, entry);
            const stat = yield* fs.stat(entryPath);
            if (stat.type === "Directory") {
              // Check if this directory has a package.json (indicating it's a package)
              const packagePath = path.join(entryPath, "package.json");
              const hasPackage = yield* fs.exists(packagePath);
              if (hasPackage) {
                appDirectories.push(path.join(baseDir, entry));
              }
            }
          }
        }
      } else {
        // Handle specific workspace paths
        const workspacePath = path.join(monorepoRoot, workspace);
        const workspaceExists = yield* fs.exists(workspacePath);
        if (workspaceExists) {
          appDirectories.push(workspace);
        }
      }
    }

    // If no app directories found from workspaces, search for packages that depend on backend
    if (appDirectories.length === 0) {
      const backendPackageName = yield* getBackendPackageName(process.cwd());
      const dependentPackages = yield* findPackagesDependingOn(
        monorepoRoot,
        backendPackageName,
      );
      appDirectories.push(...dependentPackages);
    }

    // Filter out the backend package itself (where Convex is running)
    const currentBackendPath = yield* getCurrentBackendPath();
    const filteredAppDirectories = appDirectories.filter((appDir) => {
      const fullAppPath = path.resolve(monorepoRoot, appDir);
      return fullAppPath !== currentBackendPath;
    });

    return { isMonorepo: true, appDirectories: filteredAppDirectories };
  });

/**
 * Finds packages that depend on a specific backend package.
 *
 * @param monorepoRoot - Root directory of the monorepo
 * @param backendPackageName - Name of the backend package to search for
 * @returns Effect that resolves to array of relative paths to dependent packages
 * @since 1.0.0
 * @internal
 */
const findPackagesDependingOn = (
  monorepoRoot: string,
  backendPackageName: string,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dependentPackages: string[] = [];

    // Common directories to search for packages
    const searchDirs = ["apps", "packages", "libs", "services"];

    for (const searchDir of searchDirs) {
      const searchPath = path.join(monorepoRoot, searchDir);
      const exists = yield* fs.exists(searchPath);

      if (exists) {
        const entries = yield* fs.readDirectory(searchPath);

        for (const entry of entries) {
          const entryPath = path.join(searchPath, entry);
          const stat = yield* fs.stat(entryPath);

          if (stat.type === "Directory") {
            const packageJsonPath = path.join(entryPath, "package.json");
            const hasPackageJson = yield* fs.exists(packageJsonPath);

            if (hasPackageJson) {
              const packageContent = yield* fs.readFileString(packageJsonPath);
              const packageJson = JSON.parse(packageContent);

              // Check if this package depends on the backend package
              const allDeps = {
                ...packageJson.dependencies,
                ...packageJson.devDependencies,
                ...packageJson.peerDependencies,
              };

              if (allDeps[backendPackageName]) {
                dependentPackages.push(path.join(searchDir, entry));
              }
            }
          }
        }
      }
    }

    return dependentPackages;
  });

/**
 * Gets the current backend package path (where Convex is running).
 *
 * @returns Effect that resolves to the absolute path of the backend package
 * @since 1.0.0
 * @internal
 */
const getCurrentBackendPath = () =>
  Effect.gen(function* () {
    // The backend is where the command is currently running from
    const currentDir = process.cwd();
    const path = yield* Path.Path;
    // Resolve to absolute path for comparison
    return path.resolve(currentDir);
  });

/**
 * Finds the monorepo root directory by looking for package.json with workspaces.
 *
 * @param startDir - Directory to start searching from
 * @returns Effect that resolves to the monorepo root path
 * @since 1.0.0
 * @internal
 */
const findMonorepoRoot = (startDir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    let currentDir = startDir;

    while (currentDir !== path.dirname(currentDir)) {
      const packageJsonPath = path.join(currentDir, "package.json");
      const exists = yield* fs.exists(packageJsonPath);

      if (exists) {
        const content = yield* fs.readFileString(packageJsonPath);
        const packageJson = JSON.parse(content);

        // Check if this package.json has workspaces (indicating monorepo root)
        if (packageJson.workspaces) {
          return currentDir;
        }
      }

      currentDir = path.dirname(currentDir);
    }

    // Fallback: if no workspaces found, assume current directory is correct
    return startDir;
  });

/**
 * Gets the backend package name from the current directory's package.json.
 *
 * @param currentDir - Current directory (where the backend package.json is)
 * @returns Effect that resolves to the backend package name
 * @since 1.0.0
 * @internal
 */
const getBackendPackageName = (currentDir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const packageJsonPath = path.join(currentDir, "package.json");
    const exists = yield* fs.exists(packageJsonPath);

    if (exists) {
      const content = yield* fs.readFileString(packageJsonPath);
      const packageJson = JSON.parse(content);

      if (packageJson.name) {
        return packageJson.name;
      }
    }

    // Fallback: use @monorepo/backend if package name not found
    return "@monorepo/backend";
  });

/**
 * Creates environment files for apps that reference the generated types.
 *
 * @returns Effect that completes when environment files are created
 * @since 1.0.0
 * @internal
 */
const createEnvironmentFiles = () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const monorepoRoot = yield* findMonorepoRoot(process.cwd());

    // Detect if this is a monorepo and get app directories dynamically
    const { isMonorepo, appDirectories } =
      yield* detectAppDirectories(monorepoRoot);

    if (!isMonorepo) {
      // Not a monorepo - skip environment file generation
      return;
    }

    const backendPackageName = yield* getBackendPackageName(process.cwd());

    for (const appDir of appDirectories) {
      const appPath = path.join(monorepoRoot, appDir);
      const exists = yield* fs.exists(appPath);

      if (exists) {
        const envFilePath = path.join(appPath, "confect-env.d.ts");

        const content = `// Auto-generated by confect-generate - loads Confect error types automatically
// This file should be committed to version control for other developers and CI/CD
// Re-run 'confect-generate' if you modify your Convex functions with new error types
/// <reference types="${backendPackageName}/confect-types" />

export {}
`;

        yield* fs.writeFileString(envFilePath, content);
        yield* Console.log(`✅ Environment file created: ${envFilePath}`);
      }
    }
  });
