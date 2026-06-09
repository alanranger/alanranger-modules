/**
 * Foundation module metadata for email merge fields (tile ref, section, canonical title).
 */
const { FOUNDATION_MODULE_PATHS } = require("./academy-module-paths");
const { FOUNDATION_MODULE_TOPICS } = require("./academy-module-topics");

const FOUNDATION_SECTIONS = [
  { start: 0, count: 15, name: "Camera Settings" },
  { start: 15, count: 10, name: "Gear and Accessories" },
  { start: 25, count: 10, name: "Composition Guides" },
  { start: 35, count: 10, name: "Photography Genre Topics" },
  { start: 45, count: 15, name: "Practical Assignments" },
];

function normalizePath(pathOrUrl) {
  if (!pathOrUrl) return "";
  const s = String(pathOrUrl);
  try {
    if (s.startsWith("http")) return new URL(s).pathname.replace(/\/+$/, "") || "/";
  } catch (_) {
    /* fall through */
  }
  return s.startsWith("/") ? s.replace(/\/+$/, "") : `/${s}`.replace(/\/+$/, "");
}

function stripTopicPrefix(topic) {
  return String(topic || "")
    .replace(/^\d+\s+/, "")
    .trim();
}

function sectionForIndex(idx) {
  for (const sec of FOUNDATION_SECTIONS) {
    if (idx >= sec.start && idx < sec.start + sec.count) {
      return {
        name: sec.name,
        positionInSection: idx - sec.start + 1,
      };
    }
  }
  return { name: "", positionInSection: null };
}

function composeNextModuleLabel(ref, title, section) {
  const t = title || "your next module";
  if (ref && section) return `${ref} · ${t} (${section})`;
  if (ref) return `${ref} · ${t}`;
  if (section) return `${t} (${section})`;
  return t;
}

function getFoundationModuleMeta(pathOrUrl) {
  const path = normalizePath(pathOrUrl);
  const idx = FOUNDATION_MODULE_PATHS.indexOf(path);
  if (idx < 0) {
    return {
      ref: "",
      section: "",
      title: "your next module",
      positionInSection: null,
      label: "your next module",
      path,
    };
  }
  const sec = sectionForIndex(idx);
  const ref = `#${String(idx + 1).padStart(2, "0")}`;
  const title = stripTopicPrefix(FOUNDATION_MODULE_TOPICS[idx]) || "your next module";
  const label = composeNextModuleLabel(ref, title, sec.name);
  return {
    ref,
    section: sec.name,
    title,
    positionInSection: sec.positionInSection,
    label,
    path,
  };
}

module.exports = {
  FOUNDATION_SECTIONS,
  getFoundationModuleMeta,
  composeNextModuleLabel,
  normalizePath,
};
