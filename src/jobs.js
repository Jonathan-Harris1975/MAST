export const SERVICE_NAME = "MAST";
export const LOCAL_TIME_ZONE = "Europe/London";
export const USER_AGENT = "Jonathan-Harris-MAST/1.2.3 (+https://jonathan-harris.online)";

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const WEEKDAYS_MON_TO_FRI = ["monday", "tuesday", "wednesday", "thursday", "friday"];
const AM_WAKE_TIME = String(process.env.MAST_AM_WAKE_TIME || "07:30");
const AM_OPERATION_TIME = String(process.env.MAST_AM_OPERATION_TIME || "08:00");
const AM_WAKE_CATCH_UP_MINUTES = Math.max(0, Number(process.env.MAST_AM_WAKE_CATCH_UP_MINUTES || 120));
const AM_OPERATION_CATCH_UP_MINUTES = Math.max(0, Number(process.env.MAST_AM_OPERATION_CATCH_UP_MINUTES || 180));
const FRIDAY_PM_WAKE_TIME = String(process.env.MAST_FRIDAY_PM_WAKE_TIME || "14:30");
const FRIDAY_PM_OPERATION_TIME = String(process.env.MAST_FRIDAY_PM_OPERATION_TIME || "15:00");
const FRIDAY_PM_WAKE_CATCH_UP_MINUTES = Math.max(0, Number(process.env.MAST_FRIDAY_PM_WAKE_CATCH_UP_MINUTES || 120));
const FRIDAY_PM_OPERATION_CATCH_UP_MINUTES = Math.max(0, Number(process.env.MAST_FRIDAY_PM_OPERATION_CATCH_UP_MINUTES || 180));
const WEBSITE_AUDIT_WAKE_TIME = String(process.env.MAST_WEBSITE_AUDIT_WAKE_TIME || "10:00");
const WEBSITE_AUDIT_RUN_TIME = String(process.env.MAST_WEBSITE_AUDIT_RUN_TIME || "10:30");
const WEBSITE_AUDIT_WAKE_CATCH_UP_MINUTES = Math.max(0, Number(process.env.MAST_WEBSITE_AUDIT_WAKE_CATCH_UP_MINUTES || 120));
const WEBSITE_AUDIT_RUN_CATCH_UP_MINUTES = Math.max(0, Number(process.env.MAST_WEBSITE_AUDIT_RUN_CATCH_UP_MINUTES || 180));
const AIMS_AUDIT_WAKE_TIME = String(process.env.MAST_AIMS_AUDIT_WAKE_TIME || "09:00");
const AIMS_AUDIT_RUN_TIME = String(process.env.MAST_AIMS_AUDIT_RUN_TIME || "09:15");
const AIMS_AUDIT_WAKE_CATCH_UP_MINUTES = Math.max(0, Number(process.env.MAST_AIMS_AUDIT_WAKE_CATCH_UP_MINUTES || 120));
const AIMS_AUDIT_RUN_CATCH_UP_MINUTES = Math.max(0, Number(process.env.MAST_AIMS_AUDIT_RUN_CATCH_UP_MINUTES || 180));

function endpoint(envName, fallbackUrl) {
  const configured = process.env[envName];
  return configured && configured.trim() ? configured.trim() : fallbackUrl;
}

// Koyeb's REST API exposes POST /v1/services/{id}/pause and /v1/services/{id}/resume.
// Service IDs are environment-specific (not secret, but not portable across accounts),
// so they are read from env at startup rather than hardcoded.
// If a service id env var isn't set yet, the job still gets built (so job counts/tests stay
// stable) but points at a deliberately-broken URL that fails loudly in the run log instead
// of silently doing nothing.
export function koyebServiceUrl(serviceIdEnvName, action) {
  const serviceId = String(process.env[serviceIdEnvName] || "").trim();
  if (!serviceId) {
    return `https://app.koyeb.com/v1/services/UNSET-${serviceIdEnvName}/${action}`;
  }
  return `https://app.koyeb.com/v1/services/${serviceId}/${action}`;
}

function postJob({ id, group, description, schedule, urlEnv, fallbackUrl, targetUrl, targetPath, body, addLocalDateAsWeekStartDate = false, authEnv = null, asyncStatus = null, requiredServices = [], pretriggerOffsets = null }) {
  return {
    id,
    group,
    description,
    method: "POST",
    schedule,
    urlEnv,
    url: endpoint(urlEnv, fallbackUrl),
    targetUrl,
    targetPath,
    body: body || {},
    addLocalDateAsWeekStartDate,
    authEnv,
    asyncStatus,
    requiredServices,
    pretriggerOffsets,
  };
}

function getJob({ id, group, description, schedule, urlEnv, fallbackUrl, targetUrl, targetPath, authEnv = null }) {
  return {
    id,
    group,
    description,
    method: "GET",
    schedule,
    urlEnv,
    url: endpoint(urlEnv, fallbackUrl),
    targetUrl,
    targetPath,
    authEnv,
  };
}

const rssRewrite = postJob({
  id: "rss-rewrite",
  group: "rss",
  description: "Run the RSS rewrite pipeline.",
  schedule: { type: "manual" },
  urlEnv: null,
  fallbackUrl: "https://app.jonathan-harris.online/rss/rewrite",
  targetUrl: "https://app.jonathan-harris.online/rss/rewrite",
  targetPath: "/rss/rewrite",
  authEnv: "AIMS_API_KEY",
  body: { batchSize: 5 },
});

const outreachBatchNext = postJob({
  id: "outreach-batch-next",
  group: "outreach",
  description: "Process the next outreach batch.",
  schedule: { type: "manual" },
  urlEnv: null,
  fallbackUrl: "https://app.jonathan-harris.online/outreach/batch/next",
  targetUrl: "https://app.jonathan-harris.online/outreach/batch/next",
  targetPath: "/outreach/batch/next",
  authEnv: "AIMS_API_KEY",
});

