"""Regression checks for repair retirement; all GitHub writes are mocked."""
import copy
import inspect
import json
import os
from pathlib import Path
import unittest
import native_auto_merge
from unittest.mock import patch

os.environ.setdefault("GH_TOKEN", "unit-test")
os.environ.setdefault("GITHUB_REPOSITORY", "owner/repo")

import branch_pr_automation as branch_controller  # noqa: E402
import trusted_automation as automation  # noqa: E402


class RepairRetirementTests(unittest.TestCase):
    def setUp(self):
        self.current = "a" * 40
        self.pr = {
            "number": 1,
            "state": "open",
            "title": "[autonomy] Repair CI failure (123)",
            "user": {"login": "repair[bot]"},
            "head": {"ref": "autonomy/repair-123", "repo": {"full_name": "owner/repo"}},
            "base": {"ref": "main"},
            "labels": [{"name": "autonomy:repair"}],
            "body": f"Failed commit: `{self.current}`",
        }
        for name, value in {"REPO": "owner/repo", "REPAIR_APP_LOGIN": "repair[bot]", "DEFAULT_BRANCH": "main"}.items():
            self.enterContext(patch.object(automation, name, value))
        self.enterContext(patch.object(automation, "get", return_value={"commit": {"sha": self.current}}))
        self.write = self.enterContext(patch.object(automation, "request"))
        self.labels = self.enterContext(patch.object(automation, "add_labels"))
        self.delete = self.enterContext(patch.object(automation, "delete"))
        self.enterContext(patch.object(automation, "log"))

    def retire(self):
        automation.reconcile_stale_carriers([copy.deepcopy(self.pr)])

    def test_current_unresolved_carrier_remains_open(self):
        self.retire()
        self.write.assert_not_called()

    def test_current_human_hold_remains_open(self):
        self.pr["labels"].append({"name": "autonomy:human-hold"})
        self.retire()
        self.write.assert_not_called()
        self.delete.assert_not_called()

    def test_obsolete_carrier_closes_even_at_current_sha(self):
        self.pr["labels"].append({"name": "autonomy:obsolete"})
        self.retire()
        self.write.assert_called_once_with("PATCH", "/repos/owner/repo/pulls/1", {"state": "closed"})
        self.delete.assert_called_once_with("/repos/owner/repo/issues/1/labels/autonomy%3Arepair", expected=(200, 204))

    def test_retirement_retries_after_active_label_was_removed(self):
        self.pr["labels"] = [{"name": "autonomy:superseded"}]
        self.retire()
        self.write.assert_called_once()

    def test_stale_carrier_is_labelled_and_closed(self):
        self.pr["body"] = f"Failed commit: `{'b' * 40}`"
        self.retire()
        self.labels.assert_called_once_with(1, ["autonomy:obsolete"])
        self.write.assert_called_once()

    def test_impostor_and_implementation_are_never_retired(self):
        self.pr["labels"].append({"name": "autonomy:obsolete"})
        self.pr["user"]["login"] = "another-user"
        self.retire()
        self.pr["user"]["login"] = "repair[bot]"
        self.pr["head"]["ref"] = "implementation/fix"
        self.retire()
        self.write.assert_not_called()

    def test_fork_carrier_is_never_retired(self):
        self.pr["labels"].append({"name": "autonomy:obsolete"})
        self.pr["head"]["repo"]["full_name"] = "fork/repo"
        self.retire()
        self.write.assert_not_called()

    def test_failed_close_keeps_active_labels_for_retry(self):
        self.pr["labels"].append({"name": "autonomy:obsolete"})
        self.write.side_effect = RuntimeError("simulated unavailable API")
        with self.assertRaises(RuntimeError):
            self.retire()
        self.delete.assert_not_called()


