export const SERVICE_NAME = "MAST";
export const LOCAL_TIME_ZONE = "Europe/London";
export const USER_AGENT = "Jonathan-Harris-MAST/1.1 (+https://jonathan-harris.online)";

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const WEEKDAYS_MON_TO_FRI = ["monday", "tuesday", "wednesday", "thursday", "friday"];

function endpoint(envName, fallbackUrl) {
  const configured = process.env[envName];
  return configured && configured.trim() ? configured.trim() : fallbackUrl;
}

// Koyeb's REST API exposes POST /v1/services/{id}/pause and /v1/services/{id}/resume.
// Service IDs are environment-specific (not secret, but not portable across accounts),
// so they're read from env at startup rather than hardcoded like the Hookdeck fallback URLs.
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

function postJob({ id, group, description, schedule, hookEnv, fallbackUrl, targetUrl, targetPath, body, addLocalDateAsWeekStartDate = false, authEnv = null }) {
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
    authEnv,
  };
}

function getJob({ id, group, description, schedule, hookEnv, fallbackUrl, targetUrl, targetPath, authEnv = null }) {
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
    authEnv,
  };
}

const rssRewrite = postJob({
  id: "rss-rewrite",
  group: "rss",
  description: "Run the RSS rewrite pipeline.",
  schedule: { type: "weekly", days: WEEKDAYS, time: "08:00", timezone: LOCAL_TIME_ZONE },
  hookEnv: "HOOK_RSS_REWRITE",
  fallbackUrl: "https://hooks.jonathan-harris.online/x20n0wzcy7t5s0",
  targetUrl: "https://app.jonathan-harris.online/rss/rewrite",
  targetPath: "/rss/rewrite",
  authEnv: "AIMS_API_KEY",
  body: { batchSize: 5 },
});

const outreachBatchNext = postJob({
  id: "outreach-batch-next",
  group: "outreach",
  description: "Process the next outreach batch.",
  schedule: { type: "weekly", days: WEEKDAYS_MON_TO_FRI, time: "09:40", timezone: LOCAL_TIME_ZONE },
  hookEnv: "HOOK_OUTREACH_BATCH_NEXT",
  fallbackUrl: "https://hooks.jonathan-harris.online/ni7jxprq9hdc4r",
  targetUrl: "https://app.jonathan-harris.online/outreach/batch/next",
  targetPath: "/outreach/batch/next",
  authEnv: "AIMS_API_KEY",
});

const podcastRun = postJob({
  id: "podcast-run",
  group: "podcast",
  description: "Trigger the podcast pipeline.",
  schedule: { type: "weekly", days: ["friday"], time: "15:00", timezone: LOCAL_TIME_ZONE },
  hookEnv: "HOOK_PODCAST_RUN",
  fallbackUrl: "https://hooks.jonathan-harris.online/x7td31z6y149hn",
  targetUrl: "https://app.jonathan-harris.online/podcast/run",
  targetPath: "/podcast/run",
  authEnv: "AIMS_API_KEY",
});

const blogWeeklyBuild = postJob({
  id: "blog-weekly-build",
  group: "blog",
  description: "Build the weekly blog package.",
  schedule: { type: "weekly", days: ["monday"], time: "12:00", timezone: LOCAL_TIME_ZONE },
  hookEnv: "HOOK_BLOG_WEEKLY_BUILD",
  fallbackUrl: "https://hooks.jonathan-harris.online/1ir1t71n70n5dc",
  targetUrl: "https://app.jonathan-harris.online/blog/weekly/build",
  targetPath: "/blog/weekly/build",
  authEnv: "AIMS_API_KEY",
});

const blogDailySocialBuild = postJob({
  id: "blog-daily-social-build",
  group: "blog",
  description: "Build and publish the daily social media blog RSS package.",
  schedule: { type: "weekly", days: WEEKDAYS, time: "10:30", timezone: LOCAL_TIME_ZONE },
  hookEnv: "HOOK_BLOG_DAILY_SOCIAL_BUILD",
  fallbackUrl: "https://hooks.jonathan-harris.online/2nsz3yuc5xh7kb",
  targetUrl: "Configured in Hookdeck: POST /blog/social/daily/build",
  targetPath: "/blog/social/daily/build",
  authEnv: "AIMS_API_KEY",
});