const podcastRun = postJob({
  id: "podcast-run",
  group: "podcast",
  description: "Trigger the podcast pipeline.",
  schedule: { type: "manual" },
  urlEnv: null,
  fallbackUrl: "https://app.jonathan-harris.online/podcast/run",
  targetUrl: "https://app.jonathan-harris.online/podcast/run",
  targetPath: "/podcast/run",
  authEnv: "AIMS_API_KEY",
});

const blogWeeklyBuild = postJob({
  id: "blog-weekly-build",
  group: "blog",
  description: "Build the weekly blog package.",
  schedule: { type: "manual" },
  urlEnv: null,
  fallbackUrl: "https://app.jonathan-harris.online/blog/weekly/build",
  targetUrl: "https://app.jonathan-harris.online/blog/weekly/build",
  targetPath: "/blog/weekly/build",
  authEnv: "AIMS_API_KEY",
});

const blogDailySocialBuild = postJob({
  id: "blog-daily-social-build",
  group: "blog",
  description: "Build and publish the daily social media blog RSS package.",
  schedule: { type: "manual" },
  urlEnv: null,
  fallbackUrl: "https://app.jonathan-harris.online/blog/social/daily/build",
  targetUrl: "https://app.jonathan-harris.online/blog/social/daily/build",
  targetPath: "/blog/social/daily/build",
  authEnv: "AIMS_API_KEY",
});

const newsletterAiEdgeGenerate = postJob({
  id: "newsletter-ai-edge-generate",
  group: "newsletter",
  description: "Build today's AI Edge newsletter issue (RSS ingest, ranking, composition, QA loop and hero image) before the governed morning delivery step.",
  schedule: { type: "manual" },
  urlEnv: null,
  fallbackUrl: "https://app.jonathan-harris.online/newsletter/generate",
  targetUrl: "https://app.jonathan-harris.online/newsletter/generate",
  targetPath: "/newsletter/generate",
  authEnv: "AIMS_API_KEY",
  body: { profileId: "ai-edge" },
});

const newsletterAiEdgeSend = postJob({
  id: "newsletter-ai-edge-send",
  group: "newsletter",
  description: "Send today's built AI Edge newsletter issue via Brevo (creates the campaign and sends it immediately).",
  schedule: { type: "manual" },
  urlEnv: null,
  fallbackUrl: "https://app.jonathan-harris.online/newsletter/send",
  targetUrl: "https://app.jonathan-harris.online/newsletter/send",
  targetPath: "/newsletter/send",
  authEnv: "AIMS_API_KEY",
  body: { profileId: "ai-edge" },
});

const zernioDailyJobs = [
  postJob({
    id: "zernio-monday",
    group: "zernio-daily",
    description: "Trigger Monday Motivation post build and schedule for Monday.",
    schedule: { type: "manual" },
    urlEnv: null,
    fallbackUrl: "https://app.jonathan-harris.online/zernio/daily/monday",
    targetUrl: "https://app.jonathan-harris.online/zernio/daily/monday",
    targetPath: "/zernio/daily/monday",
    authEnv: "AIMS_API_KEY",
  }),
  postJob({
    id: "zernio-tuesday",
    group: "zernio-daily",
    description: "Trigger Tuesday Tech Talk post build and schedule for Tuesday.",
    schedule: { type: "manual" },
    urlEnv: null,
    fallbackUrl: "https://app.jonathan-harris.online/zernio/daily/tuesday",
    targetUrl: "https://app.jonathan-harris.online/zernio/daily/tuesday",
    targetPath: "/zernio/daily/tuesday",
    authEnv: "AIMS_API_KEY",
  }),
  postJob({
    id: "zernio-wednesday",
    group: "zernio-daily",
    description: "Trigger Wednesday Writer's Corner post build and schedule for Wednesday.",
    schedule: { type: "manual" },
    urlEnv: null,
    fallbackUrl: "https://app.jonathan-harris.online/zernio/daily/wednesday",
    targetUrl: "https://app.jonathan-harris.online/zernio/daily/wednesday",
    targetPath: "/zernio/daily/wednesday",
    authEnv: "AIMS_API_KEY",
  }),
  postJob({
    id: "zernio-thursday",
    group: "zernio-daily",
    description: "Trigger Thursday Industry AI post build and schedule for Thursday.",
    schedule: { type: "manual" },
    urlEnv: null,
    fallbackUrl: "https://app.jonathan-harris.online/zernio/daily/thursday",
    targetUrl: "https://app.jonathan-harris.online/zernio/daily/thursday",
    targetPath: "/zernio/daily/thursday",
    authEnv: "AIMS_API_KEY",
  }),
  postJob({
    id: "zernio-friday",
    group: "zernio-daily",
    description: "Trigger Friday post build and schedule for Friday.",
    schedule: { type: "manual" },
    urlEnv: null,
    fallbackUrl: "https://app.jonathan-harris.online/zernio/daily/friday",
    targetUrl: "https://app.jonathan-harris.online/zernio/daily/friday",
    targetPath: "/zernio/daily/friday",
    authEnv: "AIMS_API_KEY",
  }),
  postJob({
    id: "zernio-saturday",
    group: "zernio-daily",
    description: "Trigger Saturday post build and schedule for Saturday.",
    schedule: { type: "manual" },
    urlEnv: null,
    fallbackUrl: "https://app.jonathan-harris.online/zernio/daily/saturday",
    targetUrl: "https://app.jonathan-harris.online/zernio/daily/saturday",
    targetPath: "/zernio/daily/saturday",
    authEnv: "AIMS_API_KEY",
  }),
  postJob({
    id: "zernio-sunday",
    group: "zernio-daily",
    description: "Trigger Sunday post build and schedule for Sunday.",
    schedule: { type: "manual" },
    urlEnv: null,
    fallbackUrl: "https://app.jonathan-harris.online/zernio/daily/sunday",
    targetUrl: "https://app.jonathan-harris.online/zernio/daily/sunday",
    targetPath: "/zernio/daily/sunday",
    authEnv: "AIMS_API_KEY",
  }),
];