class ManagedBranchOwnershipTests(unittest.TestCase):
    def setUp(self):
        self.sha = "c" * 40
        self.pr = {
            "number": 22,
            "state": "open",
            "draft": False,
            "title": "Implement requested change",
            "user": {"login": "repair[bot]"},
            "head": {
                "ref": "codex/requested-change",
                "sha": self.sha,
                "repo": {"full_name": "owner/repo"},
            },
            "base": {"ref": "main"},
            "labels": [{"name": "automation:branch-pr"}],
            "body": "",
        }
        for name, value in {
            "REPO": "owner/repo",
            "REPAIR_APP_LOGIN": "repair[bot]",
            "DEFAULT_BRANCH": "main",
        }.items():
            self.enterContext(patch.object(automation, name, value))
        self.enterContext(patch.object(automation, "log"))

    def test_branch_controller_has_no_merge_authority(self):
        source = inspect.getsource(branch_controller)
        self.assertNotIn("enablePullRequestAutoMerge", source)
        self.assertNotIn("disablePullRequestAutoMerge", source)
        self.assertNotIn('gh", "pr", "merge', source)

    def test_managed_branch_pr_is_admitted_to_mergify_after_green_checks(self):
        admit = self.enterContext(patch.object(automation, "admit_to_mergify"))
        approve = self.enterContext(patch.object(automation, "approve_pr"))
        self.enterContext(
            patch.object(automation, "pr_files", return_value=["docs/runbook.md"])
        )
        self.enterContext(
            patch.object(
                automation,
                "all_required_checks_green",
                return_value=(True, "green"),
            )
        )
        self.enterContext(
            patch.object(automation, "current_head_unchanged", return_value=self.pr)
        )

        automation.reconcile_pr(copy.deepcopy(self.pr))

        admit.assert_called_once_with(22)
        approve.assert_not_called()

    def test_managed_branch_pr_touching_governance_gets_human_hold(self):
        hold = self.enterContext(patch.object(automation, "require_operator_risk_approval", return_value=True))
        admit = self.enterContext(patch.object(automation, "admit_to_mergify"))
        self.enterContext(
            patch.object(
                automation,
                "pr_files",
                return_value=[".github/workflows/security.yml"],
            )
        )

        automation.reconcile_pr(copy.deepcopy(self.pr))

        hold.assert_called_once()
        admit.assert_not_called()

    def test_managed_branch_pr_cannot_rewrite_admission_controller(self):
        hold = self.enterContext(patch.object(automation, "require_operator_risk_approval", return_value=True))
        admit = self.enterContext(patch.object(automation, "admit_to_mergify"))
        self.enterContext(
            patch.object(
                automation,
                "pr_files",
                return_value=[".github/scripts/trusted_automation.py"],
            )
        )

        automation.reconcile_pr(copy.deepcopy(self.pr))

        hold.assert_called_once()
        admit.assert_not_called()


class ProductionGovernanceProtectionTests(unittest.TestCase):
    def test_contract_is_sensitive_and_kilo_cannot_mutate_it(self):
        path = ".github/production-governance.json"
        self.assertTrue(automation.sensitive_file(path))
        root = Path(__file__).resolve().parents[2]
        policy = json.loads((root / "kilo.jsonc").read_text(encoding="utf-8"))
        for tool in ("edit", "write", "apply_patch"):
            self.assertEqual(policy["permission"][tool][path], "deny")



    def test_main_repair_reserves_marker_before_kilo_and_acknowledges_after(self):
        root = Path(__file__).resolve().parents[1]
        workflow = (root / "workflows/autonomous-repair.yml").read_text(encoding="utf-8")
        start = workflow.index("dispatch_kilo() {")
        end = workflow.index('\n\n          if [ "$RUN_CONCLUSION"', start)
        dispatch = workflow[start:end]
        for operation in ("gh api --method POST", 'status="$(curl', "gh api --method PATCH"):
            self.assertIn(operation, dispatch)
        reservation = dispatch.index("gh api --method POST")
        request = dispatch.index('status="$(curl')
        acknowledgement = dispatch.rindex("gh api --method PATCH")
        self.assertLess(reservation, request)
        self.assertLess(request, acknowledgement)
        self.assertIn('--field body="$marker', dispatch)
        self.assertIn("--jq '.id'", dispatch)
        self.assertIn("dispatch-state: pending", dispatch)
        self.assertIn("dispatch-state: accepted", dispatch)
        self.assertIn("dispatch-state: rejected-http-$status", dispatch)
        self.assertIn('rejected_attempts" -ge 2', dispatch)
        self.assertEqual(dispatch.count("for patch_attempt in 1 2; do"), 2)
        self.assertIn("pending marker remains to suppress duplicates", dispatch)



