export const SERVICE_NAME = "MAST";
export const LOCAL_TIME_ZONE = "Europe/London";
export const USER_AGENT = "Jonathan-Harris-MAST/1.2.3 (+https://jonathan-harris.online)";

const EVERY_DAY = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const WEEKDAYS_MON_TO_FRI = ["monday", "tuesday", "wednesday", "thursday", "friday"];
const AM_OPERATION_TIME = String(process.env.MAST_AM_OPERATION_TIME || "10:00");
const AM_OPERATION_CATCH_UP_MINUTES = Math.max(0, Number(process.env.MAST_AM_OPERATION_CATCH_UP_MINUTES || 180));
const FRIDAY_PM_OPERATION_TIME = String(process.env.MAST_FRIDAY_PM_OPERATION_TIME || "17:00");
const FRIDAY_PM_OPERATION_CATCH_UP_MINUTES = Math.max(0, Number(process.env.MAST_FRIDAY_PM_OPERATION_CATCH_UP_MINUTES || 180));
const WEBSITE_AUDIT_WAKE_TIME = String(process.env.MAST_WEBSITE_AUDIT_WAKE_TIME || "10:00");
const WEBSITE_AUDIT_RUN_TIME = String(process.env.MAST_WEBSITE_AUDIT_RUN_TIME || "10:30");
const WEBSITE_AUDIT_WAKE_CATCH_UP_MINUTES = Math.max(0, Number(process.env.MAST_WEBSITE_AUDIT_WAKE_CATCH_UP_MINUTES || 120));
const WEBSITE_AUDIT_RUN_CATCH_UP_MINUTES = Math.max(0, Number(process.env.MAST_WEBSITE_AUDIT_RUN_CATCH_UP_MINUTES || 180));
const AIMS_AUDIT_WAKE_TIME = String(process.env.MAST_AIMS_AUDIT_WAKE_TIME || "09:00");
const AIMS_AUDIT_RUN_TIME = String(process.env.MAST_AIMS_AUDIT_RUN_TIME || "09:15");
const AIMS_AUDIT_WAKE_CATCH_UP_MINUTES = Math.max(0, Number(process.env.MAST_AIMS_AUDIT_WAKE_CATCH_UP_MINUTES || 120));
const AIMS_AUDIT_RUN_CATCH_UP_MINUTES = Math.max(0, Number(process.env.MAST_AIMS_AUDIT_RUN_CATCH_UP_MINUTES || 180));
const HIVE_DAILY_CATCH_UP_MINUTES = Math.max(0, Number(process.env.MAST_HIVE_DAILY_CATCH_UP_MINUTES || 180));
const HIVE_WEEKLY_CATCH_UP_MINUTES = Math.max(0, Number(process.env.MAST_HIVE_WEEKLY_CATCH_UP_MINUTES || 360));
const HIVE_MONTHLY_CATCH_UP_MINUTES = Math.max(0, Number(process.env.MAST_HIVE_MONTHLY_CATCH_UP_MINUTES || 1020));

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

function postJob({ id, group, description, schedule, urlEnv, fallbackUrl, targetUrl, targetPath, body, addLocalDateAsWeekStartDate = false, authEnv = null, asyncStatus = null, requiredServices = [], pretriggerOffsets = null, responsePolicy = null }) {
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
    responsePolicy,
  };
}

function getJob({ id, group, description, schedule, urlEnv, fallbackUrl, targetUrl, targetPath, authEnv = null, requiredServices = [], responsePolicy = null }) {
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
    requiredServices,
    responsePolicy,
  };
}

const rssRewrite = postJob({
  id: "rss-rewrite",
  group: "rss",
  description: "Run the RSS rewrite pipeline.",
  schedule: { type: "manual" },
  urlEnv: null,
  fallbackUrl: "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app/rss/rewrite",
  targetUrl: "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app/rss/rewrite",
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
  fallbackUrl: "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app/outreach/batch/next",
  targetUrl: "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app/outreach/batch/next",
  targetPath: "/outreach/batch/next",
  authEnv: "AIMS_API_KEY",
});

