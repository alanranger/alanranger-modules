/**
 * Foundation module paths for engagement-summary gate.
 * Re-exports from lib/academy-module-paths.js (single source of truth).
 */

const paths = require("./academy-module-paths");

module.exports = {
  FOUNDATION_MODULE_PATHS: paths.FOUNDATION_MODULE_PATHS,
  FOUNDATION_PATH_SET: paths.FOUNDATION_PATH_SET,
  normalizePath: paths.normalizePath,
  isFoundationPath: paths.isFoundationPath,
};