const newsletterAiEdgeGenerate = postJob({
  id: "newsletter-ai-edge-generate",
  group: "newsletter",
  description: "Build today's AI Edge newsletter issue (RSS ingest, ranking, composition, QA loop, hero image; stored in R2) ahead of the 10:00 send.",
  schedule: { type: "weekly", days: WEEKDAYS, time: "09:20", timezone: LOCAL_TIME_ZONE },
  hookEnv: "HOOK_NEWSLETTER_AI_EDGE_GENERATE",
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
  schedule: { type: "weekly", days: WEEKDAYS, time: "10:00", timezone: LOCAL_TIME_ZONE },
  hookEnv: "HOOK_NEWSLETTER_AI_EDGE_SEND",
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
    schedule: { type: "weekly", days: ["sunday"], time: "19:30", timezone: LOCAL_TIME_ZONE },
    hookEnv: "HOOK_ZERNIO_MONDAY",
    fallbackUrl: "https://hooks.jonathan-harris.online/iq3gwfe8jyscu4",
    targetUrl: "https://app.jonathan-harris.online/zernio/daily/monday",
    targetPath: "/zernio/daily/monday",
    authEnv: "AIMS_API_KEY",
  }),
  postJob({
    id: "zernio-tuesday",
    group: "zernio-daily",
    description: "Trigger Tuesday Tech Talk post build and schedule for Tuesday.",
    schedule: { type: "weekly", days: ["monday"], time: "19:30", timezone: LOCAL_TIME_ZONE },
    hookEnv: "HOOK_ZERNIO_TUESDAY",
    fallbackUrl: "https://hooks.jonathan-harris.online/99pn7sfg27d0rj",
    targetUrl: "https://app.jonathan-harris.online/zernio/daily/tuesday",
    targetPath: "/zernio/daily/tuesday",
    authEnv: "AIMS_API_KEY",
  }),
  postJob({
    id: "zernio-wednesday",
    group: "zernio-daily",
    description: "Trigger Wednesday Writer's Corner post build and schedule for Wednesday.",
    schedule: { type: "weekly", days: ["tuesday"], time: "19:30", timezone: LOCAL_TIME_ZONE },
    hookEnv: "HOOK_ZERNIO_WEDNESDAY",
    fallbackUrl: "https://hooks.jonathan-harris.online/rp2hw3rjj1ol8n",
    targetUrl: "https://app.jonathan-harris.online/zernio/daily/wednesday",
    targetPath: "/zernio/daily/wednesday",
    authEnv: "AIMS_API_KEY",
  }),
  postJob({
    id: "zernio-thursday",
    group: "zernio-daily",
    description: "Trigger Thursday Industry AI post build and schedule for Thursday.",
    schedule: { type: "weekly", days: ["wednesday"], time: "19:30", timezone: LOCAL_TIME_ZONE },
    hookEnv: "HOOK_ZERNIO_THURSDAY",
    fallbackUrl: "https://hooks.jonathan-harris.online/2gl53wz1k09mdk",
    targetUrl: "https://app.jonathan-harris.online/zernio/daily/thursday",
    targetPath: "/zernio/daily/thursday",
    authEnv: "AIMS_API_KEY",
  }),
  postJob({
    id: "zernio-friday",
    group: "zernio-daily",
    description: "Trigger Friday post build and schedule for Friday.",
    schedule: { type: "weekly", days: ["thursday"], time: "19:30", timezone: LOCAL_TIME_ZONE },
    hookEnv: "HOOK_ZERNIO_FRIDAY",
    fallbackUrl: "https://hooks.jonathan-harris.online/v8sxcm5w25n8pr",
    targetUrl: "https://app.jonathan-harris.online/zernio/daily/friday",
    targetPath: "/zernio/daily/friday",
    authEnv: "AIMS_API_KEY",
  }),
  postJob({
    id: "zernio-saturday",
    group: "zernio-daily",
    description: "Trigger Saturday post build and schedule for Saturday.",
    schedule: { type: "weekly", days: ["friday"], time: "19:30", timezone: LOCAL_TIME_ZONE },
    hookEnv: "HOOK_ZERNIO_SATURDAY",
    fallbackUrl: "https://hooks.jonathan-harris.online/snhyppsii91c7l",
    targetUrl: "https://app.jonathan-harris.online/zernio/daily/saturday",
    targetPath: "/zernio/daily/saturday",
    authEnv: "AIMS_API_KEY",
  }),
  postJob({
    id: "zernio-sunday",
    group: "zernio-daily",
    description: "Trigger Sunday post build and schedule for Sunday.",
    schedule: { type: "weekly", days: ["saturday"], time: "19:30", timezone: LOCAL_TIME_ZONE },
    hookEnv: "HOOK_ZERNIO_SUNDAY",
    fallbackUrl: "https://hooks.jonathan-harris.online/krt5ukg8oz6jfy",
    targetUrl: "https://app.jonathan-harris.online/zernio/daily/sunday",
    targetPath: "/zernio/daily/sunday",
    authEnv: "AIMS_API_KEY",
  }),
];

