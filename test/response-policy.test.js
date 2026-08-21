import test from "node:test";
import assert from "node:assert/strict";
import { evaluateResponsePolicy } from "../src/response-policy.js";

test("equals and oneOf response checks detect degraded JSON returned with HTTP 200", () => {
  assert.equal(evaluateResponsePolicy({ checks: [{ type: "equals", path: "ready", value: true }] }, '{"ready":true}').ok, true);
  const degraded = evaluateResponsePolicy({ checks: [{ type: "oneOf", path: "overall_status", values: ["healthy"] }] }, '{"overall_status":"degraded"}');
  assert.equal(degraded.ok, false);
  assert.equal(degraded.failures[0].actual, "degraded");
});

test("arrayEveryEquals fails when any provider is unhealthy", () => {
  const result = evaluateResponsePolicy({ checks: [{ type: "arrayEveryEquals", path: "providers", key: "ok", value: true }] }, '{"providers":[{"ok":true},{"ok":false}]}');
  assert.equal(result.ok, false);
});

test("fieldsEqual flags a partial monthly report", () => {
  const full = evaluateResponsePolicy({ checks: [{ type: "fieldsEqual", leftPath: "sections_ok", rightPath: "sections_total" }] }, '{"sections_ok":12,"sections_total":12}');
  const partial = evaluateResponsePolicy({ checks: [{ type: "fieldsEqual", leftPath: "sections_ok", rightPath: "sections_total" }] }, '{"sections_ok":10,"sections_total":12}');
  assert.equal(full.ok, true);
  assert.equal(partial.ok, false);
});

test("invalid JSON fails closed when a response policy is configured", () => {
  const result = evaluateResponsePolicy({ checks: [{ type: "equals", path: "ok", value: true }] }, '<html>nope</html>');
  assert.equal(result.ok, false);
  assert.equal(result.failures[0].type, "invalid-json");
});


test("monthly review persistence checks fail closed", () => {
  const policy = {
    checks: [
      { type: "fieldsEqual", leftPath: "sections_ok", rightPath: "sections_total" },
      { type: "equals", path: "r2_object.ok", value: true },
      { type: "equals", path: "d1_index.ok", value: true },
    ],
  };
  const healthy = evaluateResponsePolicy(policy, '{"sections_ok":11,"sections_total":11,"r2_object":{"ok":true},"d1_index":{"ok":true}}');
  const archiveFailed = evaluateResponsePolicy(policy, '{"sections_ok":11,"sections_total":11,"r2_object":{"ok":false},"d1_index":{"ok":true}}');
  const indexFailed = evaluateResponsePolicy(policy, '{"sections_ok":11,"sections_total":11,"r2_object":{"ok":true},"d1_index":{"ok":false}}');
  assert.equal(healthy.ok, true);
  assert.equal(archiveFailed.ok, false);
  assert.equal(indexFailed.ok, false);
});
