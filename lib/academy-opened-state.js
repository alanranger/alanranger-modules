/**
 * Shared opened-path lookup (strip + dashboard + tests).
 * SYNC: academy-dashboard-squarespace-snippet-v1.html, academy-do-next-strip (getOpenedSet)
 */
const { normalizePath } = require("./academy-module-paths");

function isPathOpened(openedMap, canonicalPath) {
  return !!getOpenedEntry(openedMap, canonicalPath);
}

function getOpenedEntry(openedMap, canonicalPath) {
  if (!openedMap || !canonicalPath) return null;
  const target = normalizePath(canonicalPath);
  if (!target) return null;
  if (openedMap[canonicalPath]) return openedMap[canonicalPath];
  if (openedMap[target]) return openedMap[target];
  const keys = Object.keys(openedMap);
  for (let i = 0; i < keys.length; i += 1) {
    if (normalizePath(keys[i]) === target) return openedMap[keys[i]];
  }
  return null;
}

function countPathsOpened(openedMap, pathList) {
  let n = 0;
  pathList.forEach((path) => {
    if (isPathOpened(openedMap, path)) n += 1;
  });
  return n;
}

function buildOpenedPathSet(openedMap, pathList) {
  const set = new Set();
  if (!openedMap || !pathList) return set;
  pathList.forEach((canonical) => {
    if (isPathOpened(openedMap, canonical)) set.add(normalizePath(canonical));
  });
  return set;
}

module.exports = {
  isPathOpened,
  getOpenedEntry,
  countPathsOpened,
  buildOpenedPathSet,
};