const zernioWeeklyQuiz = postJob({
  id: "zernio-weekly-quiz",
  group: "zernio-quiz",
  description: "Build and schedule the weekly AI quiz pair.",
  schedule: { type: "manual" },
  urlEnv: null,
  fallbackUrl: "https://app.jonathan-harris.online/zernio/quiz/weekly",
  targetUrl: "https://app.jonathan-harris.online/zernio/quiz/weekly",
  targetPath: "/zernio/quiz/weekly",
  authEnv: "AIMS_API_KEY",
});

const monthlyAuditJobs = [
  postJob({
    id: "website-audit-pipeline",
    group: "audits",
    description: `Run the complete website audit at ${WEBSITE_AUDIT_RUN_TIME} on the first Sunday of each month. AIMS owns the full council/report/RAMS sequence and MAST waits for terminal completion.`,
    schedule: { type: "nth-weekday-monthly", weekday: "sunday", occurrence: 1, time: WEBSITE_AUDIT_RUN_TIME, timezone: LOCAL_TIME_ZONE, catchUpMinutes: WEBSITE_AUDIT_RUN_CATCH_UP_MINUTES },
    urlEnv: null,
    fallbackUrl: `${aimsBaseUrl()}/audits/website/run`,
    targetUrl: `${aimsBaseUrl()}/audits/website/run`,
    targetPath: "/audits/website/run",
    authEnv: "AIMS_API_KEY",
    requiredServices: koyebPowerManagementEnabled() ? ["aims"] : [],
    pretriggerOffsets: { health: 20, preflight: 15, warmup: 10 },
    asyncStatus: {
      responseIdField: "sessionId",
      statusPath: "/audits/website/jobs/{id}",
      statusField: "job.status",
      successStatuses: ["completed"],
      pendingStatuses: ["queued", "accepted", "running"],
      failureStatuses: ["failed"],
    },
    body: {
      requestedBy: SERVICE_NAME,
      notes: "First-Sunday website audit. AIMS owns sequencing and final publication. RAMS is a downstream remediation handoff and must not block audit dispatch.",
    },
  }),
  postJob({
    id: "aims-audit-pipeline",
    group: "audits",
    description: `Run the complete AIMS audit at ${AIMS_AUDIT_RUN_TIME} on the second Saturday of each month. AIMS owns the full council/report/RAMS sequence.`,
    schedule: { type: "nth-weekday-monthly", weekday: "saturday", occurrence: 2, time: AIMS_AUDIT_RUN_TIME, timezone: LOCAL_TIME_ZONE, catchUpMinutes: AIMS_AUDIT_RUN_CATCH_UP_MINUTES },
    urlEnv: null,
    fallbackUrl: `${aimsBaseUrl()}/audits/monthly/aims`,
    targetUrl: `${aimsBaseUrl()}/audits/monthly/aims`,
    targetPath: "/audits/monthly/aims",
    authEnv: "AIMS_API_KEY",
    requiredServices: koyebPowerManagementEnabled() ? ["aims", "rams"] : [],
    asyncStatus: {
      responseIdField: "sessionId",
      statusPath: "/audits/content-master/jobs/{id}",
      statusField: "status",
      successStatuses: ["completed"],
      pendingStatuses: ["queued", "accepted", "running"],
      failureStatuses: ["failed"],
    },
    body: {
      requestedBy: SERVICE_NAME,
      notes: "Second-Saturday AIMS audit. AIMS owns sequencing, final PDF/HTML/JSON publication and RAMS remediation handoff.",
    },
  }),
];

const zernioEbooksWeekly = postJob({
  id: "zernio-ebooks-weekly",
  group: "zernio-ebooks",
  description: "Schedule the Tuesday, Thursday, and Saturday ebook posts for the current featured book.",
  schedule: { type: "manual" },
  urlEnv: null,
  fallbackUrl: "https://app.jonathan-harris.online/zernio/ebooks/weekly",
  targetUrl: "https://app.jonathan-harris.online/zernio/ebooks/weekly",
  targetPath: "/zernio/ebooks/weekly",
  authEnv: "AIMS_API_KEY",
  addLocalDateAsWeekStartDate: true,
  body: {
    dryRun: false,
    profileName: "Default",
    accountId: "ALL",
    usePodcastFeaturedBook: true,
  },
});


