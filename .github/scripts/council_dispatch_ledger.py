#!/usr/bin/env python3
"""R2-backed at-most-once Council dispatch reservation for one repository revision."""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import hmac
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request

BUCKET = "hive-repositories"


def required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is required")
    return value


def signing_key(secret: str, day: str) -> bytes:
    key = hmac.new(("AWS4" + secret).encode(), day.encode(), hashlib.sha256).digest()
    key = hmac.new(key, b"auto", hashlib.sha256).digest()
    key = hmac.new(key, b"s3", hashlib.sha256).digest()
    return hmac.new(key, b"aws4_request", hashlib.sha256).digest()


def request(method: str, key: str, body: bytes = b"", *, if_none_match: str | None = None,
            if_match: str | None = None) -> tuple[int, bytes, str | None]:
    endpoint = os.environ.get("R2_ENDPOINT", "").strip() or os.environ.get("R2_ENDPOINT_URL", "").strip()
    account_id = os.environ.get("R2_ACCOUNT_ID", "").strip()
    if not endpoint and account_id:
        endpoint = f"https://{account_id}.r2.cloudflarestorage.com"
    parsed_endpoint = urllib.parse.urlsplit(endpoint)
    if (parsed_endpoint.scheme != "https" or not parsed_endpoint.hostname or parsed_endpoint.username
            or parsed_endpoint.password or parsed_endpoint.path not in ("", "/")
            or parsed_endpoint.query or parsed_endpoint.fragment):
        raise RuntimeError("a credential-free bare HTTPS R2 endpoint is required")
    access, secret = required("R2_ACCESS_KEY_ID"), required("R2_SECRET_ACCESS_KEY")
    path = "/" + BUCKET + "/" + "/".join(urllib.parse.quote(part, safe="-._~") for part in key.split("/"))
    now = dt.datetime.now(dt.timezone.utc)
    amz, day = now.strftime("%Y%m%dT%H%M%SZ"), now.strftime("%Y%m%d")
    payload_hash = hashlib.sha256(body).hexdigest()
    headers = {"host": parsed_endpoint.netloc, "x-amz-content-sha256": payload_hash, "x-amz-date": amz}
    if if_none_match is not None:
        headers["if-none-match"] = if_none_match
    if if_match is not None:
        headers["if-match"] = if_match
    names = sorted(headers)
    canonical_headers = "".join(f"{name}:{headers[name]}\n" for name in names)
    signed_headers = ";".join(names)
    canonical = "\n".join([method, path, "", canonical_headers, signed_headers, payload_hash])
    scope = f"{day}/auto/s3/aws4_request"
    string_to_sign = "\n".join(["AWS4-HMAC-SHA256", amz, scope,
                                  hashlib.sha256(canonical.encode()).hexdigest()])
    signature = hmac.new(signing_key(secret, day), string_to_sign.encode(), hashlib.sha256).hexdigest()
    outgoing = {name: value for name, value in headers.items() if name != "host"}
    outgoing["Authorization"] = (
        f"AWS4-HMAC-SHA256 Credential={access}/{scope}, "
        f"SignedHeaders={signed_headers}, Signature={signature}"
    )
    if method == "PUT":
        outgoing["Content-Type"] = "application/json"
    url = urllib.parse.urlunsplit((parsed_endpoint.scheme, parsed_endpoint.netloc, path, "", ""))
    request_obj = urllib.request.Request(url, data=body if method == "PUT" else None,
                                         headers=outgoing, method=method)
    try:
        with urllib.request.urlopen(request_obj, timeout=20) as response:
            return response.status, response.read(), response.headers.get("ETag")
    except urllib.error.HTTPError as error:
        if method == "GET" and error.code == 404:
            return 404, b"", None
        raise RuntimeError(f"R2 {method} failed with HTTP {error.code}") from error
    except (TimeoutError, urllib.error.URLError) as error:
        raise RuntimeError(f"R2 {method} request failed ({type(error).__name__})") from error


