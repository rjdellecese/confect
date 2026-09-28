import type { ScopedPlanStatusSession } from "alchemy/Report";
import type * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import { vi } from "vitest";

import {
  ConvexClient,
  ConvexNotFound,
  type Deployment,
  type DeployKey,
  type Project,
  type CreateDeploymentInput,
  type UpdateProjectInput,
} from "../../src/ConvexClient";

export const lifecycle = {
  id: "test",
  fqn: "test",
  instanceId: "0123456789abcdef",
  bindings: [],
  session: {
    emit: () => Effect.void,
    done: () => Effect.void,
    note: () => Effect.void,
  } satisfies ScopedPlanStatusSession,
};

export const project = (overrides: Partial<Project> = {}): Project => ({
  id: 1,
  teamId: 10,
  name: "example",
  slug: "example",
  teamSlug: "team",
  createTime: 0,
  ...overrides,
});

export const deployment = (
  overrides: Partial<Extract<Deployment, { kind: "cloud" }>> = {},
): Extract<Deployment, { kind: "cloud" }> => ({
  id: 1,
  name: "happy-otter-123",
  projectId: 1,
  deploymentType: "prod",
  kind: "cloud",
  reference: "example",
  region: "aws-us-east-1",
  deploymentUrl: "https://happy-otter-123.convex.cloud",
  isDefault: false,
  class: "default",
  createTime: 0,
  ...overrides,
});

export const key = (overrides: Partial<DeployKey> = {}): DeployKey => ({
  id: 1,
  name: "example",
  creationTime: 0,
  allowedActions: ["deployment:deploy"],
  ...overrides,
});

export const mockClient = (options: { readonly deployKey?: string } = {}) => {
  const issuedKeys = new Map<string, number>();
  const state: {
    projects: Project[];
    deployments: Deployment[];
    keys: DeployKey[];
    variables: Record<string, Redacted.Redacted<string>>;
  } = { projects: [], deployments: [], keys: [], variables: {} };
  const missing = () =>
    new ConvexNotFound({ operation: "test", code: "HttpError", status: 404 });
  const client = {
    listProjects: vi.fn(() => Effect.sync(() => state.projects)),
    getProject: vi.fn((id: number) =>
      Effect.suspend(() => {
        const found = state.projects.find((value) => value.id === id);
        return found ? Effect.succeed(found) : Effect.fail(missing());
      }),
    ),
    createProject: vi.fn((_teamId: number, input: { projectName: string }) =>
      Effect.sync(() => {
        const created = project({ name: input.projectName });
        state.projects.push(created);
        return { id: created.id, projectId: created.id, slug: created.slug };
      }),
    ),
    updateProject: vi.fn((id: number, input: UpdateProjectInput) =>
      Effect.sync(() => {
        const updated = project({
          id,
          ...(input.name == null ? {} : { name: input.name }),
        });
        state.projects = state.projects.map((value) =>
          value.id === id ? updated : value,
        );
        return updated;
      }),
    ),
    deleteProject: vi.fn((id: number) =>
      Effect.suspend(() => {
        if (!state.projects.some((value) => value.id === id))
          return Effect.fail(missing());
        state.projects = state.projects.filter((value) => value.id !== id);
        return Effect.void;
      }),
    ),
    listDeployments: vi.fn(() => Effect.sync(() => state.deployments)),
    getDeployment: vi.fn((name: string) =>
      Effect.suspend(() => {
        const found = state.deployments.find((value) => value.name === name);
        return found ? Effect.succeed(found) : Effect.fail(missing());
      }),
    ),
    createDeployment: vi.fn(
      (_projectId: number, input: CreateDeploymentInput) =>
        Effect.sync(() => {
          const created = deployment({
            deploymentType: input.type,
            reference: input.reference,
            region: input.region ?? "aws-us-east-1",
          });
          state.deployments.push(created);
          return created;
        }),
    ),
    updateDeployment: vi.fn(
      (name: string, input: { reference?: string | null }) =>
        Effect.sync(() => {
          state.deployments = state.deployments.map((value) =>
            value.name === name && value.kind === "cloud"
              ? { ...value, reference: input.reference ?? value.reference }
              : value,
          );
        }),
    ),
    deleteDeployment: vi.fn((name: string) =>
      Effect.suspend(() => {
        if (!state.deployments.some((value) => value.name === name))
          return Effect.fail(missing());
        state.deployments = state.deployments.filter(
          (value) => value.name !== name,
        );
        return Effect.void;
      }),
    ),
    listDeployKeys: vi.fn(() => Effect.sync(() => state.keys)),
    createDeployKey: vi.fn((_name: string, input: { name: string }) =>
      Effect.sync(() => {
        state.keys.push(key({ name: input.name }));
        const secret = options.deployKey ?? "test-secret";
        issuedKeys.set(secret, 1);
        return { deployKey: Redacted.make(secret) };
      }),
    ),
    deleteDeployKey: vi.fn(
      (_name: string, identifier: string | Redacted.Redacted<string>) =>
        Effect.suspend(() => {
          const value =
            typeof identifier === "string"
              ? identifier
              : Redacted.value(identifier);
          const id =
            issuedKeys.get(value) ??
            state.keys.find((candidate) => candidate.name === value)?.id;
          if (!state.keys.some((candidate) => candidate.id === id))
            return Effect.fail(missing());
          state.keys = state.keys.filter((candidate) => candidate.id !== id);
          return Effect.void;
        }),
    ),
    listEnvironmentVariables: vi.fn(() => Effect.sync(() => state.variables)),
    updateEnvironmentVariables: vi.fn(
      (
        _url: string,
        _key: Redacted.Redacted<string>,
        changes: readonly {
          name: string;
          value?: string | Redacted.Redacted<string> | null;
        }[],
      ) =>
        Effect.sync(() => {
          for (const change of changes) {
            if (change.value == null) delete state.variables[change.name];
            else
              state.variables[change.name] =
                typeof change.value === "string"
                  ? Redacted.make(change.value)
                  : change.value;
          }
        }),
    ),
  } satisfies Context.Service.Shape<typeof ConvexClient>;
  return { client, state, layer: Layer.succeed(ConvexClient, client) };
};
