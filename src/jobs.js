export const SERVICE_NAME = "koyeb-cron-control";
export const LOCAL_TIME_ZONE = "Europe/London";
export const USER_AGENT = "Jonathan-Harris-Koyeb-Cron-Control/1.0 (+https://jonathan-harris.online)";

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const WEEKDAYS_MON_TO_FRI = ["monday", "tuesday", "wednesday", "thursday", "friday"];

function endpoint(envName, fallbackUrl) {
  const configured = process.env[envName];
  return configured && configured.trim() ? configured.trim() : fallbackUrl;
}

function postJob({ id, group, description, schedule, hookEnv, fallbackUrl, targetUrl, targetPath, body, addLocalDateAsWeekStartDate = false }) {
  return {
    id,
    group,
    description,
    method: "POST",
    schedule,
    hookEnv,
    url: endpoint(hookEnv, fallbackUrl),
    targetUrl,
    targetPath,
    body: body || {},
    addLocalDateAsWeekStartDate,
  };
}

function getJob({ id, group, description, schedule, hookEnv, fallbackUrl, targetUrl, targetPath }) {
  return {
    id,
    group,
    description,
    method: "GET",
    schedule,
    hookEnv,
    url: endpoint(hookEnv, fallbackUrl),
    targetUrl,
    targetPath,
  };
}

const rssRewrite = postJob({
  id: "rss-rewrite",
  group: "rss",
  description: "Run the RSS rewrite pipeline.",
  schedule: { type: "weekly", days: WEEKDAYS, time: "09:00", timezone: LOCAL_TIME_ZONE },
  hookEnv: "HOOK_RSS_REWRITE",
  fallbackUrl: "https://hooks.jonathan-harris.online/x20n0wzcy7t5s0",
  targetUrl: "https://app.jonathan-harris.online/rss/rewrite",
  targetPath: "/rss/rewrite",
  body: { batchSize: 5 },
});

const outreachBatchNext = postJob({
  id: "outreach-batch-next",
  group: "outreach",
  description: "Process the next outreach batch.",
  schedule: { type: "weekly", days: WEEKDAYS_MON_TO_FRI, time: "09:30", timezone: LOCAL_TIME_ZONE },
  hookEnv: "HOOK_OUTREACH_BATCH_NEXT",
  fallbackUrl: "https://hooks.jonathan-harris.online/ni7jxprq9hdc4r",
  targetUrl: "https://app.jonathan-harris.online/outreach/batch/next",
  targetPath: "/outreach/batch/next",
});

const podcastRun = postJob({
  id: "podcast-run",
  group: "podcast",
  description: "Trigger the podcast pipeline.",
  schedule: { type: "weekly", days: ["friday"], time: "10:00", timezone: LOCAL_TIME_ZONE },
  hookEnv: "HOOK_PODCAST_RUN",
  fallbackUrl: "https://hooks.jonathan-harris.online/x7td31z6y149hn",
  targetUrl: "https://app.jonathan-harris.online/podcast/run",
  targetPath: "/podcast/run",
});

const blogWeeklyBuild = postJob({
  id: "blog-weekly-build",
  group: "blog",
  description: "Build the weekly blog package.",
  schedule: { type: "weekly", days: ["monday"], time: "16:00", timezone: LOCAL_TIME_ZONE },
  hookEnv: "HOOK_BLOG_WEEKLY_BUILD",
  fallbackUrl: "https://hooks.jonathan-harris.online/1ir1t71n70n5dc",
  targetUrl: "https://app.jonathan-harris.online/blog/weekly/build",
  targetPath: "/blog/weekly/build",
});

const blogDailySocialBuild = postJob({
  id: "blog-daily-social-build",
  group: "blog",
  description: "Build and publish the daily social media blog RSS package.",
  schedule: { type: "weekly", days: WEEKDAYS, time: "09:30", timezone: LOCAL_TIME_ZONE },
  hookEnv: "HOOK_BLOG_DAILY_SOCIAL_BUILD",
  fallbackUrl: "https://hooks.jonathan-harris.online/2nsz3yuc5xh7kb",
  targetUrl: "Configured in Hookdeck: POST /blog/social/daily/build",
  targetPath: "/blog/social/daily/build",
});