def ledger_key(repository: str, sha: str) -> str:
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository):
        raise RuntimeError("repository must be owner/name")
    if not re.fullmatch(r"[0-9a-f]{40}", sha):
        raise RuntimeError("target SHA must be a full lowercase commit SHA")
    repo_key = repository.replace("/", "_")
    return f"repository-evidence/{repo_key}/council-ledger/{sha}/dispatch.json"


def read_ledger(key: str) -> tuple[dict | None, str | None]:
    status, body, etag = request("GET", key)
    if status == 404:
        return None, None
    try:
        value = json.loads(body)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RuntimeError("existing Council dispatch ledger is unreadable; refusing dispatch") from error
    if not isinstance(value, dict) or value.get("schema_version") != 1:
        raise RuntimeError("existing Council dispatch ledger has an unsupported schema; refusing dispatch")
    return value, etag


def write_ledger(key: str, ledger: dict, *, if_none_match: str | None = None,
                 if_match: str | None = None) -> None:
    body = (json.dumps(ledger, sort_keys=True, indent=2) + "\n").encode()
    status, _, _ = request("PUT", key, body, if_none_match=if_none_match, if_match=if_match)
    if status not in (200, 201, 204):
        raise RuntimeError(f"R2 ledger write returned HTTP {status}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=("reserve", "settle"))
    parser.add_argument("--repository", default=os.environ.get("GITHUB_REPOSITORY", ""))
    parser.add_argument("--sha", required=True)
    parser.add_argument("--run-id", default=os.environ.get("GITHUB_RUN_ID", ""))
    parser.add_argument("--run-attempt", default=os.environ.get("GITHUB_RUN_ATTEMPT", ""))
    parser.add_argument("--evidence-digest", required=True)
    parser.add_argument("--status", choices=("dispatch_accepted", "dispatch_rejected", "dispatch_unknown"))
    args = parser.parse_args()
    if not re.fullmatch(r"[0-9]+", args.run_id) or not re.fullmatch(r"[0-9]+", args.run_attempt):
        raise SystemExit("numeric GitHub run ID and attempt are required")
    if not re.fullmatch(r"[0-9a-f]{64}", args.evidence_digest):
        raise SystemExit("full lowercase evidence SHA-256 digest is required")
    key = ledger_key(args.repository, args.sha.lower())
    current, etag = read_ledger(key)
    if args.action == "reserve":
        if current is not None:
            if current.get("status") == "dispatch_accepted":
                print(json.dumps({"decision": "duplicate_replay", "ledger_status": current.get("status")}))
            else:
                print(json.dumps({"decision": "dispatch_reconciliation_required",
                                  "ledger_status": current.get("status")}))
            return
        ledger = {
            "schema_version": 1, "repository": args.repository, "target_sha": args.sha.lower(),
            "source_run_id": args.run_id, "source_run_attempt": args.run_attempt,
            "evidence_digest": args.evidence_digest, "status": "reserved",
            "reserved_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        }
        # R2 evaluates this condition atomically with the object write. If another
        # writer won the race, the failed precondition blocks dispatch.
        write_ledger(key, ledger, if_none_match="*")
        print(json.dumps({"decision": "reserved", "ledger_status": "reserved"}))
        return
    if current is None or current.get("status") != "reserved":
        raise SystemExit("only an existing reserved Council dispatch can be settled")
    if current.get("source_run_id") != args.run_id or current.get("source_run_attempt") != args.run_attempt:
        raise SystemExit("Council dispatch reservation belongs to another workflow attempt")
    if current.get("evidence_digest") != args.evidence_digest:
        raise SystemExit("Council dispatch evidence digest does not match its reservation")
    current.update(status=args.status, settled_at=dt.datetime.now(dt.timezone.utc).isoformat())
    if not etag:
        raise SystemExit("existing Council dispatch ledger has no ETag; refusing to overwrite it")
    write_ledger(key, current, if_match=etag)
    print(json.dumps({"decision": args.status, "ledger_status": args.status}))


if __name__ == "__main__":
    main()
