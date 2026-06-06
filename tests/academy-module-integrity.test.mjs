/**
 * Module cube integrity tests (topic<->URL, PDF flags, open URL resolution).
 * Run: npm run test:modules
 */
import { createRequire } from "module";
import test from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const paths = require(path.join(root, "lib/academy-module-paths.js"));
const topics = require(path.join(root, "lib/academy-module-topics.js"));
const cubeOpen = require(path.join(root, "lib/academy-cube-open.js"));

const { DEFINITIVE_MODULE_URLS, PDF_ASSIGNMENT_PATHS, MODULE_CATEGORY_MAP } = paths;
const { FOUNDATION_MODULE_TOPICS, deriveTitleFromUrl } = topics;
const { resolveCubeOpenUrl, isPdfModuleUrl, SITE_ORIGIN } = cubeOpen;

test("60 foundation modules with canonical topics", () => {
  assert.equal(DEFINITIVE_MODULE_URLS.length, 60);
  assert.equal(FOUNDATION_MODULE_TOPICS.length, 60);
});

test("every assignment path is a PDF", () => {
  PDF_ASSIGNMENT_PATHS.forEach((url, i) => {
    assert.equal(
      isPdfModuleUrl(url),
      true,
      `assignment ${i + 1} should be PDF: ${url}`
    );
  });
});

test("resolveCubeOpenUrl uses clicked cube URL not loop closure", () => {
  const urls = PDF_ASSIGNMENT_PATHS.slice(0, 3);
  urls.forEach((moduleUrl) => {
    const openUrl = resolveCubeOpenUrl(moduleUrl, SITE_ORIGIN);
    assert.equal(openUrl, SITE_ORIGIN + moduleUrl);
    assert.notEqual(openUrl, SITE_ORIGIN + DEFINITIVE_MODULE_URLS[59]);
  });
});

test("resolveCubeOpenUrl rejects empty input", () => {
  assert.equal(resolveCubeOpenUrl(""), "");
  assert.equal(resolveCubeOpenUrl(null), "");
});

test("topic map matches module paths", () => {
  DEFINITIVE_MODULE_URLS.forEach((moduleUrl, i) => {
    const category = MODULE_CATEGORY_MAP[moduleUrl];
    const isPdf = isPdfModuleUrl(moduleUrl);
    if (i < 45) {
      assert.equal(category, getArticleCategory(i));
      assert.equal(isPdf, false);
    } else {
      assert.equal(category, "assignment");
      assert.equal(isPdf, true);
      const derived = deriveTitleFromUrl(moduleUrl);
      assert.ok(derived.length > 0, `cube ${i + 1} needs hover title`);
    }
  });
});

test("Abstract assignment maps to PDF", () => {
  const abstractUrl = DEFINITIVE_MODULE_URLS[55];
  assert.equal(abstractUrl, "/s/Abstract-photography-Assignment.pdf");
  assert.equal(isPdfModuleUrl(abstractUrl), true);
});

test("wrong assignment identity fails integrity check", () => {
  const wrongBlogUrl = "/blogs/mastering-abstract-photography";
  assert.equal(isPdfModuleUrl(wrongBlogUrl), false);
  assert.throws(() => {
    const category = MODULE_CATEGORY_MAP[wrongBlogUrl];
    if (category !== "assignment" || !isPdfModuleUrl(wrongBlogUrl)) {
      throw new Error("cube 56 style wrong identity");
    }
  });
});

function getArticleCategory(index) {
  if (index < 15) return "camera";
  if (index < 25) return "gear";
  if (index < 35) return "composition";
  return "genre";
}