const blotatoVideoJobs = [
  postJob({
    id: "blotato-news-insight-publish",
    group: "blotato-videos",
    description: "Trigger the Monday Blotato AI News Insight social video across Instagram, YouTube, TikTok, and Facebook.",
    schedule: { type: "manual" },
    urlEnv: null,
    fallbackUrl: "https://app.jonathan-harris.online/blotato/shorts/news-insight/publish-now",
    targetUrl: "https://app.jonathan-harris.online/blotato/shorts/news-insight/publish-now",
    targetPath: "/blotato/shorts/news-insight/publish-now",
    authEnv: "AIMS_API_KEY",
  }),
  postJob({
    id: "blotato-model-verdict-publish",
    group: "blotato-videos",
    description: "Trigger the Tuesday Blotato AI model/tool verdict social video across Instagram, YouTube, TikTok, and Facebook.",
    schedule: { type: "manual" },
    urlEnv: null,
    fallbackUrl: "https://app.jonathan-harris.online/blotato/shorts/model-verdict/publish-now",
    targetUrl: "https://app.jonathan-harris.online/blotato/shorts/model-verdict/publish-now",
    targetPath: "/blotato/shorts/model-verdict/publish-now",
    authEnv: "AIMS_API_KEY",
  }),
  postJob({
    id: "blotato-ai-at-work-publish",
    group: "blotato-videos",
    description: "Trigger the Wednesday Blotato AI at Work social video across Instagram, YouTube, TikTok, and Facebook.",
    schedule: { type: "manual" },
    urlEnv: null,
    fallbackUrl: "https://app.jonathan-harris.online/blotato/shorts/ai-at-work/publish-now",
    targetUrl: "https://app.jonathan-harris.online/blotato/shorts/ai-at-work/publish-now",
    targetPath: "/blotato/shorts/ai-at-work/publish-now",
    authEnv: "AIMS_API_KEY",
  }),
  postJob({
    id: "blotato-reality-check-publish",
    group: "blotato-videos",
    description: "Trigger the Thursday Blotato AI risk and reality-check social video across Instagram, YouTube, TikTok, and Facebook.",
    schedule: { type: "manual" },
    urlEnv: null,
    fallbackUrl: "https://app.jonathan-harris.online/blotato/shorts/reality-check/publish-now",
    targetUrl: "https://app.jonathan-harris.online/blotato/shorts/reality-check/publish-now",
    targetPath: "/blotato/shorts/reality-check/publish-now",
    authEnv: "AIMS_API_KEY",
  }),
  postJob({
    id: "blotato-ai-playbook-publish",
    group: "blotato-videos",
    description: "Trigger the Friday Blotato AI playbook/how-to social video across Instagram, YouTube, TikTok, and Facebook.",
    schedule: { type: "manual" },
    urlEnv: null,
    fallbackUrl: "https://app.jonathan-harris.online/blotato/shorts/ai-playbook/publish-now",
    targetUrl: "https://app.jonathan-harris.online/blotato/shorts/ai-playbook/publish-now",
    targetPath: "/blotato/shorts/ai-playbook/publish-now",
    authEnv: "AIMS_API_KEY",
  }),
];

const healthPing = getJob({
  id: "suite-health-ping",
  group: "health",
  description: "Manual fallback ping for the AI Management Suite health endpoint.",
  schedule: { type: "manual" },
  urlEnv: null,
  fallbackUrl: "https://app.jonathan-harris.online/health",
  targetUrl: "https://app.jonathan-harris.online/health",
  targetPath: "/health",
});

const hiveKeepAwake = getJob({
  id: "hive-keepawake",
  group: "hive",
  description: "Ping HIVE /healthz gently so the Koyeb free web service is less likely to sleep before ops work.",
  schedule: { type: "interval", everyMinutes: Number(process.env.HIVE_KEEPAWAKE_EVERY_MINUTES || 15) },
  urlEnv: "HIVE_KEEPAWAKE_URL",
  fallbackUrl: "https://liable-loreen-jonathanharris-57884580.koyeb.app/healthz",
  targetUrl: "https://liable-loreen-jonathanharris-57884580.koyeb.app/healthz",
  targetPath: "/healthz",
});

const ramsJobs = [
  getJob({
    id: "rams-health",
    group: "rams",
    description: "Check RAMS liveness manually without bearer auth.",
    schedule: { type: "manual" },
    urlEnv: null,
    fallbackUrl: "https://mod.jonathan-harris.online/health",
    targetUrl: "https://mod.jonathan-harris.online/health",
    targetPath: "/health",
  }),
  getJob({
    id: "rams-readiness",
    group: "rams",
    description: "Check authenticated RAMS dependency readiness before triggering remediation.",
    schedule: { type: "manual" },
    urlEnv: null,
    fallbackUrl: "https://mod.jonathan-harris.online/readiness",
    targetUrl: "https://mod.jonathan-harris.online/readiness",
    targetPath: "/readiness",
    authEnv: "RMS_API_KEY",
  }),
  postJob({
    id: "rams-rebuild-on-brand",
    group: "rams",
    description: "Manual RAMS On-Brand remediation recovery control. Normal audit remediation is triggered by AIMS in sequence.",
    schedule: { type: "manual" },
    urlEnv: null,
    fallbackUrl: "https://mod.jonathan-harris.online/rebuild/on-brand/run",
    targetUrl: "https://mod.jonathan-harris.online/rebuild/on-brand/run",
    targetPath: "/rebuild/on-brand/run",
    authEnv: "RMS_API_KEY",
  }),
  getJob({
    id: "rams-report-on-brand-latest",
    group: "rams-reports",
    description: "Manual RAMS On-Brand report recovery control. Normal audit reporting is orchestrated by AIMS.",
    schedule: { type: "manual" },
    urlEnv: null,
    fallbackUrl: "https://mod.jonathan-harris.online/reports/on-brand/latest",
    targetUrl: "https://mod.jonathan-harris.online/reports/on-brand/latest",
    targetPath: "/reports/on-brand/latest",
    authEnv: "RMS_API_KEY",
  }),
];

// --- Koyeb power management -------------------------------------------------------
//
// AIMS wakes at the configured weekday wake time, then the AM window starts
// after a deliberate warm-up gap. Both schedules have bounded catch-up windows
// so a delayed scheduler tick or cold deployment does not silently lose the day.
// On Friday it wakes again at 14:30 for the podcast-only window. Normal weekday standby
// is completion-driven: AIMS pauses as soon as the relevant operation endpoint returns.

function koyebPowerManagementEnabled() {
  const raw = process.env.KOYEB_POWER_MANAGEMENT_ENABLED;
  if (raw === undefined || raw === null || raw === "") return true;
  return ["1", "true", "yes", "y", "on"].includes(String(raw).trim().toLowerCase());
}