const outreachScheduledJobs = [
  postJob({
    id: "outreach-weekday-am",
    group: "outreach",
    description: "Automatically process the morning Outreach batch on weekdays.",
    schedule: { type: "weekly", days: WEEKDAYS_MON_TO_FRI, time: "09:00", timezone: LOCAL_TIME_ZONE, catchUpMinutes: 120 },
    urlEnv: null,
    fallbackUrl: "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app/outreach/batch/next",
    targetUrl: "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app/outreach/batch/next",
    targetPath: "/outreach/batch/next",
    authEnv: "AIMS_API_KEY",
    requiredServices: ["aims"],
  }),
  postJob({
    id: "outreach-weekday-pm",
    group: "outreach",
    description: "Automatically process the afternoon Outreach batch on weekdays.",
    schedule: { type: "weekly", days: WEEKDAYS_MON_TO_FRI, time: "16:00", timezone: LOCAL_TIME_ZONE, catchUpMinutes: 120 },
    urlEnv: null,
    fallbackUrl: "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app/outreach/batch/next",
    targetUrl: "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app/outreach/batch/next",
    targetPath: "/outreach/batch/next",
    authEnv: "AIMS_API_KEY",
    requiredServices: ["aims"],
  }),
];

const podcastRun = postJob({
  id: "podcast-run",
  group: "podcast",
  description: "Trigger the podcast pipeline.",
  schedule: { type: "manual" },
  urlEnv: null,
  fallbackUrl: "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app/podcast/run",
  targetUrl: "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app/podcast/run",
  targetPath: "/podcast/run",
  authEnv: "AIMS_API_KEY",
});

const blogWeeklyBuild = postJob({
  id: "blog-weekly-build",
  group: "blog",
  description: "Build the weekly blog package.",
  schedule: { type: "manual" },
  urlEnv: null,
  fallbackUrl: "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app/blog/weekly/build",
  targetUrl: "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app/blog/weekly/build",
  targetPath: "/blog/weekly/build",
  authEnv: "AIMS_API_KEY",
});

const blogDailySocialBuild = postJob({
  id: "blog-daily-social-build",
  group: "blog",
  description: "Build and publish the daily social media blog RSS package.",
  schedule: { type: "manual" },
  urlEnv: null,
  fallbackUrl: "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app/blog/social/daily/build",
  targetUrl: "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app/blog/social/daily/build",
  targetPath: "/blog/social/daily/build",
  authEnv: "AIMS_API_KEY",
});