const zernioWeeklyQuiz = postJob({
  id: "zernio-weekly-quiz",
  group: "zernio-quiz",
  description: "Build and schedule the weekly AI quiz pair.",
  schedule: { type: "weekly", days: ["sunday"], time: "19:35", timezone: LOCAL_TIME_ZONE },
  hookEnv: "HOOK_ZERNIO_WEEKLY_QUIZ",
  fallbackUrl: "https://hooks.jonathan-harris.online/rq5203mvuwvcsf",
  targetUrl: "https://app.jonathan-harris.online/zernio/quiz/weekly",
  targetPath: "/zernio/quiz/weekly",
  authEnv: "AIMS_API_KEY",
});

const monthlyAuditJobs = [
  postJob({
    id: "website-audit-pipeline",
    group: "audits",
    description: "Trigger AIMS once for the complete website audit pipeline; AIMS owns Digital Growth, SEO/AEO/GEO, Mobile UX, expert council, final PDF publication and temporary cleanup.",
    schedule: { type: "monthly", dayOfMonth: 1, time: "15:00", timezone: LOCAL_TIME_ZONE },
    hookEnv: "HOOK_AUDIT_WEBSITE_PIPELINE",
    fallbackUrl: "https://app.jonathan-harris.online/audits/website/run",
    targetUrl: "https://app.jonathan-harris.online/audits/website/run",
    targetPath: "/audits/website/run",
    authEnv: "AIMS_API_KEY",
    body: {
      requestedBy: SERVICE_NAME,
      notes: "Single monthly website-audit trigger. AIMS owns the complete sequential pipeline and retains only the final PDF after temporary artefact cleanup.",
    },
  }),
  postJob({
    id: "on-brand-audit",
    group: "audits",
    description: "Run the on-brand audit once a month across Zernio, podcast transcripts, and RSS.",
    schedule: { type: "monthly", dayOfMonth: 1, time: "16:00", timezone: LOCAL_TIME_ZONE },
    hookEnv: "HOOK_AUDIT_ON_BRAND",
    fallbackUrl: "https://hooks.jonathan-harris.online/nnryoo0m8ab3d9",
    targetUrl: "Configured in Hookdeck: POST /audits/on-brand/run",
    targetPath: "/audits/on-brand/run",
    authEnv: "AIMS_API_KEY",
    body: {
      lookbackDays: 31,
      includeZernio: true,
      includePodcastTranscripts: true,
      includeRss: true,
      runPodcastWebsiteReports: true,
      dryRun: false,
      requestedBy: SERVICE_NAME,
    },
  }),
  postJob({
    id: "podcast-website-report",
    group: "audits",
    description: "Run podcast episode and transcript website reports before the brand/social council consumes them.",
    schedule: { type: "monthly", dayOfMonth: 1, time: "16:30", timezone: LOCAL_TIME_ZONE },
    hookEnv: "HOOK_AUDIT_PODCAST_WEBSITE",
    fallbackUrl: "https://app.jonathan-harris.online/audits/podcast-website/run",
    targetUrl: "https://app.jonathan-harris.online/audits/podcast-website/run",
    targetPath: "/audits/podcast-website/run",
    authEnv: "AIMS_API_KEY",
    body: {
      lookbackDays: 31,
      includeZernio: true,
      includePodcastTranscripts: true,
      includeRss: true,
      requestedBy: SERVICE_NAME,
      notes: "Monthly audit sequence step 4: podcast episode/transcript website evidence for brand-social council.",
    },
  }),
  postJob({
    id: "social-performance-audit",
    group: "audits",
    description: "Run the monthly Zernio social-performance analysis report with short thumbnail evidence enabled.",
    schedule: { type: "monthly", dayOfMonth: 1, time: "16:40", timezone: LOCAL_TIME_ZONE },
    hookEnv: "HOOK_AUDIT_SOCIAL_PERFORMANCE",
    fallbackUrl: "https://app.jonathan-harris.online/audits/social-performance/run",
    targetUrl: "https://app.jonathan-harris.online/audits/social-performance/run",
    targetPath: "/audits/social-performance/run",
    authEnv: "AIMS_API_KEY",
    body: {
      requestedBy: SERVICE_NAME,
      runCouncil: false,
      thumbnailAudit: true,
      notes: "Monthly audit sequence step 5: social-performance and thumbnail evidence before the brand/social council runs.",
    },
  }),
  postJob({
    id: "brand-social-council-report",
    group: "audit-councils",
    description: "Run the brand/social council after on-brand, podcast website and social-performance evidence exists.",
    schedule: { type: "monthly", dayOfMonth: 1, time: "17:10", timezone: LOCAL_TIME_ZONE },
    hookEnv: "HOOK_AUDIT_BRAND_SOCIAL_COUNCIL",
    fallbackUrl: "https://app.jonathan-harris.online/audits/brand-social-council/run",
    targetUrl: "https://app.jonathan-harris.online/audits/brand-social-council/run",
    targetPath: "/audits/brand-social-council/run",
    authEnv: "AIMS_API_KEY",
    body: {
      requestedBy: SERVICE_NAME,
      sourceTrigger: "monthly-audit-sequence",
      notes: "Monthly audit sequence step 6: council report using on-brand, podcast, transcript, social and thumbnail latest pointers.",
    },
  }),
];

