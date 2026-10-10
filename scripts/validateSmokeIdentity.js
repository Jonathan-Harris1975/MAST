import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { HIVE_GOVERNED_REPOSITORIES } from "../src/jobs.js";

const owner = "Jonathan-Harris1975";
export const governed = HIVE_GOVERNED_REPOSITORIES.map(name => `${owner}/${name === "Website" ? "jonathan-harris-website" : name}`);

export function validateSmokeIdentity(env, api) {
  const source = env.SOURCE_REPOSITORY || env.GITHUB_REPOSITORY;
  if (!governed.includes(source)) throw new Error("Source repository is outside the governed estate");
  if (env.GITHUB_REPOSITORY !== `${owner}/MAST` || env.GITHUB_REF !== "refs/heads/main") {
    throw new Error("Privileged MAST smoke must execute from MAST main");
  }
  for (const sha of [env.SOURCE_SHA, env.GITHUB_SHA]) {
    if (!/^[0-9a-f]{40}$/i.test(sha || "")) throw new Error("Smoke identity requires full commit SHAs");
  }
  for (const [repository, sha] of [[source, env.SOURCE_SHA], [env.GITHUB_REPOSITORY, env.GITHUB_SHA]]) {
    const branch = api(`/repos/${repository}`).default_branch;
    if (!branch) throw new Error("Repository default branch could not be resolved");
    const head = api(`/repos/${repository}/branches/${encodeURIComponent(branch)}`).commit?.sha;
    if (head !== sha) throw new Error(`Stale smoke SHA for ${repository}; dispatch against current default-branch HEAD`);
  }
  return { source_repository: source, source_sha: env.SOURCE_SHA, deployed_mast_sha: env.GITHUB_SHA };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const api = path => JSON.parse(execFileSync("gh", ["api", path], {
      encoding: "utf8", timeout: 30_000, maxBuffer: 1_000_000, stdio: ["ignore", "pipe", "pipe"],
    }));
    validateSmokeIdentity(process.env, api);
    console.log("Current MAST and caller SHAs verified; checking MAST deployment only");
  } catch {
    // API stderr can contain configuration details; do not echo it.
    console.error("Smoke identity rejected: verify governed source/current HEAD and read access; dispatch MAST main again");
    process.exitCode = 1;
  }
}
