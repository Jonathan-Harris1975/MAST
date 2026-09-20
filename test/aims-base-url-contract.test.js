import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { aimsBaseUrl, aimsUrl } from "../src/service-origins.js";

const HISTORICAL_AIMS_ORIGIN = "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app";

function restoreEnv(name, previous) {
  if (previous === undefined) delete process.env[name];
  else process.env[name] = previous;
}

test("AIMS origin helper normalises trailing slashes and rejects non-origin values", () => {
  const previous = process.env.AIMS_BASE_URL;
  try {
    process.env.AIMS_BASE_URL = "https://replacement.example///";
    assert.equal(aimsBaseUrl(), "https://replacement.example");
    assert.equal(aimsUrl("/rss/rewrite"), "https://replacement.example/rss/rewrite");

    for (const invalid of [
      "ftp://replacement.example",
      "https://user:pass@replacement.example",
      "https://replacement.example/base",
      "https://replacement.example?tenant=one",
      "https://replacement.example#fragment",
    ]) {
      process.env.AIMS_BASE_URL = invalid;
      assert.throws(() => aimsBaseUrl(), /AIMS_BASE_URL/);
    }

    process.env.AIMS_BASE_URL = "https://replacement.example";
    assert.throws(() => aimsUrl("//other.example/path"), /root-relative/);
    assert.throws(() => aimsUrl("https://other.example/path"), /root-relative/);
  } finally {
    restoreEnv("AIMS_BASE_URL", previous);
  }
});

test("every AIMS job follows AIMS_BASE_URL when job definitions are constructed", async () => {
  const previous = process.env.AIMS_BASE_URL;
  try {
    process.env.AIMS_BASE_URL = "https://replacement.example///";
    const { jobs } = await import("../src/jobs.js?aims-base-url-contract");
    const aimsJobs = jobs.filter((job) => job.serviceOrigin === "aims");

    assert.ok(aimsJobs.length > 20, "expected all AIMS job families to be marked with the canonical origin");
    assert.ok(aimsJobs.some((job) => job.id === "rss-rewrite" && job.method === "POST"));
    assert.ok(aimsJobs.some((job) => job.id === "outreach-weekday-am" && job.method === "POST"));
    assert.ok(aimsJobs.some((job) => job.id === "suite-health-ping" && job.method === "GET"));
    assert.ok(aimsJobs.some((job) => job.id === "website-audit-pipeline" && job.method === "POST"));
    assert.ok(aimsJobs.some((job) => job.id.startsWith("pretrigger-") && job.method === "GET"));

    for (const job of aimsJobs) {
      assert.equal(new URL(job.url).origin, "https://replacement.example", `${job.id} url origin`);
      assert.equal(new URL(job.targetUrl).origin, "https://replacement.example", `${job.id} target origin`);
      assert.equal("urlEnv" in job, false, `${job.id} should not carry a per-job URL override`);
      assert.equal(job.url.includes(HISTORICAL_AIMS_ORIGIN), false, `${job.id} must not use historical origin`);
    }

    for (const job of jobs.filter((item) => item.authEnv === "AIMS_API_KEY")) {
      assert.equal(job.serviceOrigin, "aims", `${job.id} AIMS-authenticated job must use the canonical origin`);
    }
  } finally {
    restoreEnv("AIMS_BASE_URL", previous);
  }
});

test("historical AIMS origin is confined to the canonical default declaration", async () => {
  const executableFiles = [
    "../src/jobs.js",
    "../src/scheduler.js",
    "../scripts/ecosystemSmoke.js",
  ];

  for (const relativePath of executableFiles) {
    const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
    assert.equal(source.includes(HISTORICAL_AIMS_ORIGIN), false, `${relativePath} must not embed the historical origin`);
  }

  const originSource = await readFile(new URL("../src/service-origins.js", import.meta.url), "utf8");
  assert.equal(originSource.split(HISTORICAL_AIMS_ORIGIN).length - 1, 1);
});
