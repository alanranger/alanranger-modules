const test = require("node:test");
const assert = require("node:assert/strict");
const { formatErr, isRateLimited } = require("../lib/refreshErrors");

test("formatErr surfaces Memberstack string throws", () => {
  assert.equal(
    formatErr("Too many requests, please try again later."),
    "Too many requests, please try again later."
  );
});

test("formatErr prefers Error.message", () => {
  assert.equal(formatErr(new Error("boom")), "boom");
});

test("formatErr reads { code, message } objects", () => {
  assert.equal(
    formatErr({ code: "validation/invalid-secret-key", message: "The provided secret key is invalid." }),
    "The provided secret key is invalid."
  );
});

test("isRateLimited detects string rate limits", () => {
  assert.equal(isRateLimited("Too many requests, please try again later."), true);
  assert.equal(isRateLimited(new Error("nope")), false);
});
