const WORKER_NAME = "Master-trigger-control";
const TIME_ZONE = "Europe/London";
const USER_AGENT = "Jonathan-Harris-Cron-Worker/1.0 (+https://jonathan-harris.online)";
const JOBS = [
  {
    "name": "rss-rewrite",
    "localDay": "monday",
    "localTime": "09:00",
    "method": "POST",
    "hookdeckUrl": "https://hooks.jonathan-harris.online/x20n0wzcy7t5s0",
    "targetUrl": "https://app.jonathan-harris.online/rss/rewrite",
    "description": "Run the RSS rewrite pipeline.",
    "body": {
      "batchSize": 5
    }
  },
  {
    "name": "rss-rewrite",
    "localDay": "tuesday",
    "localTime": "09:00",
    "method": "POST",
    "hookdeckUrl": "https://hooks.jonathan-harris.online/x20n0wzcy7t5s0",
    "targetUrl": "https://app.jonathan-harris.online/rss/rewrite",
    "description": "Run the RSS rewrite pipeline.",
    "body": {
      "batchSize": 5
    }
  },
  {
    "name": "rss-rewrite",
    "localDay": "wednesday",
    "localTime": "09:00",
    "method": "POST",
    "hookdeckUrl": "https://hooks.jonathan-harris.online/x20n0wzcy7t5s0",
    "targetUrl": "https://app.jonathan-harris.online/rss/rewrite",
    "description": "Run the RSS rewrite pipeline.",
    "body": {
      "batchSize": 5
    }
  },
  {
    "name": "rss-rewrite",
    "localDay": "thursday",
    "localTime": "09:00",
    "method": "POST",
    "hookdeckUrl": "https://hooks.jonathan-harris.online/x20n0wzcy7t5s0",
    "targetUrl": "https://app.jonathan-harris.online/rss/rewrite",
    "description": "Run the RSS rewrite pipeline.",
    "body": {
      "batchSize": 5
    }
  },
  {
    "name": "rss-rewrite",
    "localDay": "friday",
    "localTime": "09:00",
    "method": "POST",
    "hookdeckUrl": "https://hooks.jonathan-harris.online/x20n0wzcy7t5s0",
    "targetUrl": "https://app.jonathan-harris.online/rss/rewrite",
    "description": "Run the RSS rewrite pipeline.",
    "body": {
      "batchSize": 5
    }
  },
  {
    "name": "rss-rewrite",
    "localDay": "saturday",
    "localTime": "09:00",
    "method": "POST",
    "hookdeckUrl": "https://hooks.jonathan-harris.online/x20n0wzcy7t5s0",
    "targetUrl": "https://app.jonathan-harris.online/rss/rewrite",
    "description": "Run the RSS rewrite pipeline.",
    "body": {
      "batchSize": 5
    }
  },
  {
    "name": "rss-rewrite",
    "localDay": "sunday",
    "localTime": "09:00",
    "method": "POST",
    "hookdeckUrl": "https://hooks.jonathan-harris.online/x20n0wzcy7t5s0",
    "targetUrl": "https://app.jonathan-harris.online/rss/rewrite",
    "description": "Run the RSS rewrite pipeline.",
    "body": {
      "batchSize": 5
    }
  },
  {
    "name": "outreach-batch-next",
    "localDay": "monday",
    "localTime": "09:30",
    "method": "POST",
    "hookdeckUrl": "https://hooks.jonathan-harris.online/ni7jxprq9hdc4r",
    "targetUrl": "https://app.jonathan-harris.online/outreach/batch/next",
    "description": "Process the next outreach batch."
  },
  {
    "name": "outreach-batch-next",
    "localDay": "tuesday",
    "localTime": "09:30",
    "method": "POST",
    "hookdeckUrl": "https://hooks.jonathan-harris.online/ni7jxprq9hdc4r",
    "targetUrl": "https://app.jonathan-harris.online/outreach/batch/next",
    "description": "Process the next outreach batch."
  },
  {
    "name": "outreach-batch-next",
    "localDay": "wednesday",
    "localTime": "09:30",
    "method": "POST",
    "hookdeckUrl": "https://hooks.jonathan-harris.online/ni7jxprq9hdc4r",
    "targetUrl": "https://app.jonathan-harris.online/outreach/batch/next",
    "description": "Process the next outreach batch."
  },
  {
    "name": "outreach-batch-next",
    "localDay": "thursday",
    "localTime": "09:30",
    "method": "POST",
    "hookdeckUrl": "https://hooks.jonathan-harris.online/ni7jxprq9hdc4r",
    "targetUrl": "https://app.jonathan-harris.online/outreach/batch/next",
    "description": "Process the next outreach batch."
  },
  {
    "name": "outreach-batch-next",
    "localDay": "friday",
    "localTime": "09:30",
    "method": "POST",
    "hookdeckUrl": "https://hooks.jonathan-harris.online/ni7jxprq9hdc4r",
    "targetUrl": "https://app.jonathan-harris.online/outreach/batch/next",
    "description": "Process the next outreach batch."
  },
  {
    "name": "podcast-run",
    "localDay": "friday",
    "localTime": "10:00",
    "method": "POST",
    "hookdeckUrl": "https://hooks.jonathan-harris.online/x7td31z6y149hn",
    "targetUrl": "https://app.jonathan-harris.online/podcast/run",
    "description": "Trigger the podcast pipeline."
  },
  {
    "name": "blog-weekly-build",
    "localDay": "monday",
    "localTime": "16:00",
    "method": "POST",
    "hookdeckUrl": "https://hooks.jonathan-harris.online/1ir1t71n70n5dc",
    "targetUrl": "https://app.jonathan-harris.online/blog/weekly/build",
    "description": "Build the weekly blog package."
  }
];

function buildJsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function localParts(at) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const parts = Object.fromEntries(
    formatter
      .formatToParts(at)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  return {
    weekday: String(parts.weekday || "").toLowerCase(),
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

async function executeJob(job, context) {
  const headers = new Headers({
    "user-agent": USER_AGENT,
    "x-trigger-worker": WORKER_NAME,
    "x-trigger-job": job.name,
    "content-type": "application/json; charset=utf-8",
  });

  const body = job.method === "POST"
    ? JSON.stringify(job.body && Object.keys(job.body).length ? job.body : {})
    : undefined;

  const response = await fetch(job.hookdeckUrl, {
    method: job.method,
    headers,
    body,
    redirect: "follow",
  });

  const responseText = await response.text();

  const result = {
    job: job.name,
    description: job.description,
    method: job.method,
    hookdeckUrl: job.hookdeckUrl,
    targetUrl: job.targetUrl,
    localDay: job.localDay,
    localTime: job.localTime,
    localDate: context.local.date,
    scheduledUtc: context.utc.toISOString(),
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    responsePreview: responseText.slice(0, 500),
  };

  console.log(JSON.stringify(result));

  if (!response.ok) {
    throw new Error(`${job.name} failed with ${response.status} ${response.statusText}`);
  }

  return result;
}

export default {
  async scheduled(controller) {
    const utcNow = new Date(controller.scheduledTime);
    const local = localParts(utcNow);
    const dueJobs = JOBS.filter((job) => job.localDay === local.weekday && job.localTime === local.time);

    if (!dueJobs.length) {
      console.log(JSON.stringify({
        worker: WORKER_NAME,
        noop: true,
        scheduledUtc: utcNow.toISOString(),
        localDay: local.weekday,
        localDate: local.date,
        localTime: local.time,
      }));
      return;
    }

    const results = [];
    for (const job of dueJobs) {
      const result = await executeJob(job, { utc: utcNow, local });
      results.push(result);
    }

    console.log(JSON.stringify({
      worker: WORKER_NAME,
      ok: true,
      ran: results.length,
      scheduledUtc: utcNow.toISOString(),
      localDay: local.weekday,
      localDate: local.date,
      localTime: local.time,
      jobs: results.map((item) => ({ job: item.job, status: item.status })),
    }));
  },

  async fetch(request) {
    const url = new URL(request.url);
    return buildJsonResponse({
      ok: true,
      worker: WORKER_NAME,
      timezone: TIME_ZONE,
      nowUtc: new Date().toISOString(),
      requestPath: url.pathname,
      jobs: JOBS,
    });
  },
};