function koyebPowerJob({ id, group, description, schedule, serviceIdEnv, action }) {
  const lifecycleService = serviceIdEnv === "KOYEB_SERVICE_ID_AIMS" ? "aims" : serviceIdEnv === "KOYEB_SERVICE_ID_RAMS" ? "rams" : null;
  return {
    ...postJob({
      id,
      group,
      description,
      schedule,
      urlEnv: null,
      fallbackUrl: koyebServiceUrl(serviceIdEnv, action),
      targetUrl: koyebServiceUrl(serviceIdEnv, action),
      targetPath: `/v1/services/{${serviceIdEnv}}/${action}`,
      authEnv: "KOYEB_TOKEN",
      body: {},
    }),
    // Consumed by scheduler.runJob(): on a successful pause/resume call, the lifecycle
    // ledger is updated so HIVE/MAST agree on intentional Standby vs a genuine fault,
    // and (for resume) a bounded background poll confirms the service actually came
    // back online rather than assuming success from the Koyeb API call alone.
    lifecycle: lifecycleService ? { service: lifecycleService, action } : null,
  };
}

const aimsPowerResumeDaily = koyebPowerJob({
  id: "aims-power-resume-daily",
  group: "power-aims",
  description: `Resume AIMS at ${AM_WAKE_TIME} before weekday morning operations.`,
  schedule: { type: "weekly", days: WEEKDAYS_MON_TO_FRI, time: AM_WAKE_TIME, timezone: LOCAL_TIME_ZONE, catchUpMinutes: AM_WAKE_CATCH_UP_MINUTES },
  serviceIdEnv: "KOYEB_SERVICE_ID_AIMS",
  action: "resume",
});

const aimsPowerResumeFridayPodcast = koyebPowerJob({
  id: "aims-power-resume-friday-podcast",
  group: "power-aims",
  description: `Resume AIMS at ${FRIDAY_PM_WAKE_TIME} for the Friday podcast-only window.`,
  schedule: { type: "weekly", days: ["friday"], time: FRIDAY_PM_WAKE_TIME, timezone: LOCAL_TIME_ZONE, catchUpMinutes: FRIDAY_PM_WAKE_CATCH_UP_MINUTES },
  serviceIdEnv: "KOYEB_SERVICE_ID_AIMS",
  action: "resume",
});

const aimsPowerResumeWebsiteAudit = koyebPowerJob({
  id: "aims-power-resume-website-audit",
  group: "power-aims",
  description: `Resume AIMS at ${WEBSITE_AUDIT_WAKE_TIME} for the first-Sunday website audit.`,
  schedule: { type: "nth-weekday-monthly", weekday: "sunday", occurrence: 1, time: WEBSITE_AUDIT_WAKE_TIME, timezone: LOCAL_TIME_ZONE, catchUpMinutes: WEBSITE_AUDIT_WAKE_CATCH_UP_MINUTES },
  serviceIdEnv: "KOYEB_SERVICE_ID_AIMS",
  action: "resume",
});

const aimsPowerResumeAimsAudit = koyebPowerJob({
  id: "aims-power-resume-aims-audit",
  group: "power-aims",
  description: `Resume AIMS at ${AIMS_AUDIT_WAKE_TIME} for the second-Saturday AIMS audit.`,
  schedule: { type: "nth-weekday-monthly", weekday: "saturday", occurrence: 2, time: AIMS_AUDIT_WAKE_TIME, timezone: LOCAL_TIME_ZONE, catchUpMinutes: AIMS_AUDIT_WAKE_CATCH_UP_MINUTES },
  serviceIdEnv: "KOYEB_SERVICE_ID_AIMS",
  action: "resume",
});

const ramsPowerResumeWebsiteAudit = koyebPowerJob({
  id: "rams-power-resume-website-audit",
  group: "power-rams",
  description: `Resume RAMS at ${WEBSITE_AUDIT_WAKE_TIME} for the first-Sunday website audit remediation sequence controlled by AIMS.`,
  schedule: { type: "nth-weekday-monthly", weekday: "sunday", occurrence: 1, time: WEBSITE_AUDIT_WAKE_TIME, timezone: LOCAL_TIME_ZONE, catchUpMinutes: WEBSITE_AUDIT_WAKE_CATCH_UP_MINUTES },
  serviceIdEnv: "KOYEB_SERVICE_ID_RAMS",
  action: "resume",
});

const ramsPowerResumeAimsAudit = koyebPowerJob({
  id: "rams-power-resume-aims-audit",
  group: "power-rams",
  description: `Resume RAMS at ${AIMS_AUDIT_WAKE_TIME} for the second-Saturday AIMS audit remediation sequence controlled by AIMS.`,
  schedule: { type: "nth-weekday-monthly", weekday: "saturday", occurrence: 2, time: AIMS_AUDIT_WAKE_TIME, timezone: LOCAL_TIME_ZONE, catchUpMinutes: AIMS_AUDIT_WAKE_CATCH_UP_MINUTES },
  serviceIdEnv: "KOYEB_SERVICE_ID_RAMS",
  action: "resume",
});

function posttriggerPauseJob({ id, group, description, sourceJobId, serviceIdEnv, delayMinutes = 0 }) {
  return koyebPowerJob({
    id,
    group,
    description,
    schedule: { type: "posttrigger", sourceJobId, delayMinutes },
    serviceIdEnv,
    action: "pause",
  });
}

const aimsWeekdayPauseJobs = [
  ...["monday", "tuesday", "wednesday", "thursday", "friday"].map((day) => posttriggerPauseJob({
    id: `aims-power-pause-${day}-am`,
    group: "power-aims",
    description: `Pause AIMS immediately after ${day} AM operations finish.`,
    sourceJobId: `operation-${day}-am`,
    serviceIdEnv: "KOYEB_SERVICE_ID_AIMS",
  })),
  posttriggerPauseJob({
    id: "aims-power-pause-friday-podcast",
    group: "power-aims",
    description: "Pause AIMS one hour after the Friday podcast window finishes.",
    sourceJobId: "operation-friday-pm",
    serviceIdEnv: "KOYEB_SERVICE_ID_AIMS",
    delayMinutes: 60,
  }),
];

