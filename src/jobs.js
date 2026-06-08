export const SERVICE_NAME = "koyeb-cron-control";
export const LOCAL_TIME_ZONE = "Europe/London";
export const USER_AGENT = "Jonathan-Harris-Koyeb-Cron-Control/1.0 (+https://jonathan-harris.online)";

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const WEEKDAYS_MON_TO_FRI = ["monday", "tuesday", "wednesday", "thursday", "friday"];

function endpoint(envName, fallbackUrl) {
  const configured = process.env[envName];
  return configured && configured.trim() ? configured.trim() : fallbackUrl;
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
  schedule: { type: "weekly", days: WEEKDAYS_MON_TO_FRI, time: "09:30", timezone: LOCAL_TIME_ZONE },
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
  schedule: { type: "weekly", days: WEEKDAYS, time: "09:30", timezone: LOCAL_TIME_ZONE },
  hookEnv: "HOOK_BLOG_DAILY_SOCIAL_BUILD",
  fallbackUrl: "https://hooks.jonathan-harris.online/2nsz3yuc5xh7kb",
  targetUrl: "Configured in Hookdeck: POST /blog/social/daily/build",
  targetPath: "/blog/social/daily/build",
  authEnv: "AIMS_API_KEY",
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
    authEnv: "AIMS_API_KEY",
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
    authEnv: "AIMS_API_KEY",
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
    authEnv: "AIMS_API_KEY",
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
    authEnv: "AIMS_API_KEY",
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
    authEnv: "AIMS_API_KEY",
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
    authEnv: "AIMS_API_KEY",
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
    authEnv: "AIMS_API_KEY",
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
  authEnv: "AIMS_API_KEY",
});