const newsletterAiEdgeGenerate = postJob({
  id: "newsletter-ai-edge-generate",
  group: "newsletter",
  description: "Build today's AI Edge newsletter issue (RSS ingest, ranking, composition, QA loop and hero image) before the governed morning delivery step.",
  schedule: { type: "manual" },
  urlEnv: null,
  fallbackUrl: "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app/newsletter/generate",
  targetUrl: "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app/newsletter/generate",
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
  fallbackUrl: "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app/newsletter/send",
  targetUrl: "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app/newsletter/send",
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
    fallbackUrl: "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app/zernio/daily/monday",
    targetUrl: "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app/zernio/daily/monday",
    targetPath: "/zernio/daily/monday",
    authEnv: "AIMS_API_KEY",
  }),
  postJob({
    id: "zernio-tuesday",
    group: "zernio-daily",
    description: "Trigger Tuesday Tech Talk post build and schedule for Tuesday.",
    schedule: { type: "manual" },
    urlEnv: null,
    fallbackUrl: "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app/zernio/daily/tuesday",
    targetUrl: "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app/zernio/daily/tuesday",
    targetPath: "/zernio/daily/tuesday",
    authEnv: "AIMS_API_KEY",
  }),
  postJob({
    id: "zernio-wednesday",
    group: "zernio-daily",
    description: "Trigger Wednesday Writer's Corner post build and schedule for Wednesday.",
    schedule: { type: "manual" },
    urlEnv: null,
    fallbackUrl: "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app/zernio/daily/wednesday",
    targetUrl: "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app/zernio/daily/wednesday",
    targetPath: "/zernio/daily/wednesday",
    authEnv: "AIMS_API_KEY",
  }),
  postJob({
    id: "zernio-thursday",
    group: "zernio-daily",
    description: "Trigger Thursday Industry AI post build and schedule for Thursday.",
    schedule: { type: "manual" },
    urlEnv: null,
    fallbackUrl: "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app/zernio/daily/thursday",
    targetUrl: "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app/zernio/daily/thursday",
    targetPath: "/zernio/daily/thursday",
    authEnv: "AIMS_API_KEY",
  }),
  postJob({
    id: "zernio-friday",
    group: "zernio-daily",
    description: "Trigger Friday post build and schedule for Friday.",
    schedule: { type: "manual" },
    urlEnv: null,
    fallbackUrl: "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app/zernio/daily/friday",
    targetUrl: "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app/zernio/daily/friday",
    targetPath: "/zernio/daily/friday",
    authEnv: "AIMS_API_KEY",
  }),
  postJob({
    id: "zernio-saturday",
    group: "zernio-daily",
    description: "Trigger Saturday post build and schedule for Saturday.",
    schedule: { type: "manual" },
    urlEnv: null,
    fallbackUrl: "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app/zernio/daily/saturday",
    targetUrl: "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app/zernio/daily/saturday",
    targetPath: "/zernio/daily/saturday",
    authEnv: "AIMS_API_KEY",
  }),
  postJob({
    id: "zernio-sunday",
    group: "zernio-daily",
    description: "Trigger Sunday post build and schedule for Sunday.",
    schedule: { type: "manual" },
    urlEnv: null,
    fallbackUrl: "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app/zernio/daily/sunday",
    targetUrl: "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app/zernio/daily/sunday",
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
  fallbackUrl: "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app/zernio/quiz/weekly",
  targetUrl: "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app/zernio/quiz/weekly",
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
    fallbackUrl: `${aimsBaseUrl()}/audits/monthly/website`,
    targetUrl: `${aimsBaseUrl()}/audits/monthly/website`,
    targetPath: "/audits/monthly/website",
    authEnv: "AIMS_API_KEY",
    requiredServices: ["aims", "rams"],
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
      notes: "First-Sunday website audit. AIMS owns sequencing, monthly cadence enforcement, final publication and the required RAMS remediation handoff.",
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
    requiredServices: ["aims", "rams"],
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
  fallbackUrl: "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app/zernio/ebooks/weekly",
  targetUrl: "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app/zernio/ebooks/weekly",
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
    description: "Governed manual recovery: schedule the Monday Blotato AI News Insight social video across Instagram, YouTube, TikTok, and Facebook.",
    schedule: { type: "manual" },
    urlEnv: null,
    fallbackUrl: "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app/blotato/shorts/news-insight/schedule",
    targetUrl: "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app/blotato/shorts/news-insight/schedule",
    targetPath: "/blotato/shorts/news-insight/schedule",
    authEnv: "AIMS_API_KEY",
  }),
  postJob({
    id: "blotato-model-verdict-publish",
    group: "blotato-videos",
    description: "Governed manual recovery: schedule the Tuesday Blotato AI model/tool verdict social video across Instagram, YouTube, TikTok, and Facebook.",
    schedule: { type: "manual" },
    urlEnv: null,
    fallbackUrl: "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app/blotato/shorts/model-verdict/schedule",
    targetUrl: "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app/blotato/shorts/model-verdict/schedule",
    targetPath: "/blotato/shorts/model-verdict/schedule",
    authEnv: "AIMS_API_KEY",
  }),
  postJob({
    id: "blotato-ai-at-work-publish",
    group: "blotato-videos",
    description: "Governed manual recovery: schedule the Wednesday Blotato AI at Work social video across Instagram, YouTube, TikTok, and Facebook.",
    schedule: { type: "manual" },
    urlEnv: null,
    fallbackUrl: "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app/blotato/shorts/ai-at-work/schedule",
    targetUrl: "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app/blotato/shorts/ai-at-work/schedule",
    targetPath: "/blotato/shorts/ai-at-work/schedule",
    authEnv: "AIMS_API_KEY",
  }),
  postJob({
    id: "blotato-reality-check-publish",
    group: "blotato-videos",
    description: "Governed manual recovery: schedule the Thursday Blotato AI risk and reality-check social video across Instagram, YouTube, TikTok, and Facebook.",
    schedule: { type: "manual" },
    urlEnv: null,
    fallbackUrl: "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app/blotato/shorts/reality-check/schedule",
    targetUrl: "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app/blotato/shorts/reality-check/schedule",
    targetPath: "/blotato/shorts/reality-check/schedule",
    authEnv: "AIMS_API_KEY",
  }),
  postJob({
    id: "blotato-ai-playbook-publish",
    group: "blotato-videos",
    description: "Governed manual recovery: schedule the Friday Blotato AI playbook/how-to social video across Instagram, YouTube, TikTok, and Facebook.",
    schedule: { type: "manual" },
    urlEnv: null,
    fallbackUrl: "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app/blotato/shorts/ai-playbook/schedule",
    targetUrl: "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app/blotato/shorts/ai-playbook/schedule",
    targetPath: "/blotato/shorts/ai-playbook/schedule",
    authEnv: "AIMS_API_KEY",
  }),
];

