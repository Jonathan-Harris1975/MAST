"""Typed Kilo handoff failures and shared safe diagnostics."""

from __future__ import annotations


class RepairAgentConfigurationError(RuntimeError):
    """The repair agent cannot be called because local configuration is invalid."""


class RepairAgentUnavailableError(RuntimeError):
    """The provider could not be reached; whether it accepted may be uncertain."""


class RepairAgentProviderError(RuntimeError):
    """The provider returned an HTTP response for a failed handoff."""

    def __init__(self, status: int):
        self.status = status
        self.retryable = status == 429 or status >= 500
        super().__init__(f"Kilo trigger returned HTTP {status}")


def classify_repair_error(exc: Exception) -> tuple[str, str, bool]:
    """Return a stable code, safe operator guidance and retryability."""
    if isinstance(exc, RepairAgentConfigurationError):
        return (
            "repair-agent-configuration",
            "Configure and verify this repository's Kilo webhook and machine repair contract.",
            False,
        )
    if isinstance(exc, RepairAgentUnavailableError):
        return (
            "repair-agent-unavailable",
            "Check Kilo provider availability; inspect delivery history before retrying an uncertain handoff.",
            False,
        )
    if isinstance(exc, RepairAgentProviderError):
        status = exc.status
        retryable = exc.retryable
        guidance = (
            f"Kilo returned HTTP {status}; a bounded retry is eligible after provider health is confirmed."
            if retryable else
            f"Kilo rejected the request with HTTP {status}; correct provider configuration before retrying."
        )
        return ("repair-agent-provider-error", guidance, retryable)
    return (
        "repair-routing-error",
        "Inspect the trusted router's GitHub/API operation; raw exception details are withheld.",
        False,
    )
