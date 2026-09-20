export const DEFAULT_AIMS_BASE_URL = "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app";

function configuredOrigin(envName, fallback) {
  const raw = String(process.env[envName] || fallback || "").trim();
  if (!raw) throw new Error(`${envName} is required.`);

  const normalised = raw.replace(/\/+$/, "");
  let url;
  try {
    url = new URL(normalised);
  } catch {
    throw new Error(`${envName} must be an absolute HTTP(S) service origin.`);
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`${envName} must use http or https.`);
  }
  if (url.username || url.password) {
    throw new Error(`${envName} must not contain embedded credentials.`);
  }
  if ((url.pathname && url.pathname !== "/") || url.search || url.hash) {
    throw new Error(`${envName} must be a service origin without a path, query or fragment.`);
  }

  return url.origin;
}

export function aimsBaseUrl() {
  return configuredOrigin("AIMS_BASE_URL", DEFAULT_AIMS_BASE_URL);
}

export function aimsUrl(targetPath) {
  const path = String(targetPath || "").trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    throw new Error("AIMS target paths must be root-relative paths on the configured AIMS origin.");
  }

  const origin = aimsBaseUrl();
  const url = new URL(path, `${origin}/`);
  if (url.origin !== origin) {
    throw new Error("AIMS target path resolved outside the configured AIMS origin.");
  }
  return url.toString();
}