const healthPing = getJob({
  id: "suite-health-ping",
  group: "health",
  description: "Manual fallback ping for the AI Management Suite health endpoint.",
  schedule: { type: "manual" },
  urlEnv: null,
  fallbackUrl: "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app/health",
  targetUrl: "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app/health",
  targetPath: "/health",
});



const ramsJobs = [
  getJob({
    id: "rams-health",
    group: "rams",
    description: "Check RAMS liveness manually without bearer auth.",
    schedule: { type: "manual" },
    urlEnv: null,
    fallbackUrl: "https://static-helaina-jonathanharris-6df5d241.koyeb.app/health",
    targetUrl: "https://static-helaina-jonathanharris-6df5d241.koyeb.app/health",
    targetPath: "/health",
  }),
  getJob({
    id: "rams-readiness",
    group: "rams",
    description: "Check authenticated RAMS dependency readiness before triggering remediation.",
    schedule: { type: "manual" },
    urlEnv: null,
    fallbackUrl: "https://static-helaina-jonathanharris-6df5d241.koyeb.app/readiness",
    targetUrl: "https://static-helaina-jonathanharris-6df5d241.koyeb.app/readiness",
    targetPath: "/readiness",
    authEnv: "RMS_API_KEY",
  }),
  postJob({
    id: "rams-rebuild-on-brand",
    group: "rams",
    description: "Manual RAMS On-Brand remediation recovery control. Normal audit remediation is triggered by AIMS in sequence.",
    schedule: { type: "manual" },
    urlEnv: null,
    fallbackUrl: "https://static-helaina-jonathanharris-6df5d241.koyeb.app/rebuild/on-brand/run",
    targetUrl: "https://static-helaina-jonathanharris-6df5d241.koyeb.app/rebuild/on-brand/run",
    targetPath: "/rebuild/on-brand/run",
    authEnv: "RMS_API_KEY",
  }),
  getJob({
    id: "rams-report-on-brand-latest",
    group: "rams-reports",
    description: "Manual RAMS On-Brand report recovery control. Normal audit reporting is orchestrated by AIMS.",
    schedule: { type: "manual" },
    urlEnv: null,
    fallbackUrl: "https://static-helaina-jonathanharris-6df5d241.koyeb.app/reports/on-brand/latest",
    targetUrl: "https://static-helaina-jonathanharris-6df5d241.koyeb.app/reports/on-brand/latest",
    targetPath: "/reports/on-brand/latest",
    authEnv: "RMS_API_KEY",
  }),
];

// --- Koyeb power management -------------------------------------------------------
//
// AIMS and HIVE stay online continuously. AIMS owns Comms Hub workers and HIVE
// owns operational-event ingestion, so suspending either would break unattended
// automation. RAMS remains demand-woken for monthly remediation/audit work.

function koyebPowerManagementEnabled() {
  const raw = process.env.KOYEB_POWER_MANAGEMENT_ENABLED;
  if (raw === undefined || raw === null || raw === "") return true;
  return ["1", "true", "yes", "y", "on"].includes(String(raw).trim().toLowerCase());
}

