#!/usr/bin/env python3
"""Classify Repository Council evidence and dispatch replays without guessing."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from typing import Any

REQUIRED_WORKFLOWS = (
    "MAST CI",
    "CodeQL",
    "Security and repository quality",
)
SHA_RE = re.compile(r"^[0-9a-f]{40}$")


def canonical_digest(value: Any) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def evaluate_gate(context: dict[str, Any]) -> dict[str, Any]:
    """Return an auditable gate outcome. Unknown or incomplete evidence fails closed."""
    repository = context.get("repository")
    target_sha = str(context.get("target_sha") or "").lower()
    current_sha = str(context.get("current_sha") or "").lower()
    workflow_runs = context.get("workflow_runs")
    blockers = context.get("blockers")
    base = {
        "schema_version": 1,
        "repository": repository,
        "target_sha": target_sha or None,
        "current_sha": current_sha or None,
        "source_run_id": str(context.get("source_run_id") or ""),
        "source_run_attempt": str(context.get("source_run_attempt") or ""),
        "required_workflows": list(REQUIRED_WORKFLOWS),
    }

    def finish(status: str, reason: str, checks: list[dict[str, Any]] | None = None) -> dict[str, Any]:
        result = {**base, "status": status, "reason": reason, "checks": checks or [],
                  "evidence_digest": ""}
        result["evidence_digest"] = canonical_digest({k: v for k, v in result.items() if k != "evidence_digest"})
        return result

    if not isinstance(repository, str) or not repository or "/" not in repository:
        return finish("evidence_not_produced", "repository_identity_missing")
    if not SHA_RE.fullmatch(target_sha) or not SHA_RE.fullmatch(current_sha):
        return finish("evidence_not_produced", "full_commit_sha_unavailable")
    if current_sha != target_sha:
        return finish("stale_sha", "target_is_not_current_default_branch_head")
    if context.get("query_error"):
        return finish("evidence_not_produced", "github_evidence_query_failed")
    if not isinstance(workflow_runs, list):
        return finish("evidence_not_produced", "workflow_evidence_missing")
    if not isinstance(blockers, list):
        return finish("evidence_not_produced", "open_pull_request_evidence_missing")

    checks = []
    failed = False
    missing = False
    stale = False
    for name in REQUIRED_WORKFLOWS:
        candidates = [run for run in workflow_runs
                      if isinstance(run, dict) and run.get("name") == name
                      and run.get("event") != "pull_request"
                      and run.get("head_branch", "main") == context.get("default_branch", "main")]
        candidates.sort(key=lambda run: (int(run.get("run_number") or 0), int(run.get("run_attempt") or 0)))
        latest = candidates[-1] if candidates else None
        if latest is None:
            checks.append({"workflow": name, "status": "missing"})
            missing = True
            continue
        item = {"workflow": name, "run_id": latest.get("id"), "head_sha": latest.get("head_sha"),
                "run_attempt": latest.get("run_attempt"), "status": latest.get("status"),
                "conclusion": latest.get("conclusion"), "url": latest.get("html_url")}
        if str(latest.get("head_sha") or "").lower() != target_sha:
            item["status"] = "stale"
            stale = True
        elif latest.get("status") != "completed":
            item["status"] = "incomplete"
            missing = True
        elif latest.get("conclusion") != "success":
            item["status"] = "failed"
            failed = True
        else:
            item["status"] = "passed"
        checks.append(item)

    if stale:
        return finish("evidence_stale", "latest_required_workflow_evidence_is_for_another_revision", checks)
    if missing:
        return finish("evidence_not_produced", "one_or_more_required_workflow_results_are_missing_or_incomplete", checks)
    if failed:
        return finish("gate_failed", "one_or_more_required_workflows_did_not_succeed", checks)
    unresolved = [pr for pr in blockers if isinstance(pr, dict) and
                  (pr.get("human_hold") is True or pr.get("repair_open") is True)]
    if unresolved:
        return finish("gate_failed", "unresolved_autonomy_pull_request_state", checks)
    return finish("gate_passed", "all_required_evidence_is_current_and_successful", checks)


def replay_decision(ledger: dict[str, Any] | None) -> str:
    """Only an absent ledger permits a first dispatch attempt."""
    if ledger is None:
        return "reserve"
    if ledger.get("status") == "dispatch_accepted":
        return "duplicate_replay"
    return "dispatch_reconciliation_required"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("context", type=Path, help="JSON input context")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--github-output", type=Path)
    args = parser.parse_args()
    context = json.loads(args.context.read_text(encoding="utf-8"))
    result = evaluate_gate(context)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    if args.github_output:
        with args.github_output.open("a", encoding="utf-8") as output:
            output.write(f"status={result['status']}\n")
            output.write(f"target_sha={result.get('target_sha') or ''}\n")
            output.write(f"evidence_digest={result['evidence_digest']}\n")
    print(json.dumps({"status": result["status"], "reason": result["reason"],
                      "evidence_digest": result["evidence_digest"]}, sort_keys=True))


if __name__ == "__main__":
    main()
