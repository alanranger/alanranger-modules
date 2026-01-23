const MAX_HUE_DISTANCE = 180;

function hexToRgb(hex) {
  if (!hex || typeof hex !== "string") return null;
  const clean = hex.replace("#", "").trim();
  if (clean.length !== 6) return null;
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  if ([r, g, b].some((v) => Number.isNaN(v))) return null;
  return { r, g, b };
}

function rgbToHue(rgb) {
  if (!rgb) return 0;
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return 0;
  let hue;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  hue = Math.round(hue * 60);
  if (hue < 0) hue += 360;
  return hue;
}

function circularDistance(a, b) {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function shortestDelta(start, end) {
  let delta = (end - start) % 360;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta;
}

function expectedHue(startHue, endHue, index, total) {
  if (total <= 1) return startHue;
  const step = shortestDelta(startHue, endHue) / (total - 1);
  const hue = (startHue + step * index) % 360;
  return hue < 0 ? hue + 360 : hue;
}

function getHueFromHex(hex) {
  return rgbToHue(hexToRgb(hex));
}

function scoreRow(rowChips) {
  const total = rowChips.length;
  const startHue = getHueFromHex(rowChips[0].hex);
  const endHue = getHueFromHex(rowChips[total - 1].hex);
  let score = 0;
  const chipErrors = [];
  for (let i = 0; i < total; i += 1) {
    const expected = expectedHue(startHue, endHue, i, total);
    const actual = getHueFromHex(rowChips[i].hex);
    const error = circularDistance(actual, expected);
    score += error;
    chipErrors.push({
      id: rowChips[i].id,
      hue: actual,
      error
    });
  }
  return { score, chipErrors };
}

function getBandIndex(hue, bands) {
  const normalized = hue >= 360 ? hue % 360 : hue;
  for (let i = 0; i < bands.length; i += 1) {
    const band = bands[i];
    const start = band.start;
    const end = band.end;
    if (normalized >= start && (normalized < end || (end === 360 && normalized <= 360))) {
      return i;
    }
  }
  return 0;
}

export function scoreHueTest(rows, bands) {
  const bandErrorsRaw = new Array(bands.length).fill(0);
  const bandCounts = new Array(bands.length).fill(0);
  const rowScores = [];
  let totalScore = 0;

  rows.forEach((row) => {
    const { score, chipErrors } = scoreRow(row);
    const roundedScore = Math.round(score);
    rowScores.push(roundedScore);
    totalScore += roundedScore;
    chipErrors.forEach((chip) => {
      const bandIndex = getBandIndex(chip.hue, bands);
      bandErrorsRaw[bandIndex] += chip.error;
      bandCounts[bandIndex] += 1;
    });
  });

  const bandErrors = bandErrorsRaw.map((value, idx) => {
    const maxForBand = bandCounts[idx] * MAX_HUE_DISTANCE;
    if (!maxForBand) return 0;
    return Math.min(100, Math.round((value / maxForBand) * 100));
  });

  return {
    totalScore: Math.round(totalScore),
    rowScores,
    bandErrors
  };
}
