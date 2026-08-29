import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  normalizeSignupSource,
  extractSignupSourceFromStripeObject,
  SIGNUP_SOURCE_TRACKING_FROM,
} = require("../lib/signupSource.js");

test("normalizes youtube src", () => {
  assert.equal(normalizeSignupSource("YouTube"), "youtube");
  assert.equal(normalizeSignupSource(" newsletter "), "newsletter");
});

test("rejects empty or unsafe src", () => {
  assert.equal(normalizeSignupSource(""), null);
  assert.equal(normalizeSignupSource("<script>"), null);
  assert.equal(normalizeSignupSource(null), null);
});

test("extracts signup_source from Stripe metadata", () => {
  assert.equal(
    extractSignupSourceFromStripeObject({ metadata: { signup_source: "youtube" } }),
    "youtube"
  );
  assert.equal(
    extractSignupSourceFromStripeObject({ metadata: { src: "google" } }),
    "google"
  );
});

test("tracking start date is documented", () => {
  assert.equal(SIGNUP_SOURCE_TRACKING_FROM, "2026-08-29");
});