const oneUpDailyJobs = [
  postJob({
    id: "oneup-monday",
    group: "oneup-daily",
    description: "Trigger Monday Motivation post build and schedule for Monday.",
    schedule: { type: "weekly", days: ["sunday"], time: "23:15", timezone: LOCAL_TIME_ZONE },
    hookEnv: "HOOK_ONEUP_MONDAY",
    fallbackUrl: "https://hooks.jonathan-harris.online/iq3gwfe8jyscu4",
    targetUrl: "https://app.jonathan-harris.online/oneup/daily/monday",
    targetPath: "/oneup/daily/monday",
  }),
  postJob({
    id: "oneup-tuesday",
    group: "oneup-daily",
    description: "Trigger Tuesday Tech Talk post build and schedule for Tuesday.",
    schedule: { type: "weekly", days: ["monday"], time: "23:15", timezone: LOCAL_TIME_ZONE },
    hookEnv: "HOOK_ONEUP_TUESDAY",
    fallbackUrl: "https://hooks.jonathan-harris.online/99pn7sfg27d0rj",
    targetUrl: "https://app.jonathan-harris.online/oneup/daily/tuesday",
    targetPath: "/oneup/daily/tuesday",
  }),
  postJob({
    id: "oneup-wednesday",
    group: "oneup-daily",
    description: "Trigger Wednesday Writer's Corner post build and schedule for Wednesday.",
    schedule: { type: "weekly", days: ["tuesday"], time: "23:15", timezone: LOCAL_TIME_ZONE },
    hookEnv: "HOOK_ONEUP_WEDNESDAY",
    fallbackUrl: "https://hooks.jonathan-harris.online/rp2hw3rjj1ol8n",
    targetUrl: "https://app.jonathan-harris.online/oneup/daily/wednesday",
    targetPath: "/oneup/daily/wednesday",
  }),
  postJob({
    id: "oneup-thursday",
    group: "oneup-daily",
    description: "Trigger Thursday Industry AI post build and schedule for Thursday.",
    schedule: { type: "weekly", days: ["wednesday"], time: "23:15", timezone: LOCAL_TIME_ZONE },
    hookEnv: "HOOK_ONEUP_THURSDAY",
    fallbackUrl: "https://hooks.jonathan-harris.online/2gl53wz1k09mdk",
    targetUrl: "https://app.jonathan-harris.online/oneup/daily/thursday",
    targetPath: "/oneup/daily/thursday",
  }),
  postJob({
    id: "oneup-friday",
    group: "oneup-daily",
    description: "Trigger Friday post build and schedule for Friday.",
    schedule: { type: "weekly", days: ["thursday"], time: "23:15", timezone: LOCAL_TIME_ZONE },
    hookEnv: "HOOK_ONEUP_FRIDAY",
    fallbackUrl: "https://hooks.jonathan-harris.online/v8sxcm5w25n8pr",
    targetUrl: "https://app.jonathan-harris.online/oneup/daily/friday",
    targetPath: "/oneup/daily/friday",
  }),
  postJob({
    id: "oneup-saturday",
    group: "oneup-daily",
    description: "Trigger Saturday post build and schedule for Saturday.",
    schedule: { type: "weekly", days: ["friday"], time: "23:15", timezone: LOCAL_TIME_ZONE },
    hookEnv: "HOOK_ONEUP_SATURDAY",
    fallbackUrl: "https://hooks.jonathan-harris.online/snhyppsii91c7l",
    targetUrl: "https://app.jonathan-harris.online/oneup/daily/saturday",
    targetPath: "/oneup/daily/saturday",
  }),
  postJob({
    id: "oneup-sunday",
    group: "oneup-daily",
    description: "Trigger Sunday post build and schedule for Sunday.",
    schedule: { type: "weekly", days: ["saturday"], time: "23:15", timezone: LOCAL_TIME_ZONE },
    hookEnv: "HOOK_ONEUP_SUNDAY",
    fallbackUrl: "https://hooks.jonathan-harris.online/krt5ukg8oz6jfy",
    targetUrl: "https://app.jonathan-harris.online/oneup/daily/sunday",
    targetPath: "/oneup/daily/sunday",
  }),
];

