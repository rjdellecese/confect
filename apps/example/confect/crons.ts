import { Cron, Duration } from "effect";
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
      Cron.unsafeParse("0 9 * * 1"),
      refs.internal.notes_and_random.notes.insertDefault,
      { text: "Weekly reminder: review your notes!" },
    ),
  );
