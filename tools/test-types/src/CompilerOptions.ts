export type AllowsExplicitUndefined = { value: undefined } extends {
  value?: never;
}
  ? true
  : false;