const zernioEbooksWeekly = postJob({
  id: "zernio-ebooks-weekly",
  group: "zernio-ebooks",
  description: "Schedule the Tuesday, Thursday, and Saturday ebook posts for the current featured book.",
  schedule: { type: "weekly", days: ["monday"], time: "11:00", timezone: LOCAL_TIME_ZONE },
  hookEnv: "HOOK_ZERNIO_EBOOKS_WEEKLY",
  fallbackUrl: "https://hooks.jonathan-harris.online/l3i92ciqk8tsy5",
  targetUrl: "Configured in Hookdeck: POST /zernio/ebooks/weekly",
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
    schedule: { type: "weekly", days: ["monday"], time: "19:45", timezone: LOCAL_TIME_ZONE },
    hookEnv: "HOOK_BLOTATO_NEWS_INSIGHT_URL",
    fallbackUrl: "https://hooks.jonathan-harris.online/g7ncsqagt2wqyq",
    targetUrl: "https://app.jonathan-harris.online/blotato/shorts/news-insight/publish-now",
    targetPath: "/blotato/shorts/news-insight/publish-now",
    authEnv: "AIMS_API_KEY",
  }),
  postJob({
    id: "blotato-model-verdict-publish",
    group: "blotato-videos",
    description: "Trigger the Tuesday Blotato AI model/tool verdict social video across Instagram, YouTube, TikTok, and Facebook.",
    schedule: { type: "weekly", days: ["tuesday"], time: "18:45", timezone: LOCAL_TIME_ZONE },
    hookEnv: "HOOK_BLOTATO_MODEL_VERDICT_URL",
    fallbackUrl: "https://hooks.jonathan-harris.online/rsy7vh21t8un6c",
    targetUrl: "https://app.jonathan-harris.online/blotato/shorts/model-verdict/publish-now",
    targetPath: "/blotato/shorts/model-verdict/publish-now",
    authEnv: "AIMS_API_KEY",
  }),
  postJob({
    id: "blotato-ai-at-work-publish",
    group: "blotato-videos",
    description: "Trigger the Wednesday Blotato AI at Work social video across Instagram, YouTube, TikTok, and Facebook.",
    schedule: { type: "weekly", days: ["wednesday"], time: "18:45", timezone: LOCAL_TIME_ZONE },
    hookEnv: "HOOK_BLOTATO_AI_AT_WORK_URL",
    fallbackUrl: "https://hooks.jonathan-harris.online/5cfbla6oubngjw",
    targetUrl: "https://app.jonathan-harris.online/blotato/shorts/ai-at-work/publish-now",
    targetPath: "/blotato/shorts/ai-at-work/publish-now",
    authEnv: "AIMS_API_KEY",
  }),
  postJob({
    id: "blotato-reality-check-publish",
    group: "blotato-videos",
    description: "Trigger the Thursday Blotato AI risk and reality-check social video across Instagram, YouTube, TikTok, and Facebook.",
    schedule: { type: "weekly", days: ["thursday"], time: "18:45", timezone: LOCAL_TIME_ZONE },
    hookEnv: "HOOK_BLOTATO_REALITY_CHECK_URL",
    fallbackUrl: "https://hooks.jonathan-harris.online/fl60oupriujf53",
    targetUrl: "https://app.jonathan-harris.online/blotato/shorts/reality-check/publish-now",
    targetPath: "/blotato/shorts/reality-check/publish-now",
    authEnv: "AIMS_API_KEY",
  }),
  postJob({
    id: "blotato-ai-playbook-publish",
    group: "blotato-videos",
    description: "Trigger the Friday Blotato AI playbook/how-to social video across Instagram, YouTube, TikTok, and Facebook.",
    schedule: { type: "weekly", days: ["friday"], time: "15:45", timezone: LOCAL_TIME_ZONE },
    hookEnv: "HOOK_BLOTATO_AI_PLAYBOOK_URL",
    fallbackUrl: "https://hooks.jonathan-harris.online/lbed1dhtigdmjf",
    targetUrl: "https://app.jonathan-harris.online/blotato/shorts/ai-playbook/publish-now",
    targetPath: "/blotato/shorts/ai-playbook/publish-now",
    authEnv: "AIMS_API_KEY",
  }),
];