const monthlyAuditJobs = [
  postJob({
    id: "seo-aeo-geo-audit",
    group: "audits",
    description: "Run the SEO/AEO/GEO source audit first so website evidence starts collecting on the 1st.",
    schedule: { type: "monthly", dayOfMonth: 1, time: "01:00", timezone: LOCAL_TIME_ZONE },
    hookEnv: "HOOK_AUDIT_SEO_AEO_GEO",
    fallbackUrl: "https://hooks.jonathan-harris.online/q36ha3y3919gzf",
    targetUrl: "Configured in Hookdeck: POST /audits/seo-aeo-geo/run",
    targetPath: "/audits/seo-aeo-geo/run",
    authEnv: "AIMS_API_KEY",
    body: {
      requestedBy: SERVICE_NAME,
      runCouncil: true,
      notes: "Monthly audit sequence step 1: source SEO/AEO/GEO evidence. Council is also queued from callback as a safety net.",
    },
  }),
  postJob({
    id: "mobile-audit",
    group: "audits",
    description: "Run the mobile UX source audit after SEO/AEO/GEO so rendered evidence is available for the council layer.",
    schedule: { type: "monthly", dayOfMonth: 1, time: "01:10", timezone: LOCAL_TIME_ZONE },
    hookEnv: "HOOK_AUDIT_MOBILE_UX",
    fallbackUrl: "https://hooks.jonathan-harris.online/0xtlks9y88br6o",
    targetUrl: "Configured in Hookdeck: POST /audits/mobile-ux/run",
    targetPath: "/audits/mobile-ux/run",
    authEnv: "AIMS_API_KEY",
    body: {
      requestedBy: SERVICE_NAME,
      runCouncil: true,
      notes: "Monthly audit sequence step 2: mobile UX evidence. Council is also queued from callback as a safety net.",
    },
  }),
  postJob({
    id: "on-brand-audit",
    group: "audits",
    description: "Run the on-brand audit once a month across OneUp, podcast transcripts, and RSS.",
    schedule: { type: "monthly", dayOfMonth: 1, time: "02:00", timezone: LOCAL_TIME_ZONE },
    hookEnv: "HOOK_AUDIT_ON_BRAND",
    fallbackUrl: "https://hooks.jonathan-harris.online/nnryoo0m8ab3d9",
    targetUrl: "Configured in Hookdeck: POST /audits/on-brand/run",
    targetPath: "/audits/on-brand/run",
    authEnv: "AIMS_API_KEY",
    body: {
      lookbackDays: 31,
      includeOneUp: true,
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
    schedule: { type: "monthly", dayOfMonth: 1, time: "02:20", timezone: LOCAL_TIME_ZONE },
    hookEnv: "HOOK_AUDIT_PODCAST_WEBSITE",
    fallbackUrl: "https://app.jonathan-harris.online/audits/podcast-website/run",
    targetUrl: "https://app.jonathan-harris.online/audits/podcast-website/run",
    targetPath: "/audits/podcast-website/run",
    authEnv: "AIMS_API_KEY",
    body: {
      lookbackDays: 31,
      includeOneUp: true,
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
    schedule: { type: "monthly", dayOfMonth: 1, time: "02:40", timezone: LOCAL_TIME_ZONE },
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
    schedule: { type: "monthly", dayOfMonth: 1, time: "03:10", timezone: LOCAL_TIME_ZONE },
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
  postJob({
    id: "seo-aeo-geo-council-report",
    group: "audit-councils",
    description: "Run the SEO/AEO/GEO council after the source workflow has had time to publish its latest evidence.",
    schedule: { type: "monthly", dayOfMonth: 1, time: "06:00", timezone: LOCAL_TIME_ZONE },
    hookEnv: "HOOK_AUDIT_SEO_AEO_GEO_COUNCIL",
    fallbackUrl: "https://app.jonathan-harris.online/audits/seo-aeo-geo-council/run",
    targetUrl: "https://app.jonathan-harris.online/audits/seo-aeo-geo-council/run",
    targetPath: "/audits/seo-aeo-geo-council/run",
    authEnv: "AIMS_API_KEY",
    body: {
      requestedBy: SERVICE_NAME,
      sourceTrigger: "monthly-audit-sequence",
      notes: "Monthly audit sequence step 7: SEO/AEO/GEO council fallback/report generation on the 1st.",
    },
  }),
  postJob({
    id: "mobile-ux-council-report",
    group: "audit-councils",
    description: "Run the Mobile UX council after the source workflow has had time to publish its latest evidence.",
    schedule: { type: "monthly", dayOfMonth: 1, time: "06:20", timezone: LOCAL_TIME_ZONE },
    hookEnv: "HOOK_AUDIT_MOBILE_UX_COUNCIL",
    fallbackUrl: "https://app.jonathan-harris.online/audits/mobile-ux-council/run",
    targetUrl: "https://app.jonathan-harris.online/audits/mobile-ux-council/run",
    targetPath: "/audits/mobile-ux-council/run",
    authEnv: "AIMS_API_KEY",
    body: {
      requestedBy: SERVICE_NAME,
      sourceTrigger: "monthly-audit-sequence",
      notes: "Monthly audit sequence step 8: Mobile UX council fallback/report generation on the 1st.",
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
  authEnv: "AIMS_API_KEY",
  addLocalDateAsWeekStartDate: true,
  body: {
    dryRun: false,
    categoryName: "Ebooks",
    socialNetworkId: "ALL",
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
    schedule: { type: "monthly", dayOfMonth: 1, time: "07:40", timezone: LOCAL_TIME_ZONE },
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
    schedule: { type: "monthly", dayOfMonth: 1, time: "06:40", timezone: LOCAL_TIME_ZONE },
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
    schedule: { type: "monthly", dayOfMonth: 1, time: "04:30", timezone: LOCAL_TIME_ZONE },
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
    schedule: { type: "monthly", dayOfMonth: 1, time: "07:10", timezone: LOCAL_TIME_ZONE },
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
    schedule: { type: "monthly", dayOfMonth: 1, time: "08:10", timezone: LOCAL_TIME_ZONE },
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
    schedule: { type: "monthly", dayOfMonth: 1, time: "05:00", timezone: LOCAL_TIME_ZONE },
    hookEnv: "HOOK_RAMS_REPORT_ON_BRAND_LATEST",
    fallbackUrl: "https://hooks.jonathan-harris.online/hg845445lzbvjl",
    targetUrl: "https://mod.jonathan-harris.online/reports/on-brand/latest",
    targetPath: "/reports/on-brand/latest",
    authEnv: "RMS_API_KEY",
  }),
];

export const baseJobs = [
  rssRewrite,
  outreachBatchNext,
  podcastRun,
  blogWeeklyBuild,
  blogDailySocialBuild,
  ...oneUpDailyJobs,
  oneUpWeeklyQuiz,
  ...monthlyAuditJobs,
  oneUpEbooksWeekly,
  ...blotatoVideoJobs,
  healthPing,
  ...ramsJobs,
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
  if (job.group?.startsWith("oneup")) return "oneup";
  if (job.group?.startsWith("blotato")) return "blotato";
  if (job.group?.includes("audit")) return "audits";
  if (job.group === "podcast") return "podcast";
  if (job.group === "rss") return "rss";
  if (job.group === "blog") return "blog";
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