function koyebPowerJob({ id, group, description, schedule, serviceIdEnv, action }) {
  const lifecycleService = serviceIdEnv === "KOYEB_SERVICE_ID_AIMS" ? "aims" : serviceIdEnv === "KOYEB_SERVICE_ID_RAMS" ? "rams" : serviceIdEnv === "KOYEB_SERVICE_ID_HIVE" ? "hive" : null;
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

// AIMS and HIVE are intentionally always-on production services. AIMS hosts
// Comms Hub continuous workers; HIVE receives operational events and governance
// requests. Scheduled Koyeb power management therefore applies only to RAMS.
const koyebPowerJobs = koyebPowerManagementEnabled()
  ? [
    ramsPowerResumeWebsiteAudit,
    ramsPowerResumeAimsAudit,
    ...ramsAuditPauseJobs,
  ]
  : [];

// --- HIVE governance jobs (read-only ecosystem checks + AI Council) --------------
//
// HIVE exposes a set of admin-authenticated diagnostic/report endpoints (see
// backend/app/api/system.py, env_audit.py, ai_council.py, providers.py, skills.py,
// vectorize.py, buckets.py, connectors.py, model_registry.py, optimisation_engine.py)
// that were previously never called by anything except a human opening HIVE-UI.
// HIVE remains always-on; its liveness probe is separate from these governance checks.
// Repository snapshots are rehydrated from R2 after HIVE restarts. After both monthly
// RAMS/AIMS audit windows have completed, MAST also triggers HIVE's governed GitHub
// repository refresh. HIVE downloads fresh snapshots and runs the combined Repository
// Intelligence workflow, while MAST polls the asynchronous job to terminal completion.
//
// POST /ai-council/run is the deliberate mutating exception. It refreshes provider
// catalogues, benchmarks/ranks eligible models and may promote sufficiently high-confidence
// defaults. The Model Registry is persisted to D1 and restored at HIVE startup, while the
// AI Council run history provides the audit trail.
function hiveBaseUrl() {
  return String(process.env.HIVE_BASE_URL || "https://liable-loreen-jonathanharris-57884580.koyeb.app").replace(/\/+$/, "");
}

function hiveJob({ id, group, description, schedule, targetPath, method = "GET", body, requiresAuth = true, responsePolicy = null, asyncStatus = null }) {
  const url = `${hiveBaseUrl()}${targetPath}`;
  const shared = {
    id,
    group,
    description,
    schedule,
    targetUrl: url,
    targetPath,
    authEnv: requiresAuth ? "HIVE_ADMIN_BEARER_TOKEN" : null,
    requiredServices: ["hive"],
    responsePolicy,
    asyncStatus,
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
    schedule: { type: "weekly", days: EVERY_DAY, time: "06:00", timezone: LOCAL_TIME_ZONE, catchUpMinutes: HIVE_DAILY_CATCH_UP_MINUTES },
    targetPath: "/v1/runtime/readiness",
    responsePolicy: { checks: [{ type: "equals", path: "ready", value: true, message: "HIVE runtime readiness reported ready=false." }] },
  }),
  hiveJob({
    id: "hive-repo-health-check",
    group: "hive-governance",
    description: "Fetch HIVE's governed repo-ecosystem liveness/readiness report (Repository Health Review).",
    schedule: { type: "weekly", days: EVERY_DAY, time: "06:05", timezone: LOCAL_TIME_ZONE, catchUpMinutes: HIVE_DAILY_CATCH_UP_MINUTES },
    targetPath: "/v1/system/repo-health",
    responsePolicy: { checks: [{ type: "oneOf", path: "overall_status", values: ["healthy"], message: "HIVE repository ecosystem is not healthy." }] },
  }),
  hiveJob({
    id: "hive-provider-health-check",
    group: "hive-governance",
    description: "Check the health of every configured AI provider (AI Provider Monitoring).",
    schedule: { type: "weekly", days: EVERY_DAY, time: "06:10", timezone: LOCAL_TIME_ZONE, catchUpMinutes: HIVE_DAILY_CATCH_UP_MINUTES },
    targetPath: "/v1/providers/health",
    responsePolicy: { checks: [{ type: "arrayEveryEquals", path: "providers", key: "ok", value: true, message: "One or more configured HIVE providers reported unhealthy." }] },
  }),
  hiveJob({
    id: "hive-ops-events-digest",
    group: "hive-governance",
    description: "Pull the last day of redacted HIVE operational events for the executive/ops trail.",
    schedule: { type: "weekly", days: EVERY_DAY, time: "06:15", timezone: LOCAL_TIME_ZONE, catchUpMinutes: HIVE_DAILY_CATCH_UP_MINUTES },
    targetPath: "/v1/system/ops-events?limit=100",
  }),
];