const aimsAuditPauseJobs = [
  posttriggerPauseJob({
    id: "aims-power-pause-after-website-audit",
    group: "power-aims",
    description: "Pause AIMS one hour after the second-Sunday website audit pipeline finishes.",
    sourceJobId: "website-audit-pipeline",
    delayMinutes: 60,
    serviceIdEnv: "KOYEB_SERVICE_ID_AIMS",
  }),
  posttriggerPauseJob({
    id: "aims-power-pause-after-aims-audit",
    group: "power-aims",
    description: "Pause AIMS one hour after the second-Saturday AIMS audit pipeline finishes.",
    sourceJobId: "aims-audit-pipeline",
    delayMinutes: 60,
    serviceIdEnv: "KOYEB_SERVICE_ID_AIMS",
  }),
];

const ramsAuditPauseJobs = [
  posttriggerPauseJob({
    id: "rams-power-pause-after-website-audit",
    group: "power-rams",
    description: "Pause RAMS one hour after AIMS completes the first-Sunday website audit/remediation sequence.",
    sourceJobId: "website-audit-pipeline",
    delayMinutes: 60,
    serviceIdEnv: "KOYEB_SERVICE_ID_RAMS",
  }),
  posttriggerPauseJob({
    id: "rams-power-pause-after-aims-audit",
    group: "power-rams",
    description: "Pause RAMS one hour after AIMS completes the second-Saturday AIMS audit/remediation sequence.",
    sourceJobId: "aims-audit-pipeline",
    delayMinutes: 60,
    serviceIdEnv: "KOYEB_SERVICE_ID_RAMS",
  }),
];

const koyebPowerJobs = koyebPowerManagementEnabled()
  ? [
    aimsPowerResumeDaily,
    aimsPowerResumeFridayPodcast,
    aimsPowerResumeWebsiteAudit,
    aimsPowerResumeAimsAudit,
    ramsPowerResumeWebsiteAudit,
    ramsPowerResumeAimsAudit,
    ...aimsWeekdayPauseJobs,
    ...aimsAuditPauseJobs,
    ...ramsAuditPauseJobs,
  ]
  : [];

// --- HIVE governance jobs (read-only ecosystem checks + AI Council) --------------
//
// HIVE exposes a set of admin-authenticated diagnostic/report endpoints (see
// backend/app/api/system.py, env_audit.py, ai_council.py, providers.py, skills.py,
// vectorize.py, buckets.py, connectors.py, model_registry.py, optimisation_engine.py)
// that were previously never called by anything except a human opening HIVE-UI.
// hive-keepawake (below) only pings /healthz - it does not exercise any of these.
// Everything here is intentionally read-only or self-contained (no repository upload
// is required), because the repository-scoped endpoints (POST /repositories/{id}/council,
// /qa, /reindex, memory writes) depend on a repository having been uploaded into HIVE's
// in-memory repository registry in the same process lifetime - that registry is not
// database-backed yet (see repository_manager.py), so scheduling those from MAST would
// silently no-op or 404 against an empty registry after every Koyeb restart/idle cycle.
// They are deliberately left unscheduled until that persistence gap is closed; scheduling
// them now would be a correctness regression dressed up as automation.
//
// POST /ai-council/run is the one mutating exception here: it is already a fully
// self-contained, unconditionally-automatic action (no approval gate in the route) that
// discovers providers, refreshes model catalogues and can auto-promote models into the
// Model Registry. The Model Registry is also currently in-memory (a second, separate
// persistence gap flagged in HIVE's own release notes) so a promotion made by a scheduled
// run can be lost on the next restart - that's a known limitation to close, not a reason
// to leave AI Council unscheduled, since the D1-backed run history (lane="ai_council")
// still gives an audit trail either way.
function hiveBaseUrl() {
  return String(process.env.HIVE_BASE_URL || "https://hive.jonathan-harris.online").replace(/\/+$/, "");
}

function hiveJob({ id, group, description, schedule, targetPath, method = "GET", body, requiresAuth = true }) {
  const url = `${hiveBaseUrl()}${targetPath}`;
  const shared = {
    id,
    group,
    description,
    schedule,
    targetUrl: url,
    targetPath,
    authEnv: requiresAuth ? "HIVE_ADMIN_BEARER_TOKEN" : null,
  };
  return method === "POST"
    ? postJob({ ...shared, urlEnv: null, fallbackUrl: url, body: body || {} })
    : getJob({ ...shared, urlEnv: null, fallbackUrl: url });
}

const hiveGovernanceDailyJobs = [
  hiveJob({
    id: "hive-readiness-check",
    group: "hive-governance",
    description: "Check HIVE's full runtime readiness (providers, storage, config) once a day.",
    schedule: { type: "weekly", days: WEEKDAYS, time: "06:00", timezone: LOCAL_TIME_ZONE },
    targetPath: "/v1/runtime/readiness",
  }),
  hiveJob({
    id: "hive-repo-health-check",
    group: "hive-governance",
    description: "Fetch HIVE's governed repo-ecosystem liveness/readiness report (Repository Health Review).",
    schedule: { type: "weekly", days: WEEKDAYS, time: "06:05", timezone: LOCAL_TIME_ZONE },
    targetPath: "/v1/system/repo-health",
  }),
  hiveJob({
    id: "hive-provider-health-check",
    group: "hive-governance",
    description: "Check the health of every configured AI provider (AI Provider Monitoring).",
    schedule: { type: "weekly", days: WEEKDAYS, time: "06:10", timezone: LOCAL_TIME_ZONE },
    targetPath: "/v1/providers/health",
  }),
  hiveJob({
    id: "hive-ops-events-digest",
    group: "hive-governance",
    description: "Pull the last day of redacted HIVE operational events for the executive/ops trail.",
    schedule: { type: "weekly", days: WEEKDAYS, time: "06:15", timezone: LOCAL_TIME_ZONE },
    targetPath: "/v1/system/ops-events?limit=100",
  }),
];

