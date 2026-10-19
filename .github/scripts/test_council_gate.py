#!/usr/bin/env python3
import sys
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))
import council_dispatch_ledger
import persist_ci_report_r2
from council_gate import evaluate_gate, replay_decision

SHA = "a" * 40
OTHER_SHA = "b" * 40


def passing_context():
    names = ("MAST CI", "CodeQL", "Security and repository quality")
    return {
        "repository": "Jonathan-Harris1975/MAST",
        "target_sha": SHA,
        "current_sha": SHA,
        "default_branch": "main",
        "source_run_id": "101",
        "source_run_attempt": "1",
        "workflow_runs": [
            {"id": i, "name": name, "event": "push", "head_branch": "main",
             "head_sha": SHA, "run_number": i, "run_attempt": 1,
             "status": "completed", "conclusion": "success"}
            for i, name in enumerate(names, 1)
        ],
        "blockers": [],
    }


class CouncilGateTests(unittest.TestCase):
    def test_absent_council_constituent_output_is_visible_and_fails_closed(self):
        context = passing_context()
        context["workflow_runs"] = context["workflow_runs"][:-1]
        result = evaluate_gate(context)
        self.assertEqual(result["status"], "evidence_not_produced")
        self.assertEqual(result["checks"][-1]["status"], "missing")

    def test_stale_sha_does_not_dispatch(self):
        context = passing_context()
        context["current_sha"] = OTHER_SHA
        self.assertEqual(evaluate_gate(context)["status"], "stale_sha")

    def test_stale_constituent_evidence_is_distinct_from_missing(self):
        context = passing_context()
        context["workflow_runs"][0]["head_sha"] = OTHER_SHA
        self.assertEqual(evaluate_gate(context)["status"], "evidence_stale")

    def test_failing_check_is_visible_and_fails_closed(self):
        context = passing_context()
        context["workflow_runs"][1]["conclusion"] = "failure"
        self.assertEqual(evaluate_gate(context)["status"], "gate_failed")

    def test_successful_evidence_passes_and_is_correlated_by_digest(self):
        result = evaluate_gate(passing_context())
        self.assertEqual(result["status"], "gate_passed")
        self.assertEqual(len(result["evidence_digest"]), 64)
        self.assertTrue(all(item["status"] == "passed" for item in result["checks"]))

    def test_r2_write_failure_is_a_visible_non_dispatch_state(self):
        # The reservation command aborts on failed R2 PUT; workflow dispatch is
        # downstream of that command and therefore cannot be reached.
        with patch.object(council_dispatch_ledger, "request", return_value=(500, b"", None)) as request:
            with self.assertRaisesRegex(RuntimeError, "HTTP 500"):
                council_dispatch_ledger.main.__globals__["write_ledger"](
                    "repository-evidence/Jonathan-Harris1975_MAST/council-ledger/" + SHA + "/dispatch.json",
                    {"schema_version": 1, "status": "reserved"},
                )
            self.assertEqual(request.call_count, 1)

    def test_r2_reservation_uses_atomic_create_condition(self):
        with patch.object(council_dispatch_ledger, "request", return_value=(204, b"", None)) as request:
            council_dispatch_ledger.write_ledger(
                "repository-evidence/Jonathan-Harris1975_MAST/council-ledger/" + SHA + "/dispatch.json",
                {"schema_version": 1, "status": "reserved"}, if_none_match="*",
            )
        self.assertEqual(request.call_args.kwargs["if_none_match"], "*")

    def test_accepted_ledger_turns_replay_into_no_dispatch(self):
        self.assertEqual(replay_decision({"status": "dispatch_accepted"}), "duplicate_replay")

    def test_reserved_or_uncertain_ledger_requires_reconciliation(self):
        for status in ("reserved", "dispatch_unknown", "dispatch_rejected"):
            with self.subTest(status=status):
                self.assertEqual(replay_decision({"status": status}), "dispatch_reconciliation_required")

    def test_failed_delivery_never_becomes_an_automatic_replay(self):
        self.assertEqual(replay_decision({"status": "dispatch_rejected"}), "dispatch_reconciliation_required")

    def test_blocker_is_gate_failure(self):
        context = passing_context()
        context["blockers"] = [{"human_hold": True}]
        self.assertEqual(evaluate_gate(context)["status"], "gate_failed")

    def test_query_failure_is_not_green(self):
        context = passing_context()
        context["query_error"] = "GitHub API unavailable"
        self.assertEqual(evaluate_gate(context)["status"], "evidence_not_produced")

    def test_successful_r2_persistence_manifest_correlates_revision_run_and_digest(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "evidence"
            source.mkdir()
            (source / "gate-evidence.json").write_text('{"status":"gate_passed"}\n', encoding="utf-8")
            env = {
                "GITHUB_REPOSITORY": "Jonathan-Harris1975/MAST",
                "GITHUB_RUN_ID": "9876",
                "GITHUB_RUN_ATTEMPT": "2",
                "R2_ENDPOINT": "https://account-id.r2.cloudflarestorage.com",
                "EVIDENCE_RUN_ID": "9876",
                "EVIDENCE_RUN_ATTEMPT": "2",
                "EVIDENCE_STATUS": "dispatch_accepted",
                "GITHUB_STEP_SUMMARY": str(root / "summary.md"),
            }
            objects = {}

            def fake_r2_request(method, endpoint, key, body=b"", *args, **kwargs):
                if method == "PUT":
                    objects[key] = body
                    return None
                if method == "GET":
                    return objects[key]
                return None

            with patch.dict(os.environ, env, clear=False), \
                 patch.object(sys, "argv", ["persist_ci_report_r2.py", "council", SHA, str(source)]), \
                 patch.object(persist_ci_report_r2, "request", side_effect=fake_r2_request) as r2_request:
                persist_ci_report_r2.main()
            manifest_call = next(call for call in r2_request.call_args_list
                                 if call.args[0] == "PUT" and call.args[2].endswith("evidence-manifest.json"))
            manifest = json.loads(manifest_call.args[3])
            self.assertEqual(manifest["repository"], "MAST")
            self.assertEqual(manifest["default_branch_sha"], SHA)
            self.assertEqual(manifest["workflow_run_id"], "9876")
            self.assertEqual(manifest["workflow_run_attempt"], "2")
            self.assertEqual(manifest["status"], "dispatch_accepted")
            self.assertEqual(len(manifest["evidence_digest"]), 64)


if __name__ == "__main__":
    unittest.main()