const healthPing = getJob({
  id: "suite-health-ping",
  group: "health",
  description: "Manual fallback ping for the AI Management Suite health endpoint via Hookdeck.",
  schedule: { type: "manual" },
  hookEnv: "HOOK_HEALTH_PING",
  fallbackUrl: "https://hooks.jonathan-harris.online/dw5subfnlocutv",
  targetUrl: "Configured in Hookdeck: GET health endpoint",
  targetPath: "/health",
});

const hiveKeepAwake = getJob({
  id: "hive-keepawake",
  group: "hive",
  description: "Ping HIVE /healthz gently so the Koyeb free web service is less likely to sleep before ops work.",
  schedule: { type: "interval", everyMinutes: Number(process.env.HIVE_KEEPAWAKE_EVERY_MINUTES || 15) },
  hookEnv: "HIVE_KEEPAWAKE_URL",
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
    hookEnv: "HOOK_RAMS_HEALTH",
    fallbackUrl: "https://mod.jonathan-harris.online/health",
    targetUrl: "https://mod.jonathan-harris.online/health",
    targetPath: "/health",
  }),
  getJob({
    id: "rams-readiness",
    group: "rams",
    description: "Check authenticated RAMS dependency readiness before triggering remediation.",
    schedule: { type: "manual" },
    hookEnv: "HOOK_RAMS_READINESS",
    fallbackUrl: "https://mod.jonathan-harris.online/readiness",
    targetUrl: "https://mod.jonathan-harris.online/readiness",
    targetPath: "/readiness",
    authEnv: "RMS_API_KEY",
  }),
  postJob({
    id: "rams-rebuild-seo-aeo-geo",
    group: "rams",
    description: "Trigger the RAMS SEO/AEO/GEO remediation pipeline on the 1st after the SEO/AEO/GEO council report is available.",
    schedule: { type: "monthly", dayOfMonth: 1, time: "11:40", timezone: LOCAL_TIME_ZONE },
    hookEnv: "HOOK_RAMS_REBUILD_SEO_AEO_GEO",
    fallbackUrl: "https://hooks.jonathan-harris.online/mwa6lp7lh1dht3",
    targetUrl: "https://mod.jonathan-harris.online/rebuild/seo-aeo-geo/run",
    targetPath: "/rebuild/seo-aeo-geo/run",
    authEnv: "RMS_API_KEY",
  }),
  postJob({
    id: "rams-rebuild-mobile-ux",
    group: "rams",
    description: "Trigger the RAMS Mobile UX remediation pipeline on the 1st after the Mobile UX council report is available.",
    schedule: { type: "monthly", dayOfMonth: 1, time: "10:40", timezone: LOCAL_TIME_ZONE },
    hookEnv: "HOOK_RAMS_REBUILD_MOBILE_UX",
    fallbackUrl: "https://hooks.jonathan-harris.online/wn7h7x388dwiyt",
    targetUrl: "https://mod.jonathan-harris.online/rebuild/mobile-ux/run",
    targetPath: "/rebuild/mobile-ux/run",
    authEnv: "RMS_API_KEY",
  }),
  postJob({
    id: "rams-rebuild-on-brand",
    group: "rams",
    description: "Trigger the RAMS On-Brand remediation pipeline on the 1st after the brand/social council report is available.",
    schedule: { type: "monthly", dayOfMonth: 1, time: "08:30", timezone: LOCAL_TIME_ZONE },
    hookEnv: "HOOK_RAMS_REBUILD_ON_BRAND",
    fallbackUrl: "https://hooks.jonathan-harris.online/5po78dqk5h9gd9",
    targetUrl: "https://mod.jonathan-harris.online/rebuild/on-brand/run",
    targetPath: "/rebuild/on-brand/run",
    authEnv: "RMS_API_KEY",
  }),
  getJob({
    id: "rams-report-mobile-ux-latest",
    group: "rams-reports",
    description: "Fetch the latest RAMS Mobile UX live report on the 1st after the Mobile UX rebuild finishes.",
    schedule: { type: "monthly", dayOfMonth: 1, time: "11:10", timezone: LOCAL_TIME_ZONE },
    hookEnv: "HOOK_RAMS_REPORT_MOBILE_UX_LATEST",
    fallbackUrl: "https://hooks.jonathan-harris.online/9zmq78a3r28mdh",
    targetUrl: "https://mod.jonathan-harris.online/reports/mobile-ux/latest",
    targetPath: "/reports/mobile-ux/latest",
    authEnv: "RMS_API_KEY",
  }),
  getJob({
    id: "rams-report-seo-aeo-geo-latest",
    group: "rams-reports",
    description: "Fetch the latest RAMS SEO/AEO/GEO live report on the 1st after the SEO/AEO/GEO rebuild finishes.",
    schedule: { type: "monthly", dayOfMonth: 1, time: "12:10", timezone: LOCAL_TIME_ZONE },
    hookEnv: "HOOK_RAMS_REPORT_SEO_AEO_GEO_LATEST",
    fallbackUrl: "https://hooks.jonathan-harris.online/wdcmlqfo9ry9cw",
    targetUrl: "https://mod.jonathan-harris.online/reports/seo-aeo-geo/latest",
    targetPath: "/reports/seo-aeo-geo/latest",
    authEnv: "RMS_API_KEY",
  }),
  getJob({
    id: "rams-report-on-brand-latest",
    group: "rams-reports",
    description: "Fetch the latest RAMS On-Brand live report on the 1st after the on-brand rebuild finishes.",
    schedule: { type: "monthly", dayOfMonth: 1, time: "09:00", timezone: LOCAL_TIME_ZONE },
    hookEnv: "HOOK_RAMS_REPORT_ON_BRAND_LATEST",
    fallbackUrl: "https://hooks.jonathan-harris.online/hg845445lzbvjl",
    targetUrl: "https://mod.jonathan-harris.online/reports/on-brand/latest",
    targetPath: "/reports/on-brand/latest",
    authEnv: "RMS_API_KEY",
  }),
];

