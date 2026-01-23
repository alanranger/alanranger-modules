export const HUE_TEST_CONFIG = {
  rows: [
    [
      { id: "r1-1", hex: "#d7263d", locked: true },
      { id: "r1-2", hex: "#e63e2e", locked: false },
      { id: "r1-3", hex: "#f46036", locked: false },
      { id: "r1-4", hex: "#f4845f", locked: false },
      { id: "r1-5", hex: "#f7b267", locked: false },
      { id: "r1-6", hex: "#f9c74f", locked: false },
      { id: "r1-7", hex: "#f9d65c", locked: false },
      { id: "r1-8", hex: "#f7e27e", locked: true }
    ],
    [
      { id: "r2-1", hex: "#b7efc5", locked: true },
      { id: "r2-2", hex: "#80ed99", locked: false },
      { id: "r2-3", hex: "#57cc99", locked: false },
      { id: "r2-4", hex: "#38a3a5", locked: false },
      { id: "r2-5", hex: "#168aad", locked: false },
      { id: "r2-6", hex: "#1a759f", locked: false },
      { id: "r2-7", hex: "#1e6091", locked: false },
      { id: "r2-8", hex: "#184e77", locked: true }
    ],
    [
      { id: "r3-1", hex: "#00b4d8", locked: true },
      { id: "r3-2", hex: "#0096c7", locked: false },
      { id: "r3-3", hex: "#0077b6", locked: false },
      { id: "r3-4", hex: "#023e8a", locked: false },
      { id: "r3-5", hex: "#3a0ca3", locked: false },
      { id: "r3-6", hex: "#5a189a", locked: false },
      { id: "r3-7", hex: "#7209b7", locked: false },
      { id: "r3-8", hex: "#8e2de2", locked: true }
    ],
    [
      { id: "r4-1", hex: "#8e2de2", locked: true },
      { id: "r4-2", hex: "#b5179e", locked: false },
      { id: "r4-3", hex: "#c9184a", locked: false },
      { id: "r4-4", hex: "#d00000", locked: false },
      { id: "r4-5", hex: "#e63946", locked: false },
      { id: "r4-6", hex: "#ef233c", locked: false },
      { id: "r4-7", hex: "#f25757", locked: false },
      { id: "r4-8", hex: "#d7263d", locked: true }
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