const oneUpWeeklyQuiz = postJob({
  id: "oneup-weekly-quiz",
  group: "oneup-quiz",
  description: "Build and schedule the weekly AI quiz pair.",
  schedule: { type: "weekly", days: ["sunday"], time: "23:20", timezone: LOCAL_TIME_ZONE },
  hookEnv: "HOOK_ONEUP_WEEKLY_QUIZ",
  fallbackUrl: "https://hooks.jonathan-harris.online/rq5203mvuwvcsf",
  targetUrl: "https://app.jonathan-harris.online/oneup/quiz/weekly",
  targetPath: "/oneup/quiz/weekly",
});

const monthlyAuditJobs = [
  postJob({
    id: "seo-aeo-geo-audit",
    group: "audits",
    description: "Run the SEO/AEO/GEO audit once a month.",
    schedule: { type: "monthly", dayOfMonth: 1, time: "02:00", timezone: "UTC" },
    hookEnv: "HOOK_AUDIT_SEO_AEO_GEO",
    fallbackUrl: "https://hooks.jonathan-harris.online/q36ha3y3919gzf",
    targetUrl: "Configured in Hookdeck: POST /audits/seo-aeo-geo/run",
    targetPath: "/audits/seo-aeo-geo/run",
    body: {
      requestedBy: SERVICE_NAME,
      notes: "Scheduled monthly SEO/AEO/GEO audit from Koyeb cron control.",
    },
  }),
  postJob({
    id: "on-brand-audit",
    group: "audits",
    description: "Run the on-brand audit once a month across OneUp, podcast transcripts, and RSS.",
    schedule: { type: "monthly", dayOfMonth: 1, time: "02:00", timezone: "UTC" },
    hookEnv: "HOOK_AUDIT_ON_BRAND",
    fallbackUrl: "https://hooks.jonathan-harris.online/nnryoo0m8ab3d9",
    targetUrl: "Configured in Hookdeck: POST /audits/on-brand/run",
    targetPath: "/audits/on-brand/run",
    body: {
      lookbackDays: 7,
      includeOneUp: true,
      includePodcastTranscripts: true,
      includeRss: true,
      dryRun: false,
    },
  }),
  postJob({
    id: "mobile-audit",
    group: "audits",
    description: "Run the mobile UX audit once a month.",
    schedule: { type: "monthly", dayOfMonth: 1, time: "02:00", timezone: "UTC" },
    hookEnv: "HOOK_AUDIT_MOBILE_UX",
    fallbackUrl: "https://hooks.jonathan-harris.online/0xtlks9y88br6o",
    targetUrl: "Configured in Hookdeck: POST /audits/mobile-ux/run",
    targetPath: "/audits/mobile-ux/run",
    body: {
      requestedBy: SERVICE_NAME,
      notes: "Scheduled monthly mobile UX audit from Koyeb cron control.",
    },
  }),
];

const oneUpEbooksWeekly = postJob({
  id: "oneup-ebooks-weekly",
  group: "oneup-ebooks",
  description: "Schedule the Tuesday, Thursday, and Saturday ebook posts for the current featured book.",
  schedule: { type: "weekly", days: ["monday"], time: "08:00", timezone: LOCAL_TIME_ZONE },
  hookEnv: "HOOK_ONEUP_EBOOKS_WEEKLY",
  fallbackUrl: "https://hooks.jonathan-harris.online/l3i92ciqk8tsy5",
  targetUrl: "Configured in Hookdeck: POST /oneup/ebooks/weekly",
  targetPath: "/oneup/ebooks/weekly",
  addLocalDateAsWeekStartDate: true,
  body: {
    dryRun: false,
    categoryName: "Ebooks",
    socialNetworkId: "ALL",
    usePodcastFeaturedBook: true,
  },
});

const healthPing = getJob({
  id: "suite-health-ping",
  group: "health",
  description: "Ping the AI Management Suite health endpoint via Hookdeck every 45 minutes.",
  schedule: { type: "interval", everyMinutes: 45 },
  hookEnv: "HOOK_HEALTH_PING",
  fallbackUrl: "https://hooks.jonathan-harris.online/dw5subfnlocutv",
  targetUrl: "Configured in Hookdeck: GET health endpoint",
  targetPath: "/health",
});

export const jobs = [
  rssRewrite,
  outreachBatchNext,
  podcastRun,
  blogWeeklyBuild,
  blogDailySocialBuild,
  ...oneUpDailyJobs,
  oneUpWeeklyQuiz,
  ...monthlyAuditJobs,
  oneUpEbooksWeekly,
  healthPing,
];
