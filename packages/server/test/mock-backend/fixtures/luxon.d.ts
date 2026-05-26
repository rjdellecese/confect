declare module "luxon" {
  export class DateTime {
    static now(): DateTime;
    toISO(): string | null;
  }
}