const hiveGovernanceWeeklyJobs = [
  hiveJob({
    id: "hive-env-audit",
    group: "hive-governance-weekly",
    description: "Run HIVE's environment/config audit (Environment Validation).",
    schedule: { type: "weekly", days: ["monday"], time: "06:25", timezone: LOCAL_TIME_ZONE, catchUpMinutes: HIVE_WEEKLY_CATCH_UP_MINUTES },
    targetPath: "/v1/environment/audit",
    responsePolicy: {
      checks: [
        { type: "equals", path: "env_example_found", value: true, message: "HIVE environment audit could not find .env.example." },
        { type: "equals", path: "undocumented_field_count", value: 0, message: "HIVE environment audit found Settings fields missing from .env.example." },
      ],
    },
  }),
  hiveJob({
    id: "hive-repo-hygiene-check",
    group: "hive-governance-weekly",
    description: "Run HIVE's own repo-hygiene scan for duplicate/orphan/generated files.",
    schedule: { type: "weekly", days: ["monday"], time: "06:30", timezone: LOCAL_TIME_ZONE, catchUpMinutes: HIVE_WEEKLY_CATCH_UP_MINUTES },
    targetPath: "/v1/system/repo-hygiene",
  }),
  hiveJob({
    id: "hive-skills-integrity-check",
    group: "hive-governance-weekly",
    description: "Check HIVE's skill catalogue (181-skill registry) for integrity issues (Knowledge Base Review).",
    schedule: { type: "weekly", days: ["monday"], time: "06:35", timezone: LOCAL_TIME_ZONE, catchUpMinutes: HIVE_WEEKLY_CATCH_UP_MINUTES },
    targetPath: "/v1/skills/integrity",
    responsePolicy: { checks: [{ type: "equals", path: "ok", value: true, message: "HIVE skills integrity query did not complete successfully." }] },
  }),
  hiveJob({
    id: "hive-vectorize-diagnostics",
    group: "hive-governance-weekly",
    description: "Check Vectorize/embeddings diagnostics (R2 Storage Validation).",
    schedule: { type: "weekly", days: ["monday"], time: "06:40", timezone: LOCAL_TIME_ZONE, catchUpMinutes: HIVE_WEEKLY_CATCH_UP_MINUTES },
    targetPath: "/v1/vectorize/diagnostics",
    responsePolicy: { checks: [{ type: "equals", path: "ok", value: true, message: "HIVE Vectorize diagnostics reported ok=false." }] },
  }),
  hiveJob({
    id: "hive-buckets-check",
    group: "hive-governance-weekly",
    description: "Check configured R2 bucket lanes are reachable and correctly scoped.",
    schedule: { type: "weekly", days: ["monday"], time: "06:45", timezone: LOCAL_TIME_ZONE, catchUpMinutes: HIVE_WEEKLY_CATCH_UP_MINUTES },
    targetPath: "/v1/buckets",
  }),
  hiveJob({
    id: "hive-connectors-check",
    group: "hive-governance-weekly",
    description: "Check the status of every registered HIVE connector (GitHub, R2, OpenRouter, AI-search).",
    schedule: { type: "weekly", days: ["monday"], time: "06:50", timezone: LOCAL_TIME_ZONE, catchUpMinutes: HIVE_WEEKLY_CATCH_UP_MINUTES },
    targetPath: "/v1/connectors",
  }),
  hiveJob({
    id: "hive-model-registry-snapshot",
    group: "hive-governance-weekly",
    description: "Check the current D1-backed Model Registry state and ranked defaults for unexpected resets or drift.",
    schedule: { type: "weekly", days: ["monday"], time: "06:55", timezone: LOCAL_TIME_ZONE, catchUpMinutes: HIVE_WEEKLY_CATCH_UP_MINUTES },
    targetPath: "/v1/model-registry",
  }),
];

