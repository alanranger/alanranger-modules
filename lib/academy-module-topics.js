/**
 * Canonical topic labels for all 60 foundation modules (cube hover titles).
 * SYNC: academy-do-next-strip-squarespace-snippet-v1.html ARTICLE_MODULES titles
 */

const ASSIGNMENT_TOPICS = [
  "Depth Of Field",
  "Movement",
  "Triptych",
  "Minimalism",
  "Dice Roll",
  "Portraits",
  "Landscapes",
  "Close Up Or Macro",
  "Still Life",
  "Street",
  "Abstract",
  "Black White",
  "Architecture",
  "Shadows",
  "Seasons",
];

/** Short labels Alan uses on the course page (topic -> URL audit cross-check). */
const ASSIGNMENT_SHORT_LABELS = ASSIGNMENT_TOPICS;

const ARTICLE_TOPICS = [
  "01 What Is Exposure In Photography",
  "02 What Is Aperture In Photography",
  "03 What Is Shutter Speed",
  "04 What Is Iso In Photography",
  "05 What Is Manual Exposure In Photography",
  "06 What Is Metering In Photography",
  "07 Exposure Bracketing A Guide For Photographers",
  "08 What Is Focus In Photography",
  "09 What Is Depth Of Field",
  "10 What Is Dynamic Range In Photography",
  "11 What Is White Balance In Photography",
  "12 What Are Camera Drive Modes",
  "13 Jpeg Vs Raw The Key Differences",
  "14 Full Frame Vs Cropped Sensor",
  "15 What Is Focal Length In Photography",
  "16 Tripod For Cameras Essential Guide",
  "17 Are Camera Uv Filters Worth It",
  "18 10 Basic Camera Settings For Camera",
  "19 Camera Sensor Cleaning Guide",
  "20 Best Camera Bags For Different Trips",
  "21 What Do Camera Lens Filters Do",
  "22 Camera Lenses Hire Or Buy",
  "23 Are Mirrorless Cameras Better Than Dslrs",
  "24 Photo Editing Software",
  "25 7 Essential Camera Accessories",
  "26 Mastering Photography Composition Rules",
  "27 What Is Framing In Photography",
  "28 The Art Of Storytelling Photography",
  "29 What Are Leading Lines In Photography",
  "30 What Is Negative Space In Photography",
  "31 What Is Contrast In Photography",
  "32 Finding Your Compositional Balance",
  "33 Photography Is An Art Of Observation",
  "34 How To Improve Your Photography Composition",
  "35 How To Find Your Photography Style",
  "36 Art Of Macro Photography",
  "37 Mastering Landscape Photography Tips And Techniques",
  "38 Product Photography Setup",
  "39 What Is Minimalist Photography",
  "40 What Is Still Life Photography",
  "41 How To Take Long Exposure Photos",
  "42 Architecture Photography Guide",
  "43 What Is Portrait Photography",
  "44 Black And White Photography For Beginners",
  "45 Street Photography Tips",
];

const FOUNDATION_MODULE_TOPICS = [...ARTICLE_TOPICS, ...ASSIGNMENT_TOPICS];

function deriveTitleFromUrl(moduleUrl) {
  if (!moduleUrl || typeof moduleUrl !== "string") return "";
  const parts = moduleUrl.split("/").filter(Boolean);
  const lastPart = parts[parts.length - 1] || "";
  if (lastPart.endsWith(".pdf")) {
    return lastPart
      .replace(/-/g, " ")
      .replace(/\.pdf$/i, "")
      .replace(/\b\w/g, (l) => l.toUpperCase());
  }
  return lastPart.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

module.exports = {
  ARTICLE_TOPICS,
  ASSIGNMENT_TOPICS,
  ASSIGNMENT_SHORT_LABELS,
  FOUNDATION_MODULE_TOPICS,
  deriveTitleFromUrl,
};