const hiveGovernanceWeeklyJobs = [
  hiveJob({
    id: "hive-env-audit",
    group: "hive-governance-weekly",
    description: "Run HIVE's environment/config audit (Environment Validation).",
    schedule: { type: "weekly", days: ["monday"], time: "06:25", timezone: LOCAL_TIME_ZONE },
    targetPath: "/v1/environment/audit",
  }),
  hiveJob({
    id: "hive-repo-hygiene-check",
    group: "hive-governance-weekly",
    description: "Run HIVE's own repo-hygiene scan for duplicate/orphan/generated files.",
    schedule: { type: "weekly", days: ["monday"], time: "06:30", timezone: LOCAL_TIME_ZONE },
    targetPath: "/v1/system/repo-hygiene",
  }),
  hiveJob({
    id: "hive-skills-integrity-check",
    group: "hive-governance-weekly",
    description: "Check HIVE's skill catalogue (181-skill registry) for integrity issues (Knowledge Base Review).",
    schedule: { type: "weekly", days: ["monday"], time: "06:35", timezone: LOCAL_TIME_ZONE },
    targetPath: "/v1/skills/integrity",
  }),
  hiveJob({
    id: "hive-vectorize-diagnostics",
    group: "hive-governance-weekly",
    description: "Check Vectorize/embeddings diagnostics (R2 Storage Validation).",
    schedule: { type: "weekly", days: ["monday"], time: "06:40", timezone: LOCAL_TIME_ZONE },
    targetPath: "/v1/vectorize/diagnostics",
  }),
  hiveJob({
    id: "hive-buckets-check",
    group: "hive-governance-weekly",
    description: "Check configured R2 bucket lanes are reachable and correctly scoped.",
    schedule: { type: "weekly", days: ["monday"], time: "06:45", timezone: LOCAL_TIME_ZONE },
    targetPath: "/v1/buckets",
  }),
  hiveJob({
    id: "hive-connectors-check",
    group: "hive-governance-weekly",
    description: "Check the status of every registered HIVE connector (GitHub, R2, OpenRouter, AI-search).",
    schedule: { type: "weekly", days: ["monday"], time: "06:50", timezone: LOCAL_TIME_ZONE },
    targetPath: "/v1/connectors",
  }),
  hiveJob({
    id: "hive-model-registry-snapshot",
    group: "hive-governance-weekly",
    description: "Snapshot the current Model Registry state (detects unexpected resets given it is not yet DB-backed).",
    schedule: { type: "weekly", days: ["monday"], time: "06:55", timezone: LOCAL_TIME_ZONE },
    targetPath: "/v1/model-registry",
  }),
];

const hiveGovernanceMonthlyJobs = [
  hiveJob({
    id: "hive-ai-council-run",
    group: "hive-ai-council",
    description: "Run the AI Models Council: refresh provider model catalogues, score and auto-promote into the Model Registry.",
    schedule: { type: "monthly", dayOfMonth: 1, time: "07:00", timezone: LOCAL_TIME_ZONE },
    targetPath: "/v1/ai-council/run",
    method: "POST",
  }),
  hiveJob({
    id: "hive-skills-duplicates-check",
    group: "hive-skills-catalogue",
    description: "Deep monthly check for duplicate skills across the catalogue.",
    schedule: { type: "monthly", dayOfMonth: 1, time: "07:10", timezone: LOCAL_TIME_ZONE },
    targetPath: "/v1/skills/duplicates",
  }),
  hiveJob({
    id: "hive-skills-orphans-check",
    group: "hive-skills-catalogue",
    description: "Deep monthly check for orphaned skills no longer referenced by any workflow.",
    schedule: { type: "monthly", dayOfMonth: 1, time: "07:12", timezone: LOCAL_TIME_ZONE },
    targetPath: "/v1/skills/orphans",
  }),
  hiveJob({
    id: "hive-skills-missing-check",
    group: "hive-skills-catalogue",
    description: "Deep monthly check for skills referenced but missing from the catalogue.",
    schedule: { type: "monthly", dayOfMonth: 1, time: "07:14", timezone: LOCAL_TIME_ZONE },
    targetPath: "/v1/skills/missing",
  }),
  hiveJob({
    id: "hive-optimisation-stats-snapshot",
    group: "hive-governance-monthly",
    description: "Pull optimisation-engine decision/experiment stats for the monthly executive governance report.",
    schedule: { type: "monthly", dayOfMonth: 1, time: "07:16", timezone: LOCAL_TIME_ZONE },
    targetPath: "/v1/optimisation/stats",
  }),
  hiveJob({
    id: "hive-monthly-review-generate",
    group: "hive-governance-monthly",
    description: "Generate, archive and index the consolidated Monthly Review report (system health, AI Council/model registry, skills catalogue health, optimisation stats, execution review posture, token usage and cost) for the month that just finished. Runs after the other hive-governance-monthly jobs so their data is fresh.",
    schedule: { type: "monthly", dayOfMonth: 1, time: "07:25", timezone: LOCAL_TIME_ZONE },
    targetPath: "/v1/monthly-review/generate",
    method: "POST",
  }),
];

const hiveGovernanceJobs = [
  ...hiveGovernanceDailyJobs,
  ...hiveGovernanceWeeklyJobs,
  ...hiveGovernanceMonthlyJobs,
];