const hiveGovernanceMonthlyJobs = [
  hiveJob({
    id: "hive-ai-council-run",
    group: "hive-ai-council",
    description: "Run the AI Models Council: refresh provider model catalogues, score and auto-promote into the Model Registry.",
    schedule: { type: "monthly", dayOfMonth: 1, time: "07:00", timezone: LOCAL_TIME_ZONE, catchUpMinutes: HIVE_MONTHLY_CATCH_UP_MINUTES },
    targetPath: "/v1/ai-council/run",
    method: "POST",
  }),
  hiveJob({
    id: "hive-skills-duplicates-check",
    group: "hive-skills-catalogue",
    description: "Deep monthly check for duplicate skills across the catalogue.",
    schedule: { type: "monthly", dayOfMonth: 1, time: "07:10", timezone: LOCAL_TIME_ZONE, catchUpMinutes: HIVE_MONTHLY_CATCH_UP_MINUTES },
    targetPath: "/v1/skills/duplicates",
    responsePolicy: { checks: [{ type: "equals", path: "ok", value: true, message: "HIVE skills duplicate check could not read the skills catalogue." }] },
  }),
  hiveJob({
    id: "hive-skills-orphans-check",
    group: "hive-skills-catalogue",
    description: "Deep monthly check for orphaned skills no longer referenced by any workflow.",
    schedule: { type: "monthly", dayOfMonth: 1, time: "07:12", timezone: LOCAL_TIME_ZONE, catchUpMinutes: HIVE_MONTHLY_CATCH_UP_MINUTES },
    targetPath: "/v1/skills/orphans",
    responsePolicy: { checks: [{ type: "equals", path: "ok", value: true, message: "HIVE skills orphan check could not read the skills catalogue." }] },
  }),
  hiveJob({
    id: "hive-skills-missing-check",
    group: "hive-skills-catalogue",
    description: "Deep monthly check for skills referenced but missing from the catalogue.",
    schedule: { type: "monthly", dayOfMonth: 1, time: "07:14", timezone: LOCAL_TIME_ZONE, catchUpMinutes: HIVE_MONTHLY_CATCH_UP_MINUTES },
    targetPath: "/v1/skills/missing",
    responsePolicy: { checks: [{ type: "equals", path: "ok", value: true, message: "HIVE skills missing check could not read the skills catalogue." }] },
  }),
  hiveJob({
    id: "hive-optimisation-stats-snapshot",
    group: "hive-governance-monthly",
    description: "Pull optimisation-engine decision/experiment stats for the monthly executive governance report.",
    schedule: { type: "monthly", dayOfMonth: 1, time: "07:16", timezone: LOCAL_TIME_ZONE, catchUpMinutes: HIVE_MONTHLY_CATCH_UP_MINUTES },
    targetPath: "/v1/optimisation/stats",
  }),
  hiveJob({
    id: "hive-monthly-review-generate",
    group: "hive-governance-monthly",
    description: "Generate, archive and index the consolidated Monthly Review report (system health, AI Council/model registry, skills catalogue health, optimisation stats, execution review posture, token usage and cost) for the month that just finished. Runs after the other hive-governance-monthly jobs so their data is fresh.",
    schedule: { type: "monthly", dayOfMonth: 1, time: "07:25", timezone: LOCAL_TIME_ZONE, catchUpMinutes: HIVE_MONTHLY_CATCH_UP_MINUTES },
    targetPath: "/v1/monthly-review/generate",
    method: "POST",
    responsePolicy: {
      checks: [
        { type: "fieldsEqual", leftPath: "sections_ok", rightPath: "sections_total", message: "HIVE Monthly Review completed with one or more failed sections." },
        { type: "equals", path: "r2_object.ok", value: true, message: "HIVE Monthly Review was generated but its R2 archive was not confirmed." },
        { type: "equals", path: "d1_index.ok", value: true, message: "HIVE Monthly Review was generated but its D1 index write was not confirmed." },
      ],
    },
  }),
];

const hiveRepositoryMonthlyRefresh = hiveJob({
  id: "hive-repositories-monthly-refresh",
  group: "hive-repositories",
  description: "After the second-Saturday AIMS/RAMS audit sequence completes, download fresh governed GitHub snapshots and run HIVE Repository Intelligence for every repository.",
  schedule: { type: "posttrigger", sourceJobId: "aims-audit-pipeline", delayMinutes: 15 },
  targetPath: "/v1/repositories/refresh-all",
  method: "POST",
  asyncStatus: {
    responseIdField: "job_id",
    statusPath: "/v1/repositories/refresh-jobs/{id}",
    statusField: "status",
    successStatuses: ["completed"],
    pendingStatuses: ["accepted", "running"],
    failureStatuses: ["completed-with-failures", "failed"],
  },
});

const hiveGovernanceJobs = [
  ...hiveGovernanceDailyJobs,
  ...hiveGovernanceWeeklyJobs,
  ...hiveGovernanceMonthlyJobs,
  hiveRepositoryMonthlyRefresh,
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
    requiredServices: ["aims"],
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
    requiredServices: ["aims"],
  }),
];

export const baseJobs = [
  ...operationWindowJobs,
  rssRewrite,
  outreachBatchNext,
  ...outreachScheduledJobs,
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
  return String(process.env.AIMS_BASE_URL || "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app").replace(/\/+$/, "");
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
