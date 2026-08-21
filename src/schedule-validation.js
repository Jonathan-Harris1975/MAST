const WEEKDAYS = new Set(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]);
const TIMED_TYPES = new Set(["weekly", "monthly", "nth-weekday-monthly", "once"]);
const KNOWN_TYPES = new Set(["manual", "interval", "weekly", "monthly", "nth-weekday-monthly", "once", "pretrigger", "posttrigger"]);

function validTime(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || ""));
  return Boolean(match && Number(match[1]) <= 23 && Number(match[2]) <= 59);
}

function validTimezone(value) {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: String(value || "") }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function nonNegativeFinite(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0;
}

export function validateJobRegistry(jobs = []) {
  const errors = [];
  const ids = new Set();
  const availableIds = new Set(jobs.map((job) => job?.id).filter(Boolean));

  for (const job of jobs) {
    const id = String(job?.id || "").trim();
    if (!id) {
      errors.push({ job: null, field: "id", message: "Job id is required." });
      continue;
    }
    if (ids.has(id)) errors.push({ job: id, field: "id", message: "Duplicate job id." });
    ids.add(id);

    const schedule = job?.schedule || {};
    if (!KNOWN_TYPES.has(schedule.type)) {
      errors.push({ job: id, field: "schedule.type", message: `Unknown schedule type: ${schedule.type || "<missing>"}.` });
      continue;
    }

    if (TIMED_TYPES.has(schedule.type)) {
      if (!validTime(schedule.time)) errors.push({ job: id, field: "schedule.time", message: `Invalid HH:MM time: ${schedule.time || "<missing>"}.` });
      if (!validTimezone(schedule.timezone)) errors.push({ job: id, field: "schedule.timezone", message: `Invalid IANA timezone: ${schedule.timezone || "<missing>"}.` });
      const catchUpMinutes = schedule.catchUpMinutes ?? 0;
      if (!nonNegativeFinite(catchUpMinutes)) errors.push({ job: id, field: "schedule.catchUpMinutes", message: "Catch-up minutes must be a non-negative finite number." });
    }

    if (schedule.type === "weekly") {
      if (!Array.isArray(schedule.days) || !schedule.days.length || schedule.days.some((day) => !WEEKDAYS.has(String(day).toLowerCase()))) {
        errors.push({ job: id, field: "schedule.days", message: "Weekly schedules require one or more valid weekday names." });
      }
    }

    if (schedule.type === "monthly") {
      const day = Number(schedule.dayOfMonth);
      if (!Number.isInteger(day) || day < 1 || day > 31) errors.push({ job: id, field: "schedule.dayOfMonth", message: "Monthly dayOfMonth must be an integer from 1 to 31." });
    }

    if (schedule.type === "nth-weekday-monthly") {
      if (!WEEKDAYS.has(String(schedule.weekday || "").toLowerCase())) errors.push({ job: id, field: "schedule.weekday", message: "nth-weekday-monthly requires a valid weekday." });
      const occurrence = Number(schedule.occurrence);
      if (!Number.isInteger(occurrence) || occurrence < 1 || occurrence > 5) errors.push({ job: id, field: "schedule.occurrence", message: "nth-weekday-monthly occurrence must be an integer from 1 to 5." });
    }

    if (schedule.type === "once" && !/^\d{4}-\d{2}-\d{2}$/.test(String(schedule.date || ""))) {
      errors.push({ job: id, field: "schedule.date", message: "Once schedules require a YYYY-MM-DD date." });
    }

    if (schedule.type === "interval" && (!Number.isFinite(Number(schedule.everyMinutes)) || Number(schedule.everyMinutes) <= 0)) {
      errors.push({ job: id, field: "schedule.everyMinutes", message: "Interval schedules require everyMinutes > 0." });
    }

    if (["pretrigger", "posttrigger"].includes(schedule.type)) {
      const sourceJobId = String(schedule.sourceJobId || job.sourceJobId || "").trim();
      if (!sourceJobId || !availableIds.has(sourceJobId)) errors.push({ job: id, field: "schedule.sourceJobId", message: `Source job does not exist: ${sourceJobId || "<missing>"}.` });
      if (schedule.type === "pretrigger" && (!Number.isFinite(Number(schedule.offsetMinutes)) || Number(schedule.offsetMinutes) <= 0)) {
        errors.push({ job: id, field: "schedule.offsetMinutes", message: "Pretrigger offsetMinutes must be a positive finite number." });
      }
      if (schedule.type === "posttrigger" && !nonNegativeFinite(schedule.delayMinutes)) {
        errors.push({ job: id, field: "schedule.delayMinutes", message: "Posttrigger delayMinutes must be a non-negative finite number." });
      }
    }
  }

  return errors;
}
