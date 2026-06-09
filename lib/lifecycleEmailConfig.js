// Shared lifecycle email constants — all Academy automated send paths BCC Alan.
const LIFECYCLE_BCC = "info@alanranger.com";

function realPreviewSubjectPrefix(stageKey) {
  return `[REAL-PREVIEW – ${stageKey}]`;
}

module.exports = { LIFECYCLE_BCC, realPreviewSubjectPrefix };
