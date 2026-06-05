/**
 * Single source of truth for Academy module / practice-pack / assignment paths.
 * SYNC: academy-do-next-strip-squarespace-snippet-v1.html (FOUNDATION_MODULE_PATHS slices)
 * SYNC: academy-dashboard-squarespace-snippet-v1.html (DEFINITIVE_MODULE_URLS, PRACTICE_PACK_URLS)
 */

const DEFINITIVE_MODULE_URLS = [
  "/blog-on-photography/what-is-exposure-in-photography",
  "/blog-on-photography/what-is-aperture-in-photography",
  "/blog-on-photography/what-is-shutter-speed",
  "/blog-on-photography/what-is-iso-in-photography",
  "/blog-on-photography/what-is-manual-exposure-in-photography",
  "/blog-on-photography/what-is-metering-in-photography",
  "/blog-on-photography/exposure-bracketing-a-guide-for-photographers",
  "/blog-on-photography/what-is-focus-in-photography",
  "/blog-on-photography/what-is-depth-of-field",
  "/blog-on-photography/what-is-dynamic-range-in-photography",
  "/blog-on-photography/what-is-white-balance-in-photography",
  "/blog-on-photography/what-are-camera-drive-modes",
  "/blog-on-photography/jpeg-vs-raw-the-key-differences",
  "/blog-on-photography/full-frame-vs-cropped-sensor",
  "/blog-on-photography/what-is-focal-length-in-photography",
  "/blog-on-photography/tripod-for-cameras-essential-guide",
  "/blog-on-photography/are-camera-uv-filters-worth-it",
  "/blog-on-photography/10-basic-camera-settings-for-camera",
  "/blog-on-photography/camera-sensor-cleaning-guide",
  "/blog-on-photography/best-camera-bags-for-different-trips",
  "/blog-on-photography/what-do-camera-lens-filters-do",
  "/blog-on-photography/camera-lenses-hire-or-buy",
  "/blog-on-photography/are-mirrorless-cameras-better-than-dslrs",
  "/blog-on-photography/photo-editing-software",
  "/blog-on-photography/7-essential-camera-accessories",
  "/blog-on-photography/mastering-photography-composition-rules",
  "/blog-on-photography/what-is-framing-in-photography",
  "/blog-on-photography/the-art-of-storytelling-photography",
  "/blog-on-photography/what-are-leading-lines-in-photography",
  "/blog-on-photography/what-is-negative-space-in-photography",
  "/blog-on-photography/what-is-contrast-in-photography",
  "/blog-on-photography/finding-your-compositional-balance",
  "/blog-on-photography/photography-is-an-art-of-observation",
  "/blog-on-photography/how-to-improve-your-photography-composition",
  "/blog-on-photography/how-to-find-your-photography-style",
  "/blog-on-photography/art-of-macro-photography",
  "/blog-on-photography/mastering-landscape-photography-tips-and-techniques",
  "/blog-on-photography/product-photography-setup",
  "/blog-on-photography/what-is-minimalist-photography",
  "/blog-on-photography/what-is-still-life-photography",
  "/blog-on-photography/how-to-take-long-exposure-photos",
  "/blog-on-photography/architecture-photography-guide",
  "/blog-on-photography/what-is-portrait-photography",
  "/blog-on-photography/black-and-white-photography-for-beginners",
  "/blog-on-photography/street-photography-tips",
  "/s/Photography-Practice-Assignment-depth-of-field.pdf",
  "/s/Photography-Practice-Assignment-Movement-hp37.pdf",
  "/s/Photography-Practice-Assignment-Triptych.pdf",
  "/s/Photography-Practice-Assignment-MINIMALISM.pdf",
  "/s/Photography-Practice-Assignment-Dice-Roll.pdf",
  "/s/Photography-Practice-Assignment-PORTRAITS.pdf",
  "/s/Photography-Practice-Assignment-LANDSCAPES.pdf",
  "/s/CLOSE-UP-OR-MACRO-photography-assignment.pdf",
  "/s/Still-life-photography-assignment.pdf",
  "/s/Street-photography-assignment.pdf",
  "/blogs/mastering-abstract-photography",
  "/s/Black-and-white-photography-assignment.pdf",
  "/s/Architecture-photography-assignment.pdf",
  "/s/Shadows-photography-Assignment.pdf",
  "/s/THE-SEASONS-photography-Assignment.pdf",
];