class NativeAutoMergeCurrentLabelTests(unittest.TestCase):
    def test_fresh_hold_label_blocks_auto_merge_enable(self):
        summary = {
            "number": 7,
            "labels": [{"name": "autonomy:admitted"}],
            "node_id": "PR_node_7",
        }
        detail = {
            "state": "open",
            "draft": False,
            "base": {"ref": "main"},
            "head": {"sha": "a" * 40},
            "mergeable": True,
            "labels": [
                {"name": "autonomy:admitted"},
                {"name": "autonomy:human-hold"},
            ],
        }
        with (
            patch.object(native_auto_merge, "merge_request", return_value=None),
            patch.object(native_auto_merge, "request", return_value=detail),
            patch.object(native_auto_merge, "admission_check", return_value=(True, True)),
            patch.object(native_auto_merge, "enable") as enable,
        ):
            native_auto_merge.reconcile(summary)
        enable.assert_not_called()

    def test_risk_approval_label_blocks_auto_merge_enable(self):
        summary = {
            "number": 7,
            "labels": [{"name": "autonomy:admitted"}],
            "node_id": "PR_node_7",
        }
        detail = {
            "state": "open",
            "draft": False,
            "base": {"ref": "main"},
            "head": {"sha": "a" * 40},
            "mergeable": True,
            "labels": [
                {"name": "autonomy:admitted"},
                {"name": "autonomy:risk-approval-required"},
            ],
        }
        with (
            patch.object(native_auto_merge, "merge_request", return_value=None),
            patch.object(native_auto_merge, "request", return_value=detail),
            patch.object(native_auto_merge, "admission_check", return_value=(True, True)),
            patch.object(native_auto_merge, "enable") as enable,
        ):
            native_auto_merge.reconcile(summary)
        enable.assert_not_called()

    def test_removed_admission_label_preserves_user_auto_merge_request(self):
        summary = {
            "number": 7,
            "labels": [{"name": "autonomy:admitted"}],
            "node_id": "PR_node_7",
        }
        detail = {
            "state": "open",
            "draft": False,
            "base": {"ref": "main"},
            "head": {"sha": "a" * 40},
            "mergeable": True,
            "labels": [],
        }
        active = {"enabledAt": "2026-01-01T00:00:00Z", "mergeMethod": "SQUASH"}
        with (
            patch.object(native_auto_merge, "merge_request", return_value=active),
            patch.object(native_auto_merge, "request", return_value=detail),
            patch.object(native_auto_merge, "admission_check", return_value=(False, True)),
            patch.object(native_auto_merge, "disable") as disable,
        ):
            native_auto_merge.reconcile(summary)
        disable.assert_not_called()

    def test_uncomputed_mergeability_preserves_existing_auto_merge(self):
        summary = {
            "number": 7,
            "labels": [{"name": "autonomy:admitted"}],
            "node_id": "PR_node_7",
        }
        detail = {
            "state": "open",
            "draft": False,
            "base": {"ref": "main"},
            "head": {"sha": "a" * 40},
            "mergeable": None,
            "labels": [{"name": "autonomy:admitted"}],
        }
        active = {"enabledAt": "2026-01-01T00:00:00Z", "mergeMethod": "SQUASH"}
        with (
            patch.object(native_auto_merge, "merge_request", return_value=active),
            patch.object(native_auto_merge, "request", return_value=detail),
            patch.object(native_auto_merge, "admission_check", return_value=(True, True)),
            patch.object(native_auto_merge, "enable") as enable,
            patch.object(native_auto_merge, "disable") as disable,
        ):
            native_auto_merge.reconcile(summary)
        enable.assert_not_called()
        disable.assert_not_called()

    def test_admission_evidence_from_another_pr_does_not_count(self):
        sha = "a" * 40
        runs = [{
            "app": {"slug": "github-actions"},
            "name": native_auto_merge.ADMISSION_CHECK,
            "external_id": f"trusted-autonomy-admission:99:{sha}",
            "head_sha": sha,
            "status": "completed",
            "conclusion": "success",
        }]
        with patch.object(native_auto_merge, "request", return_value={"check_runs": runs}):
            self.assertEqual(native_auto_merge.admission_check(7, sha), (False, False))

    def test_open_pr_listing_fails_closed_at_safety_limit(self):
        page = [{"number": number} for number in range(100)]
        with patch.object(native_auto_merge, "request", side_effect=[page] * 10) as request:
            with self.assertRaisesRegex(RuntimeError, "1,000-item safety limit"):
                native_auto_merge.pages("/repos/owner/repo/pulls?state=open")
        self.assertEqual(request.call_count, 10)


    def test_native_merge_method_uses_a_strategy_enabled_by_repo(self):
        with patch.object(
            native_auto_merge,
            "request",
            return_value={"allow_squash_merge": False, "allow_merge_commit": True, "allow_rebase_merge": True},
        ):
            self.assertEqual(native_auto_merge.merge_method(), "MERGE")


