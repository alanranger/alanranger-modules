// Shared lifecycle email constants — all Academy automated send paths BCC Alan.
const LIFECYCLE_BCC = "info@alanranger.com";
const DASHBOARD_URL = "https://www.alanranger.com/academy/dashboard";
const MODULE_MAP_URL = "https://www.alanranger.com/academy/online-photography-course/";

function realPreviewSubjectPrefix(stageKey) {
  return `[REAL-PREVIEW – ${stageKey}]`;
}

module.exports = { LIFECYCLE_BCC, DASHBOARD_URL, MODULE_MAP_URL, realPreviewSubjectPrefix };