const operationWindowJobs = [
  ...["monday", "tuesday", "wednesday", "thursday", "friday"].map((day) => postJob({
    id: `operation-${day}-am`,
    group: "operations",
    description: `${day} AM AIMS operating window: all weekday content preparation, including both scheduled Blotato posts; Monday also owns weekly blog, ebooks, quiz and the mini-series through its Zernio lane, while Friday also prepares weekend Zernio content.`,
    schedule: { type: "weekly", days: [day], time: AM_OPERATION_TIME, timezone: LOCAL_TIME_ZONE, catchUpMinutes: AM_OPERATION_CATCH_UP_MINUTES },
    urlEnv: null,
    fallbackUrl: `${aimsBaseUrl()}/ops/run/${day}-am`,
    targetUrl: `${aimsBaseUrl()}/ops/run/${day}-am`,
    targetPath: `/ops/run/${day}-am`,
    authEnv: "AIMS_API_KEY",
    requiredServices: koyebPowerManagementEnabled() ? ["aims"] : [],
  })),
  postJob({
    id: "operation-friday-pm",
    group: "operations",
    description: "Friday podcast-only AIMS operating window.",
    schedule: { type: "weekly", days: ["friday"], time: FRIDAY_PM_OPERATION_TIME, timezone: LOCAL_TIME_ZONE, catchUpMinutes: FRIDAY_PM_OPERATION_CATCH_UP_MINUTES },
    urlEnv: null,
    fallbackUrl: `${aimsBaseUrl()}/ops/run/friday-pm`,
    targetUrl: `${aimsBaseUrl()}/ops/run/friday-pm`,
    targetPath: "/ops/run/friday-pm",
    authEnv: "AIMS_API_KEY",
    requiredServices: koyebPowerManagementEnabled() ? ["aims"] : [],
  }),
];

export const baseJobs = [
  ...operationWindowJobs,
  rssRewrite,
  outreachBatchNext,
  podcastRun,
  blogWeeklyBuild,
  blogDailySocialBuild,
  newsletterAiEdgeGenerate,
  newsletterAiEdgeSend,
  ...zernioDailyJobs,
  zernioWeeklyQuiz,
  ...monthlyAuditJobs,
  zernioEbooksWeekly,
  ...blotatoVideoJobs,
  healthPing,
  hiveKeepAwake,
  ...hiveGovernanceJobs,
  ...ramsJobs,
  ...koyebPowerJobs,
];

function boolEnv(name, fallback = true) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === "") return fallback;
  return ["1", "true", "yes", "y", "on"].includes(String(raw).trim().toLowerCase());
}

function aimsBaseUrl() {
  return String(process.env.AIMS_BASE_URL || "https://app.jonathan-harris.online").replace(/\/+$/, "");
}

function serviceForJob(job) {
  if (job.group?.startsWith("zernio")) return "zernio";
  if (job.group?.startsWith("blotato")) return "blotato";
  if (job.group?.includes("audit")) return "audits";
  if (job.group === "podcast") return "podcast";
  if (job.group === "rss") return "rss";
  if (job.group === "blog") return "blog";
  if (job.group === "newsletter") return "newsletter";
  if (job.group === "outreach") return "outreach";
  return "suite";
}

function pretriggerUrl(stage, sourceJob, offsetMinutes) {
  const url = new URL(`${aimsBaseUrl()}/ops/${stage}`);
  url.searchParams.set("service", serviceForJob(sourceJob));
  url.searchParams.set("sourceJob", sourceJob.id);
  url.searchParams.set("sourceGroup", sourceJob.group || "");
  url.searchParams.set("targetPath", sourceJob.targetPath || "");
  url.searchParams.set("offsetMinutes", String(offsetMinutes));
  return url.toString();
}

function pretriggerJob(sourceJob, stage, offsetMinutes) {
  const authEnv = stage === "health" ? null : "AIMS_API_KEY";
  return {
    id: `pretrigger-${sourceJob.id}-${stage}`,
    group: "aims-pretrigger",
    description: `Run ${stage} check ${offsetMinutes} minutes before ${sourceJob.id}.`,
    method: "GET",
    schedule: { type: "pretrigger", sourceJobId: sourceJob.id, offsetMinutes },
    urlEnv: null,
    url: pretriggerUrl(stage, sourceJob, offsetMinutes),
    targetUrl: pretriggerUrl(stage, sourceJob, offsetMinutes),
    targetPath: `/ops/${stage}`,
    authEnv,
    managedPretrigger: true,
    pretriggerStage: stage,
    pretriggerOffsetMinutes: offsetMinutes,
    sourceJobId: sourceJob.id,
    sourceTargetPath: sourceJob.targetPath || null,
  };
}

function shouldHavePretriggers(job) {
  return job?.authEnv === "AIMS_API_KEY"
    && ["weekly", "monthly", "nth-weekday-monthly", "once"].includes(job.schedule?.type)
    && !job.managedPretrigger
    && job.group !== "operations";
}

function buildPretriggerJobs(sourceJobs) {
  if (!boolEnv("AIMS_PRETRIGGER_CHECKS_ENABLED", true)) return [];

  return sourceJobs
    .filter(shouldHavePretriggers)
    .flatMap((job) => {
      const offsets = job.pretriggerOffsets || { health: 180, preflight: 120, warmup: 30 };
      return [
        pretriggerJob(job, "health", Number(offsets.health ?? 180)),
        pretriggerJob(job, "preflight", Number(offsets.preflight ?? 120)),
        pretriggerJob(job, "warmup", Number(offsets.warmup ?? 30)),
      ];
    });
}

export const pretriggerJobs = buildPretriggerJobs(baseJobs);
export const jobs = [...baseJobs, ...pretriggerJobs];
