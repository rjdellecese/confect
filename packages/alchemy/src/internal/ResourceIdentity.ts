export const resourceName = (
  kind: "project" | "deployment" | "key",
  instanceId: string,
) => `confect-${kind}-i${instanceId}`;
