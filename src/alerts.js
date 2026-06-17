import { SERVICE_NAME } from "./jobs.js";

function cleanEnv(name) {
  const value = String(process.env[name] || "").trim();
  return /^\{\{\s*secret\.[^}]+\}\}$/i.test(value) ? "" : value;
}

const webhookUrl = cleanEnv("OPS_ALERT_WEBHOOK_URL");
const webhookToken = cleanEnv("OPS_ALERT_WEBHOOK_TOKEN");
const timeoutMs = Math.max(1_000, Number(process.env.OPS_ALERT_TIMEOUT_MS || 8_000));

export async function sendOperationalEvent(event) {
  if (!webhookUrl || !webhookToken) return { ok: false, skipped: true, reason: "not-configured" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${webhookToken}`,
        "content-type": "application/json",
        "user-agent": `${SERVICE_NAME}/operational-alerts`,
      },
      body: JSON.stringify({
        environment: process.env.APP_ENV || process.env.NODE_ENV || "production",
        source: "mast_runtime",
        service: "MAST",
        occurred_at: new Date().toISOString(),
        ...event,
      }),
      signal: controller.signal,
    });
    return { ok: response.ok, status: response.status };
  } catch (error) {
    console.warn(JSON.stringify({ service: SERVICE_NAME, event: "ops-alert-failed", errorName: error?.name || "Error" }));
    return { ok: false, error: error?.name || "Error" };
  } finally {
    clearTimeout(timer);
  }
}
