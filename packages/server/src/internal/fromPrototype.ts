export const fromPrototype = <P extends object>(prototype: P): P =>
  // oxlint-disable-next-line typescript/no-unsafe-return -- Cron and registry values inherit their public brand without adding it to their serializable fields. Object.create's library signature erases the prototype type.
  Object.create(prototype);