// --- Koyeb power management (cost optimisation) -----------------------------------
//
// AIMS and RAMS are billed per second on Koyeb (eco instances), so leaving them running
// idle overnight/all month costs the same as leaving them running busy. These jobs call
// Koyeb's own pause/resume API directly (not AIMS/RAMS routes), using KOYEB_TOKEN for auth.
//
// AIMS target window: ~08:00–20:00 daily, covering every AIMS job including the
// single website-audit trigger at 15:00 plus separate brand/social jobs through 17:10 on the 1st, all inside it.
// RAMS target window: 08:00–20:00 on the 1st of the month only, covering its full
// rebuild + report sequence (08:30–12:10) with margin either side. Both AIMS and RAMS
// must be available strictly within 08:00-20:00 Europe/London.
//
// KOYEB_TOKEN must have services:write scope (the existing deployment-watch usage only
// needs read access to list deployments). Set KOYEB_SERVICE_ID_AIMS and
// KOYEB_SERVICE_ID_RAMS to the Koyeb service IDs (not names) for each app.
// Disable the whole feature without a redeploy via KOYEB_POWER_MANAGEMENT_ENABLED=false.

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
      hookEnv: null,
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
  description: "Resume the AIMS Koyeb service ahead of the daily 08:00 job window.",
  schedule: { type: "weekly", days: WEEKDAYS, time: "07:30", timezone: LOCAL_TIME_ZONE },
  serviceIdEnv: "KOYEB_SERVICE_ID_AIMS",
  action: "resume",
});

