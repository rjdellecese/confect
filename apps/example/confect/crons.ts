import * as Cron from "effect/Cron";
import * as Duration from "effect/Duration";
import { CronJob, CronJobs } from "@confect/server";
import refs from "./_generated/refs";

export default CronJobs.make()
  .add(
    CronJob.make(
      "clear all notes",
      Duration.hours(24),
      refs.internal.notes_and_random.notes.clearAll,
    ),
  )
  .add(
    CronJob.make(
      "insert default note",
      Cron.parseUnsafe("0 9 * * 1"),
      refs.internal.notes_and_random.notes.insertDefault,
      { text: "Weekly reminder: review your notes!" },
    ),
  );