const MODULE_CATEGORY_MAP = {
  "/blog-on-photography/what-is-exposure-in-photography": "camera",
  "/blog-on-photography/what-is-aperture-in-photography": "camera",
  "/blog-on-photography/what-is-shutter-speed": "camera",
  "/blog-on-photography/what-is-iso-in-photography": "camera",
  "/blog-on-photography/what-is-manual-exposure-in-photography": "camera",
  "/blog-on-photography/what-is-metering-in-photography": "camera",
  "/blog-on-photography/exposure-bracketing-a-guide-for-photographers": "camera",
  "/blog-on-photography/what-is-focus-in-photography": "camera",
  "/blog-on-photography/what-is-depth-of-field": "camera",
  "/blog-on-photography/what-is-dynamic-range-in-photography": "camera",
  "/blog-on-photography/what-is-white-balance-in-photography": "camera",
  "/blog-on-photography/what-are-camera-drive-modes": "camera",
  "/blog-on-photography/jpeg-vs-raw-the-key-differences": "camera",
  "/blog-on-photography/full-frame-vs-cropped-sensor": "camera",
  "/blog-on-photography/what-is-focal-length-in-photography": "camera",
  "/blog-on-photography/tripod-for-cameras-essential-guide": "gear",
  "/blog-on-photography/are-camera-uv-filters-worth-it": "gear",
  "/blog-on-photography/10-basic-camera-settings-for-camera": "gear",
  "/blog-on-photography/camera-sensor-cleaning-guide": "gear",
  "/blog-on-photography/best-camera-bags-for-different-trips": "gear",
  "/blog-on-photography/what-do-camera-lens-filters-do": "gear",
  "/blog-on-photography/camera-lenses-hire-or-buy": "gear",
  "/blog-on-photography/are-mirrorless-cameras-better-than-dslrs": "gear",
  "/blog-on-photography/photo-editing-software": "gear",
  "/blog-on-photography/7-essential-camera-accessories": "gear",
  "/blog-on-photography/mastering-photography-composition-rules": "composition",
  "/blog-on-photography/what-is-framing-in-photography": "composition",
  "/blog-on-photography/the-art-of-storytelling-photography": "composition",
  "/blog-on-photography/what-are-leading-lines-in-photography": "composition",
  "/blog-on-photography/what-is-negative-space-in-photography": "composition",
  "/blog-on-photography/what-is-contrast-in-photography": "composition",
  "/blog-on-photography/finding-your-compositional-balance": "composition",
  "/blog-on-photography/photography-is-an-art-of-observation": "composition",
  "/blog-on-photography/how-to-improve-your-photography-composition": "composition",
  "/blog-on-photography/how-to-find-your-photography-style": "composition",
  "/blog-on-photography/art-of-macro-photography": "genre",
  "/blog-on-photography/mastering-landscape-photography-tips-and-techniques": "genre",
  "/blog-on-photography/product-photography-setup": "genre",
  "/blog-on-photography/what-is-minimalist-photography": "genre",
  "/blog-on-photography/what-is-still-life-photography": "genre",
  "/blog-on-photography/how-to-take-long-exposure-photos": "genre",
  "/blog-on-photography/architecture-photography-guide": "genre",
  "/blog-on-photography/what-is-portrait-photography": "genre",
  "/blog-on-photography/black-and-white-photography-for-beginners": "genre",
  "/blog-on-photography/street-photography-tips": "genre",
  "/s/Photography-Practice-Assignment-depth-of-field.pdf": "assignment",
  "/s/Photography-Practice-Assignment-Movement-hp37.pdf": "assignment",
  "/s/Photography-Practice-Assignment-Triptych.pdf": "assignment",
  "/s/Photography-Practice-Assignment-MINIMALISM.pdf": "assignment",
  "/s/Photography-Practice-Assignment-Dice-Roll.pdf": "assignment",
  "/s/Photography-Practice-Assignment-PORTRAITS.pdf": "assignment",
  "/s/Photography-Practice-Assignment-LANDSCAPES.pdf": "assignment",
  "/s/CLOSE-UP-OR-MACRO-photography-assignment.pdf": "assignment",
  "/s/Still-life-photography-assignment.pdf": "assignment",
  "/s/Street-photography-assignment.pdf": "assignment",
  "/blogs/mastering-abstract-photography": "assignment",
  "/s/Black-and-white-photography-assignment.pdf": "assignment",
  "/s/Architecture-photography-assignment.pdf": "assignment",
  "/s/Shadows-photography-Assignment.pdf": "assignment",
  "/s/THE-SEASONS-photography-Assignment.pdf": "assignment",
};