const aimsPowerPauseDaily = koyebPowerJob({
  id: "aims-power-pause-daily",
  group: "power-aims",
  description: "Pause the AIMS Koyeb service once the daily job window is done.",
  schedule: { type: "weekly", days: WEEKDAYS, time: "20:00", timezone: LOCAL_TIME_ZONE },
  serviceIdEnv: "KOYEB_SERVICE_ID_AIMS",
  action: "pause",
});

// Note: there is no separate early-morning AIMS resume job here. All AIMS-hosted
// the unified website audit starts once at 15:00 and AIMS owns its child sequencing.
// The other monthly brand/social jobs finish scheduling by 17:10, inside the normal 07:30-20:00 window.
// A previous early resume at 00:45 for a "01:00-08:10 audit chain" didn't correspond
// to any real job and was just paying for ~7 extra hours of idle billing every month.

const ramsPowerResumeMonthly = koyebPowerJob({
  id: "rams-power-resume-monthly",
  group: "power-rams",
  description: "Resume RAMS ahead of the 1st-of-month rebuild/report sequence (08:30-12:10), inside the 08:00-20:00 window.",
  schedule: { type: "monthly", dayOfMonth: 1, time: "08:00", timezone: LOCAL_TIME_ZONE },
  serviceIdEnv: "KOYEB_SERVICE_ID_RAMS",
  action: "resume",
});

const ramsPowerPauseMonthly = koyebPowerJob({
  id: "rams-power-pause-monthly",
  group: "power-rams",
  description: "Pause RAMS for the rest of the month once the 1st-of-month sequence is done, at the edge of the 08:00-20:00 window.",
  schedule: { type: "monthly", dayOfMonth: 1, time: "20:00", timezone: LOCAL_TIME_ZONE },
  serviceIdEnv: "KOYEB_SERVICE_ID_RAMS",
  action: "pause",
});

const koyebPowerJobs = koyebPowerManagementEnabled()
  ? [
    aimsPowerResumeDaily,
    aimsPowerPauseDaily,
    ramsPowerResumeMonthly,
    ramsPowerPauseMonthly,
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
    ? postJob({ ...shared, hookEnv: null, fallbackUrl: url, body: body || {} })
    : getJob({ ...shared, hookEnv: null, fallbackUrl: url });
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

export const baseJobs = [
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
    hookEnv: null,
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
    && ["weekly", "monthly"].includes(job.schedule?.type)
    && !job.managedPretrigger;
}

function buildPretriggerJobs(sourceJobs) {
  if (!boolEnv("AIMS_PRETRIGGER_CHECKS_ENABLED", true)) return [];

  return sourceJobs
    .filter(shouldHavePretriggers)
    .flatMap((job) => [
      pretriggerJob(job, "health", 180),
      pretriggerJob(job, "preflight", 120),
      pretriggerJob(job, "warmup", 30),
    ]);
}

export const pretriggerJobs = buildPretriggerJobs(baseJobs);
export const jobs = [...baseJobs, ...pretriggerJobs];
