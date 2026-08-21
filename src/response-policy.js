function valueAtPath(value, path = "") {
  return String(path || "").split(".").filter(Boolean).reduce((current, key) => current?.[key], value);
}

function describe(value) {
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

export function evaluateResponsePolicy(policy, responseText) {
  if (!policy?.checks?.length) return { ok: true, checked: false, failures: [] };

  let payload;
  try {
    payload = JSON.parse(responseText);
  } catch {
    return {
      ok: false,
      checked: true,
      failures: [{ type: "invalid-json", message: "Response policy expected JSON but the response body was not valid JSON." }],
    };
  }

  const failures = [];
  for (const check of policy.checks) {
    if (check?.type === "equals") {
      const actual = valueAtPath(payload, check.path);
      if (actual !== check.value) failures.push({
        type: check.type,
        path: check.path,
        expected: check.value,
        actual,
        message: check.message || `${check.path} expected ${describe(check.value)} but received ${describe(actual)}.`,
      });
      continue;
    }

    if (check?.type === "oneOf") {
      const actual = valueAtPath(payload, check.path);
      const values = Array.isArray(check.values) ? check.values : [];
      if (!values.includes(actual)) failures.push({
        type: check.type,
        path: check.path,
        expected: values,
        actual,
        message: check.message || `${check.path} did not match an allowed value.`,
      });
      continue;
    }

    if (check?.type === "arrayEveryEquals") {
      const values = valueAtPath(payload, check.path);
      const array = Array.isArray(values) ? values : null;
      const failed = !array || array.some((item) => item?.[check.key] !== check.value);
      if (failed) failures.push({
        type: check.type,
        path: check.path,
        key: check.key,
        expected: check.value,
        actual: array ? array.map((item) => item?.[check.key]) : values,
        message: check.message || `${check.path} contains an item whose ${check.key} does not match the expected value.`,
      });
      continue;
    }

    if (check?.type === "fieldsEqual") {
      const left = valueAtPath(payload, check.leftPath);
      const right = valueAtPath(payload, check.rightPath);
      if (left !== right) failures.push({
        type: check.type,
        leftPath: check.leftPath,
        rightPath: check.rightPath,
        left,
        right,
        message: check.message || `${check.leftPath} (${describe(left)}) did not equal ${check.rightPath} (${describe(right)}).`,
      });
      continue;
    }

    failures.push({
      type: "unsupported-check",
      message: `Unsupported response policy check type: ${check?.type || "<missing>"}.`,
    });
  }

  return { ok: failures.length === 0, checked: true, failures };
}
