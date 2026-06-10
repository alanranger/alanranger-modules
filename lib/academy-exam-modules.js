/**
 * Single source of truth for Academy exam certificate tracks.
 * Foundation (Cert 1) and Composition & Creative (Cert 2).
 * Tracks are first-class — structured for future capstone tracks.
 *
 * SYNC: api/exams/progress.js, academy-dashboard-catalog.js, Squarespace snippets (Stages 2–5).
 */

const SITE = "https://www.alanranger.com";

const FOUNDATION_MODULES = [
  { moduleId: "module-01-exposure", order: 1, name: "Exposure", shortName: "Exposure", articleUrl: `${SITE}/blog-on-photography/what-is-exposure-in-photography` },
  { moduleId: "module-02-aperture", order: 2, name: "Aperture", shortName: "Aperture", articleUrl: `${SITE}/blog-on-photography/what-is-aperture-in-photography` },
  { moduleId: "module-03-shutter", order: 3, name: "Shutter Speed", shortName: "Shutter", articleUrl: `${SITE}/blog-on-photography/what-is-shutter-speed` },
  { moduleId: "module-04-iso", order: 4, name: "ISO", shortName: "ISO", articleUrl: `${SITE}/blog-on-photography/what-is-iso-in-photography` },
  { moduleId: "module-05-manual", order: 5, name: "Manual Exposure", shortName: "Manual", articleUrl: `${SITE}/blog-on-photography/what-is-manual-exposure-in-photography` },
  { moduleId: "module-06-metering", order: 6, name: "Metering", shortName: "Metering", articleUrl: `${SITE}/blog-on-photography/what-is-metering-in-photography` },
  { moduleId: "module-07-bracketing", order: 7, name: "Exposure Bracketing", shortName: "Bracketing", articleUrl: `${SITE}/blog-on-photography/exposure-bracketing-a-guide-for-photographers` },
  { moduleId: "module-08-focusing", order: 8, name: "Focusing", shortName: "Focusing", articleUrl: `${SITE}/blog-on-photography/what-is-focus-in-photography` },
  { moduleId: "module-09-dof", order: 9, name: "Depth of Field", shortName: "DoF", articleUrl: `${SITE}/blog-on-photography/what-is-depth-of-field` },
  { moduleId: "module-10-drange", order: 10, name: "Dynamic Range", shortName: "DRange", articleUrl: `${SITE}/blog-on-photography/what-is-dynamic-range-in-photography` },
  { moduleId: "module-11-wb", order: 11, name: "White Balance", shortName: "WB", articleUrl: `${SITE}/blog-on-photography/what-is-white-balance-in-photography` },
  { moduleId: "module-12-drive", order: 12, name: "Camera Drive Modes", shortName: "Drive", articleUrl: `${SITE}/blog-on-photography/what-are-camera-drive-modes` },
  { moduleId: "module-13-jpeg-raw", order: 13, name: "JPEG vs RAW", shortName: "JPEG/RAW", articleUrl: `${SITE}/blog-on-photography/jpeg-vs-raw-the-key-differences` },
  { moduleId: "module-14-sensors", order: 14, name: "Full Frame vs Crop Sensor", shortName: "Sensors", articleUrl: `${SITE}/blog-on-photography/full-frame-vs-cropped-sensor` },
  { moduleId: "module-15-focal", order: 15, name: "Focal Length", shortName: "Focal", articleUrl: `${SITE}/blog-on-photography/what-is-focal-length-in-photography` },
];

