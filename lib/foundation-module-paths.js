/**
 * Foundation module paths (articles + practice PDFs) for engagement-summary gate.
 * Keep in sync with FOUNDATION_MODULE_PATHS in academy-do-next-strip-squarespace-snippet-v1.html.
 */

const ARTICLE_MODULE_PATHS = [
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
];

const PRACTICE_MODULE_PATHS = [
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

const FOUNDATION_MODULE_PATHS = [...ARTICLE_MODULE_PATHS, ...PRACTICE_MODULE_PATHS];
const FOUNDATION_PATH_SET = new Set(FOUNDATION_MODULE_PATHS);

function normalizePath(path) {
  if (!path || typeof path !== "string") return "";
  var p = path.trim();
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

module.exports = {
  FOUNDATION_MODULE_PATHS,
  FOUNDATION_PATH_SET,
  normalizePath,
  isFoundationPath,
};
