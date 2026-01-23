const ROW_SPECS = [
  {
    id: "r1",
    hueStart: 10,
    hueEnd: 80,
    L: 0.74,
    C: 0.16,
    label: "Hue 10–80 (orange range)"
  },
  {
    id: "r2",
    hueStart: 95,
    hueEnd: 165,
    L: 0.74,
    C: 0.16,
    label: "Hue 95–165 (green range)"
  },
  {
    id: "r3",
    hueStart: 180,
    hueEnd: 250,
    L: 0.74,
    C: 0.16,
    label: "Hue 180–250 (cyan/blue range)"
  },
  {
    id: "r4",
    hueStart: 270,
    hueEnd: 340,
    L: 0.74,
    C: 0.16,
    label: "Hue 270–340 (purple/magenta)"
  }
];

const HUE_JITTER = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function linearToSrgb(value) {
  if (value <= 0.0031308) return 12.92 * value;
  return 1.055 * Math.pow(value, 1 / 2.4) - 0.055;
}

function oklchToRgb({ L, C, h }) {
  const hueRad = (h * Math.PI) / 180;
  const a = C * Math.cos(hueRad);
  const b = C * Math.sin(hueRad);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  const rLinear = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const gLinear = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bLinear = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  return {
    r: clamp01(linearToSrgb(rLinear)),
    g: clamp01(linearToSrgb(gLinear)),
    b: clamp01(linearToSrgb(bLinear))
  };
}

function rgbToHex({ r, g, b }) {
  const toHex = (v) => {
    const n = Math.round(v * 255);
    return n.toString(16).padStart(2, "0");
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function easeMiddle(t) {
  return 0.5 + 0.5 * Math.sin((t - 0.5) * Math.PI);
}

function buildRow(spec, rowIndex) {
  const count = 10;
  return Array.from({ length: count }, (_, idx) => {
    const t = idx / (count - 1);
    const eased = easeMiddle(t);
    const hue =
      (spec.hueStart +
        (spec.hueEnd - spec.hueStart) * eased +
        HUE_JITTER[idx]) %
      360;
    const hex = rgbToHex(oklchToRgb({ L: spec.L, C: spec.C, h: hue }));
    return {
      id: `${spec.id}-${idx + 1}`,
      hex,
      locked: idx === 0 || idx === count - 1
    };
  });
}

export const HUE_TEST_CONFIG = {
  rows: ROW_SPECS.map((spec, idx) => buildRow(spec, idx)),
  rowLabels: ROW_SPECS.map((spec) => spec.label),
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