const PRACTICE_PACK_URLS = [
  "/blog-on-photography/handheld-vs-tripod-stability-photography-assignment",
  "/blog-on-photography/filters-mastery-nd-gnd-photography",
  "/blog-on-photography/histogram-and-exposure-review",
  "/blog-on-photography/white-balance-and-colour-photography",
  "/blog-on-photography/focus-modes-and-tracking",
  "/blog-on-photography/light-metering-modes-practice-photography-assignment",
  "/blog-on-photography/iso-and-noise-control-practice-assignment",
  "/blog-on-photography/shutter-speed-and-motion-photography-practice-assignment",
  "/blog-on-photography/aperture-and-depth-of-field-assignment",
  "/blog-on-photography/exposure-triangle-mastery-photography-practice-assignment",
  "/blog-on-photography/movement-and-intentional-blur-photography-assignment",
  "/blog-on-photography/dice-roll-serendipity-awareness-photography-assignment",
  "/blog-on-photography/lines-shapes-and-geometry-photography-assignment",
  "/blog-on-photography/patterns-rhythm-and-repetition-photography-assignment",
  "/blog-on-photography/colour-theory-in-photography-practise-assignment",
  "/blog-on-photography/storytelling-narrative-photography-assignment",
  "/blog-on-photography/shadows-and-contrast-photography-practice-assignment",
  "/blog-on-photography/abstract-photography-practice-assignment-free-lesson",
  "/blog-on-photography/minimalism-photography-assignment",
  "/blog-on-photography/visual-weight-and-flow-practice-assignment",
  "/blog-on-photography/wildlife-photography-practice-assignment-free-lesson",
  "/blog-on-photography/triptych-project-photography-assignment-free-lesson",
  "/blog-on-photography/landscapes-photography-practise-assignment",
  "/blog-on-photography/closeup-macro-photography-practice-assignment",
  "/blog-on-photography/seasons-nature-photography-assignment",
  "/blog-on-photography/architecture-photography-practice-assignment",
  "/blog-on-photography/still-life-photography-practice-assignment",
  "/blog-on-photography/street-photography-practice-assignment",
  "/blog-on-photography/portrait-photography-practice-assignment",
  "/blog-on-photography/black-and-white-photography-practise-assignment",
];

const CAMERA_MODULE_PATHS = DEFINITIVE_MODULE_URLS.slice(0, 15);
const COMPOSITION_MODULE_PATHS = DEFINITIVE_MODULE_URLS.slice(25, 35);
const PDF_ASSIGNMENT_PATHS = DEFINITIVE_MODULE_URLS.slice(45, 60);
const ARTICLE_MODULE_PATHS = DEFINITIVE_MODULE_URLS.slice(0, 45);
const FOUNDATION_MODULE_PATHS = [...DEFINITIVE_MODULE_URLS];
const FOUNDATION_PATH_SET = new Set(FOUNDATION_MODULE_PATHS);

function normalizePath(path) {
  if (!path || typeof path !== "string") return "";
  let p = path.trim();
  if (!p) return "";
  if (p.indexOf("http") === 0) {
    try {
      p = new URL(p).pathname;
    } catch (e) {
      return "";
    }
  }
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p;
}

function isFoundationPath(path) {
  return FOUNDATION_PATH_SET.has(normalizePath(path));
}

function countOpenedInList(openedSet, paths) {
  let n = 0;
  paths.forEach((path) => {
    if (openedSet.has(path)) n += 1;
  });
  return n;
}

module.exports = {
  DEFINITIVE_MODULE_URLS,
  MODULE_CATEGORY_MAP,
  PRACTICE_PACK_URLS,
  CAMERA_MODULE_PATHS,
  COMPOSITION_MODULE_PATHS,
  PDF_ASSIGNMENT_PATHS,
  ARTICLE_MODULE_PATHS,
  FOUNDATION_MODULE_PATHS,
  FOUNDATION_PATH_SET,
  normalizePath,
  isFoundationPath,
  countOpenedInList,
};
