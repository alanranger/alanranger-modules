export const HUE_TEST_CONFIG = {
  rows: [
    [
      { id: "r1-1", hex: "#800000", locked: true },
      { id: "r1-2", hex: "#8B0000", locked: false },
      { id: "r1-3", hex: "#B22222", locked: false },
      { id: "r1-4", hex: "#DC143C", locked: false },
      { id: "r1-5", hex: "#FF0000", locked: false },
      { id: "r1-6", hex: "#FF4500", locked: false },
      { id: "r1-7", hex: "#FF8C00", locked: false },
      { id: "r1-8", hex: "#FFD700", locked: true }
    ],
    [
      { id: "r2-1", hex: "#006400", locked: true },
      { id: "r2-2", hex: "#008000", locked: false },
      { id: "r2-3", hex: "#228B22", locked: false },
      { id: "r2-4", hex: "#00FF00", locked: false },
      { id: "r2-5", hex: "#00FA9A", locked: false },
      { id: "r2-6", hex: "#00FF7F", locked: false },
      { id: "r2-7", hex: "#40E0D0", locked: false },
      { id: "r2-8", hex: "#00FFFF", locked: true }
    ],
    [
      { id: "r3-1", hex: "#000080", locked: true },
      { id: "r3-2", hex: "#00008B", locked: false },
      { id: "r3-3", hex: "#0000CD", locked: false },
      { id: "r3-4", hex: "#0000FF", locked: false },
      { id: "r3-5", hex: "#1E90FF", locked: false },
      { id: "r3-6", hex: "#00BFFF", locked: false },
      { id: "r3-7", hex: "#6495ED", locked: false },
      { id: "r3-8", hex: "#87CEFA", locked: true }
    ],
    [
      { id: "r4-1", hex: "#800080", locked: true },
      { id: "r4-2", hex: "#9932CC", locked: false },
      { id: "r4-3", hex: "#BA55D3", locked: false },
      { id: "r4-4", hex: "#FF00FF", locked: false },
      { id: "r4-5", hex: "#FF1493", locked: false },
      { id: "r4-6", hex: "#FF69B4", locked: false },
      { id: "r4-7", hex: "#FFB6C1", locked: false },
      { id: "r4-8", hex: "#FFE4E1", locked: true }
    ]
  ],
  bands: [
    { id: "0-30", start: 0, end: 30 },
    { id: "30-60", start: 30, end: 60 },
    { id: "60-90", start: 60, end: 90 },
    { id: "90-120", start: 90, end: 120 },
    { id: "120-150", start: 120, end: 150 },
    { id: "150-180", start: 150, end: 180 },
    { id: "180-210", start: 180, end: 210 },
    { id: "210-240", start: 210, end: 240 },
    { id: "240-270", start: 240, end: 270 },
    { id: "270-300", start: 270, end: 300 },
    { id: "300-330", start: 300, end: 330 },
    { id: "330-360", start: 330, end: 360 }
  ],
  thresholds: [
    {
      maxScore: 450,
      label: "Excellent",
      detail: "Strong hue ordering with minimal drift."
    },
    {
      maxScore: 900,
      label: "Good",
      detail: "Solid hue perception with a few swaps."
    },
    {
      maxScore: 1500,
      label: "Average",
      detail: "Some hue confusion; retest in different light."
    },
    {
      maxScore: Infinity,
      label: "Needs improvement",
      detail: "Noticeable hue ordering errors across rows."
    }
  ]
};
