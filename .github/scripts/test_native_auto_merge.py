#!/usr/bin/env python3
"""Regression tests for exact-head native admission and the MAST hold policy."""
from __future__ import annotations

import os
import unittest
from unittest.mock import patch

os.environ.setdefault("REPO", "Jonathan-Harris1975/MAST")
os.environ.setdefault("GH_TOKEN", "unit-test")
os.environ.setdefault("NATIVE_MERGE_TOKEN", "unit-test")
os.environ.setdefault("ADMISSION_TOKEN", "unit-test")

import autonomy_admission_check as admission_check  # noqa: E402
import native_auto_merge as native_merge  # noqa: E402
import trusted_automation as automation  # noqa: E402


class ExactHeadAdmissionTests(unittest.TestCase):
    @patch("autonomy_admission_check._request")
    def test_publishes_trusted_check_bound_to_pull_request_and_exact_sha(self, request):
        request.side_effect = [{"check_runs": []}, {"id": 1}]
        sha = "a" * 40

        self.assertTrue(admission_check.set_admission_check(22, sha, "success", "verified"))

        method, path, payload = request.call_args_list[1].args
        self.assertEqual(method, "POST")
        self.assertEqual(path, f"/repos/{native_merge.REPO}/check-runs")
        self.assertEqual(payload["head_sha"], sha)
        self.assertEqual(payload["external_id"], f"trusted-autonomy-admission:22:{sha}")
        self.assertEqual(payload["name"], "Trusted autonomy admission")
        self.assertEqual(payload["conclusion"], "success")


class NativeAutoMergePolicyTests(unittest.TestCase):
    def setUp(self):
        self.node_id = "PR_node"
        self.sha = "b" * 40
        self.summary = {
            "number": 22,
            "node_id": self.node_id,
            "labels": [{"name": "autonomy:admitted"}],
        }
        self.pr = {
            "state": "open",
            "draft": False,
            "base": {"ref": "main"},
            "mergeable": True,
            "head": {"sha": self.sha},
            "labels": [{"name": "autonomy:admitted"}],
        }

    def test_mast_routine_admission_does_not_require_owner_review(self):
        with (
            patch.object(native_merge, "merge_request", return_value=None),
            patch.object(native_merge, "request", return_value=self.pr),
            patch.object(native_merge, "admission_check", return_value=(True, True)) as check,
            patch.object(native_merge, "enable") as enable,
        ):
            native_merge.reconcile(self.summary)

        check.assert_called_once_with(22, self.sha)
        enable.assert_called_once_with(self.node_id)

    def test_exact_head_admission_is_required(self):
        with (
            patch.object(native_merge, "merge_request", return_value=None),
            patch.object(native_merge, "request", return_value=self.pr),
            patch.object(native_merge, "admission_check", return_value=(False, True)),
            patch.object(native_merge, "enable") as enable,
        ):
            native_merge.reconcile(self.summary)

        enable.assert_not_called()

    def test_human_hold_prevents_and_revokes_native_auto_merge(self):
        summary = {
            **self.summary,
            "labels": [
                {"name": "autonomy:admitted"},
                {"name": "autonomy:human-hold"},
            ],
        }
        active_request = {"enabledAt": "2026-10-13T00:00:00Z"}
        held_pr = {
            **self.pr,
            "labels": [*self.pr["labels"], {"name": "autonomy:human-hold"}],
        }
        with (
            patch.object(native_merge, "merge_request", return_value=active_request),
            patch.object(native_merge, "request", return_value=held_pr),
            patch.object(native_merge, "admission_check", return_value=(True, True)),
            patch.object(native_merge, "enable") as enable,
            patch.object(native_merge, "disable") as disable,
        ):
            native_merge.reconcile(summary)

        enable.assert_not_called()
        disable.assert_called_once_with(self.node_id)



class HighRiskApprovalPolicyTests(unittest.TestCase):
    def test_high_risk_paths_are_classified_and_routine_code_stays_unrestricted(self):
        automation.risk_policy_contract_test()
        self.assertTrue(automation.sensitive_file("infra/production.tf"))
        self.assertTrue(automation.sensitive_file("src/auth/session.py"))
        self.assertFalse(automation.sensitive_file("docs/runbook.md"))

    def test_owner_approval_must_match_the_exact_current_head(self):
        sha = "c" * 40
        owner_review = {
            "state": "APPROVED",
            "commit_id": sha,
            "submitted_at": "2026-10-14T00:00:00Z",
            "user": {"login": "Jonathan-Harris1975"},
        }
        with patch.object(
            automation,
            "get",
            side_effect=lambda endpoint: [owner_review] if "/reviews?" in endpoint else [],
        ):
            self.assertTrue(automation.has_operator_risk_approval(22, sha))
            self.assertFalse(automation.has_operator_risk_approval(22, "d" * 40))

    def test_native_merge_blocks_the_exact_risk_approval_label(self):
        node_id = "PR_node"
        sha = "b" * 40
        summary = {
            "number": 22,
            "node_id": node_id,
            "labels": [
                {"name": "autonomy:admitted"},
                {"name": automation.RISK_APPROVAL_LABEL},
            ],
        }
        held_pr = {
            "state": "open",
            "draft": False,
            "base": {"ref": "main"},
            "mergeable": True,
            "head": {"sha": sha},
            "labels": [
                {"name": "autonomy:admitted"},
                {"name": automation.RISK_APPROVAL_LABEL},
            ],
        }
        active_request = {"enabledAt": "2026-10-13T00:00:00Z"}
        with (
            patch.object(native_merge, "merge_request", return_value=active_request),
            patch.object(native_merge, "request", return_value=held_pr),
            patch.object(native_merge, "admission_check", return_value=(True, True)),
            patch.object(native_merge, "enable") as enable,
            patch.object(native_merge, "disable") as disable,
        ):
            native_merge.reconcile(summary)
        enable.assert_not_called()
        disable.assert_called_once_with(node_id)


if __name__ == "__main__":
    unittest.main()