class RiskApprovalPolicyTests(unittest.TestCase):
    def setUp(self):
        self.sha = "a" * 40
        self.review_path = "/repos/owner/repo/pulls/42/reviews?per_page=100&page=1"
        self.comments_path = "/repos/owner/repo/issues/42/comments?per_page=100&page=1"

    def test_allowlist_is_narrow_and_unknown_or_security_paths_hold(self):
        self.assertFalse(automation.sensitive_file("docs/runbook.md"))
        if automation.REPO.rsplit("/", 1)[-1] == "IRS":
            self.assertFalse(automation.sensitive_file("public/status.css"))
        self.assertTrue(automation.sensitive_file(".github/workflows/ci.yml"))
        self.assertTrue(automation.sensitive_file("unclassified/new-file.py"))

    def test_recent_owner_review_for_exact_head_is_accepted(self):
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc).isoformat()
        with patch.object(automation, "REPO", "owner/repo"), patch.object(
            automation, "get",
            side_effect=[
                [{"user": {"login": "owner"}, "state": "APPROVED", "commit_id": self.sha, "submitted_at": now}],
                [],
            ],
        ):
            self.assertTrue(automation.has_operator_risk_approval(42, self.sha))

    def test_expired_or_wrong_head_owner_review_is_rejected(self):
        from datetime import datetime, timedelta, timezone
        old = (datetime.now(timezone.utc) - timedelta(days=8)).isoformat()
        for commit_id, submitted_at in ((self.sha, old), ("b" * 40, datetime.now(timezone.utc).isoformat())):
            with self.subTest(commit_id=commit_id, submitted_at=submitted_at), patch.object(
                automation, "REPO", "owner/repo"
            ), patch.object(
                automation, "get",
                side_effect=[
                    [{"user": {"login": "owner"}, "state": "APPROVED", "commit_id": commit_id, "submitted_at": submitted_at}],
                    [],
                ],
            ):
                self.assertFalse(automation.has_operator_risk_approval(42, self.sha))

    def test_unapproved_risky_pr_loses_admission_and_is_held(self):
        pr = {
            "number": 42,
            "head": {"sha": self.sha},
            "labels": [{"name": "autonomy:admitted"}],
        }
        with (
            patch.object(automation, "REPO", "owner/repo"),
            patch.object(automation, "has_operator_risk_approval", return_value=False),
            patch.object(automation, "add_labels") as add,
            patch.object(automation, "remove_label") as remove,
            patch.object(automation, "comment"),
            patch.object(automation, "log"),
        ):
            held = automation.require_operator_risk_approval(
                pr, [".github/workflows/ci.yml"], "managed branch"
            )
        self.assertTrue(held)
        add.assert_called_once_with(42, [automation.RISK_APPROVAL_LABEL])
        remove.assert_called_once_with(42, "autonomy:admitted")



    def test_exact_head_approval_comment_expires_after_seven_days(self):
        from datetime import datetime, timedelta, timezone
        fresh = datetime.now(timezone.utc).isoformat()
        stale = (datetime.now(timezone.utc) - timedelta(days=8)).isoformat()
        for timestamp, expected in ((fresh, True), (stale, False)):
            with self.subTest(timestamp=timestamp), patch.object(
                automation, "REPO", "owner/repo"
            ), patch.object(
                automation, "get",
                side_effect=[
                    [],
                    [{"user": {"login": "owner"}, "body": f"/risk-approve {self.sha}", "created_at": timestamp}],
                ],
            ):
                self.assertEqual(automation.has_operator_risk_approval(42, self.sha), expected)


if __name__ == "__main__":
    unittest.main()


class KiloControlPlaneProtectionTests(unittest.TestCase):
    def test_kilo_cannot_change_project_overrides_or_its_repair_contract(self):
        root = Path(__file__).resolve().parents[2]
        policy = json.loads((root / "kilo.jsonc").read_text(encoding="utf-8"))
        protected = (
            ".kilo/**",
            ".kilocode/**",
            ".github/kilo-machine-repair-contract.md",
        )
        for tool in ("edit", "write", "apply_patch"):
            rules = policy["permission"][tool]
            for pattern in protected:
                self.assertEqual(rules[pattern], "deny")
                self.assertLess(list(rules).index("*"), list(rules).index(pattern))