const COMPOSITION_CREATIVE_MODULES = [
  { moduleId: "c2-01-composition-rules", order: 1, name: "Composition Rules", shortName: "Composition Rules", articleUrl: `${SITE}/blog-on-photography/mastering-photography-composition-rules` },
  { moduleId: "c2-02-framing", order: 2, name: "Framing", shortName: "Framing", articleUrl: `${SITE}/blog-on-photography/what-is-framing-in-photography` },
  { moduleId: "c2-03-leading-lines", order: 3, name: "Leading Lines", shortName: "Leading Lines", articleUrl: `${SITE}/blog-on-photography/what-are-leading-lines-in-photography` },
  { moduleId: "c2-04-negative-space", order: 4, name: "Negative Space", shortName: "Negative Space", articleUrl: `${SITE}/blog-on-photography/what-is-negative-space-in-photography` },
  { moduleId: "c2-05-contrast", order: 5, name: "Contrast", shortName: "Contrast", articleUrl: `${SITE}/blog-on-photography/what-is-contrast-in-photography` },
  { moduleId: "c2-06-balance", order: 6, name: "Compositional Balance", shortName: "Balance", articleUrl: `${SITE}/blog-on-photography/finding-your-compositional-balance` },
  { moduleId: "c2-07-macro", order: 7, name: "Macro Photography", shortName: "Macro", articleUrl: `${SITE}/blog-on-photography/art-of-macro-photography` },
  { moduleId: "c2-08-landscape", order: 8, name: "Landscape Photography", shortName: "Landscape", articleUrl: `${SITE}/blog-on-photography/mastering-landscape-photography-tips-and-techniques` },
  { moduleId: "c2-09-product", order: 9, name: "Product Photography Setup", shortName: "Product", articleUrl: `${SITE}/blog-on-photography/product-photography-setup` },
  { moduleId: "c2-10-minimalist", order: 10, name: "Minimalist Photography", shortName: "Minimalist", articleUrl: `${SITE}/blog-on-photography/what-is-minimalist-photography` },
  { moduleId: "c2-11-still-life", order: 11, name: "Still Life Photography", shortName: "Still Life", articleUrl: `${SITE}/blog-on-photography/what-is-still-life-photography` },
  { moduleId: "c2-12-long-exposure", order: 12, name: "Long Exposure Photography", shortName: "Long Exposure", articleUrl: `${SITE}/blog-on-photography/how-to-take-long-exposure-photos` },
  { moduleId: "c2-13-architecture", order: 13, name: "Architecture Photography", shortName: "Architecture", articleUrl: `${SITE}/blog-on-photography/architecture-photography-guide` },
  { moduleId: "c2-14-portrait", order: 14, name: "Portrait Photography", shortName: "Portrait", articleUrl: `${SITE}/blog-on-photography/what-is-portrait-photography` },
  { moduleId: "c2-15-black-white", order: 15, name: "Black & White Photography", shortName: "Black & White", articleUrl: `${SITE}/blog-on-photography/black-and-white-photography-for-beginners` },
];

const EXAM_TRACKS = {
  foundation: {
    key: "foundation",
    label: "Foundation",
    dashboardLabel: "Foundation",
    total: FOUNDATION_MODULES.length,
    passMark: 80,
    theme: "orange",
    examsPageUrl: `${SITE}/academy/photography-exams-certification`,
    jsonBaseUrl: "https://alanranger.github.io/alanranger-modules/modules",
    modules: FOUNDATION_MODULES,
  },
  composition_creative: {
    key: "composition_creative",
    label: "Composition & Creative",
    dashboardLabel: "Composition & Creative",
    total: COMPOSITION_CREATIVE_MODULES.length,
    passMark: 80,
    theme: "gold",
    examsPageUrl: `${SITE}/academy/photography-exams-certification`,
    jsonBaseUrl: "https://alanranger.github.io/alanranger-modules/modules",
    modules: COMPOSITION_CREATIVE_MODULES,
  },
};

const TRACK_ORDER = ["foundation", "composition_creative"];

function getTrack(trackKey) {
  return EXAM_TRACKS[trackKey] || null;
}

function getTrackKeys() {
  return TRACK_ORDER.slice();
}

function getModuleIds(trackKey) {
  const track = getTrack(trackKey);
  return track ? track.modules.map((m) => m.moduleId) : [];
}

function getModule(trackKey, moduleId) {
  const track = getTrack(trackKey);
  if (!track) return null;
  return track.modules.find((m) => m.moduleId === moduleId) || null;
}

function findTrackForModuleId(moduleId) {
  for (const key of TRACK_ORDER) {
    if (getModule(key, moduleId)) return getTrack(key);
  }
  return null;
}

function getTrackTotal(trackKey) {
  const track = getTrack(trackKey);
  return track ? track.total : 0;
}

module.exports = {
  EXAM_TRACKS,
  TRACK_ORDER,
  getTrack,
  getTrackKeys,
  getModuleIds,
  getModule,
  findTrackForModuleId,
  getTrackTotal,
};
