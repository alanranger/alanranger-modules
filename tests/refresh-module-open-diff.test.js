const test = require("node:test");
const assert = require("node:assert/strict");
const { shouldUpsertModuleOpen } = require("../lib/refreshModuleOpenDiff");

test("upsert when no existing row", () => {
  assert.equal(shouldUpsertModuleOpen(null, "2026-10-12T10:00:00.000Z"), true);
});

test("skip when Memberstack time matches stored", () => {
  const iso = "2026-10-01T12:00:00.000Z";
  assert.equal(
    shouldUpsertModuleOpen({ created_at: iso, meta: { last_opened_at: iso } }, iso),
    false
  );
});

test("upsert when Memberstack lastAt is newer", () => {
  assert.equal(
    shouldUpsertModuleOpen(
      { created_at: "2026-10-01T12:00:00.000Z", meta: { last_opened_at: "2026-10-01T12:00:00.000Z" } },
      "2026-10-12T09:00:00.000Z"
    ),
    true
  );
});

test("skip when incoming timestamp missing but row exists", () => {
  assert.equal(
    shouldUpsertModuleOpen({ created_at: "2026-10-01T12:00:00.000Z", meta: {} }, null),
    false
  );
});
