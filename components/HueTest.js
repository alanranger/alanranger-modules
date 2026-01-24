import { useEffect, useMemo, useRef, useState } from "react";
import styles from "../styles/HueTest.module.css";
import { HUE_TEST_CONFIG } from "../lib/hueTestConfig";
import { scoreHueTest } from "../lib/hueTestScoring";

function shuffleRow(row) {
  if (row.length <= 2) return row;
  const middle = row.slice(1, -1);
  const shuffled = [...middle].sort(() => Math.random() - 0.5);
  return [row[0], ...shuffled, row.at(-1)];
}

const CHIP_META = new Map(
  HUE_TEST_CONFIG.rows.flatMap((row, rowIndex) =>
    row.map((chip, orderIndex) => [
      chip.id,
      {
        chip,
        rowIndex,
        orderIndex,
        style: { backgroundColor: chip.hex }
      }
    ])
  )
);

const SHOW_TILE_NUMBERS = false;
const SHOW_DEBUG_LOG = false;

function getChipMeta(id) {
  return CHIP_META.get(id);
}

function buildInitialRowIds() {
  return HUE_TEST_CONFIG.rows.map((row) =>
    shuffleRow(row.map((chip) => chip.id))
  );
}

function normalizeOrder(orderIds, rowConfig) {
  const firstId = rowConfig[0].id;
  const lastId = rowConfig.at(-1).id;
  const filtered = orderIds.filter((id) => id !== firstId && id !== lastId);
  return [firstId, ...filtered, lastId];
}

function reorderRow(rowConfig, orderIds) {
  const byId = new Map(rowConfig.map((chip) => [chip.id, chip]));
  return orderIds.map((id) => byId.get(id)).filter(Boolean);
}

function getInterpretation(totalScore) {
  const found = HUE_TEST_CONFIG.thresholds.find(
    (threshold) => totalScore <= threshold.maxScore
  );
  return found || HUE_TEST_CONFIG.thresholds.at(-1);
}

function createPlaceholder(rowIndex) {
  return { id: `placeholder-${rowIndex}`, placeholder: true, locked: true };
}

function getLockedIds(rowIndex) {
  const rowConfig = HUE_TEST_CONFIG.rows[rowIndex] || [];
  return {
    firstId: rowConfig[0]?.id,
    lastId: rowConfig.at(-1)?.id
  };
}

function enforceLockedOrder(rowIndex, orderIds, byId) {
  const { firstId, lastId } = getLockedIds(rowIndex);
  if (!firstId || !lastId) return orderIds;
  const filtered = orderIds.filter((id) => id !== firstId && id !== lastId);
  const normalized = [firstId, ...filtered, lastId];
  return normalized.filter((id) => byId.has(id));
}

function enforceLockedPositionsById(rowIndex, rowIds) {
  const { firstId, lastId } = getLockedIds(rowIndex);
  if (!firstId || !lastId) return rowIds;
  const middle = rowIds.filter((id) => id !== firstId && id !== lastId);
  return [firstId, ...middle, lastId];
}

function moveIdToIndex(rowIds, chipId, targetIndex) {
  const without = rowIds.filter((id) => id !== chipId);
  const next = [...without];
  next.splice(targetIndex, 0, chipId);
  return next;
}

function computeDropIndex(rowEl, clientX, totalItems) {
  if (!rowEl) return null;
  const style = getComputedStyle(rowEl);
  const chipSize =
    Number.parseFloat(style.getPropertyValue("--chip-size")) || 64;
  const gap = Number.parseFloat(style.columnGap || style.gap || "0") || 0;
  const paddingLeft = Number.parseFloat(style.paddingLeft || "0") || 0;
  const unit = chipSize + gap;
  const rowRect = rowEl.getBoundingClientRect();
  const relativeX = clientX - rowRect.left - paddingLeft + rowEl.scrollLeft;
  const rawIndex = Math.floor((relativeX + chipSize / 2) / unit);
  const unclamped = Number.isFinite(rawIndex) ? rawIndex : 0;
  const minIndex = 1;
  const maxIndex = Math.max(1, totalItems - 2);
  return Math.min(Math.max(unclamped, minIndex), maxIndex);
}

function getDropIndexFromDom(rowEl, clientX, clientY, totalItems) {
  if (!rowEl || typeof document === "undefined") return null;
  const target = document.elementFromPoint(clientX, clientY);
  if (!target) return null;
  const itemEl = target.closest(".hue-chip, .hue-placeholder");
  if (!itemEl || !rowEl.contains(itemEl)) return null;
  const children = Array.from(rowEl.children);
  const index = children.indexOf(itemEl);
  if (index < 0) return null;
  const minIndex = 1;
  const maxIndex = Math.max(1, totalItems - 2);
  return Math.min(Math.max(index, minIndex), maxIndex);
}

function getRowDomSnapshot(rowEl) {
  if (!rowEl) return [];
  const chips = rowEl.querySelectorAll(".hue-chip");
  return Array.from(chips).map((chipEl) => {
    const swatch = chipEl.querySelector(".hue-chip__swatch");
    const chipId = chipEl.getAttribute("data-chip-id");
    const dataHex = swatch?.dataset?.hex || null;
    const styleHex = swatch?.style?.backgroundColor || null;
    return {
      id: chipId,
      dataHex,
      styleHex
    };
  });
}

function buildPreviewRow(rowIds, dragState, rowIndex) {
  if (!dragState || dragState.rowIndex !== rowIndex || !dragState.hasMoved) {
    return rowIds;
  }
  const source = dragState.originalRowIds || rowIds;
  const without = source.filter((id) => id !== dragState.chipId);
  const next = [...without];
  next.splice(dragState.placeholderIndex, 0, createPlaceholder(rowIndex));
  return next;
}

function getChipSnapshot(rowIds) {
  return rowIds
    .map((id) => {
      const chip = getChipMeta(id)?.chip;
      if (!chip) return null;
      return {
        id,
        hex: chip.hex,
        hue: chip.hue
      };
    })
    .filter(Boolean);
}

function HueRadarChart({ values, bands }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !Array.isArray(values)) return;
    const safeBands = Array.isArray(bands) ? bands : [];
    const size = 320;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = size;
    canvas.height = size;
    const center = size / 2;
    const padding = 32;
    const radius = center - padding;
    ctx.clearRect(0, 0, size, size);

    const bandCount = values.length || 12;
    const wedgeAngle = (Math.PI * 2) / bandCount;
    const maxWedgeRadius = radius + 18;
    for (let i = 0; i < bandCount; i += 1) {
      const startAngle = i * wedgeAngle - Math.PI / 2;
      const endAngle = startAngle + wedgeAngle;
      const midHue =
        safeBands[i]?.start !== undefined && safeBands[i]?.end !== undefined
          ? (safeBands[i].start + safeBands[i].end) / 2
          : (i * 360) / bandCount;
      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.arc(center, center, maxWedgeRadius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = `hsla(${midHue}, 70%, 50%, 0.12)`;
      ctx.fill();
    }

    ctx.strokeStyle = "rgba(148, 163, 184, 0.25)";
    ctx.lineWidth = 1;
    for (let ring = 1; ring <= 4; ring += 1) {
      ctx.beginPath();
      ctx.arc(center, center, (radius / 4) * ring, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let i = 0; i < bandCount; i += 1) {
      const angle = (i / bandCount) * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.lineTo(
        center + radius * Math.cos(angle),
        center + radius * Math.sin(angle)
      );
      ctx.stroke();
    }

    ctx.fillStyle = "rgba(251, 191, 36, 0.15)";
    ctx.strokeStyle = "rgba(251, 191, 36, 0.8)";
    ctx.beginPath();
    values.forEach((value, idx) => {
      const angle = (idx / bandCount) * Math.PI * 2 - Math.PI / 2;
      const pointRadius = (radius * Math.min(100, Math.max(0, value))) / 100;
      const x = center + pointRadius * Math.cos(angle);
      const y = center + pointRadius * Math.sin(angle);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "rgba(226, 232, 240, 0.8)";
    ctx.font = "11px sans-serif";
    for (let i = 0; i < bandCount; i += 1) {
      const angle = (i / bandCount) * Math.PI * 2 - Math.PI / 2;
      const labelHue =
        safeBands[i]?.start !== undefined && safeBands[i]?.end !== undefined
          ? Math.round((safeBands[i].start + safeBands[i].end) / 2)
          : Math.round((i * 360) / bandCount);
      const labelRadius = maxWedgeRadius + 8;
      const x = center + labelRadius * Math.cos(angle);
      const y = center + labelRadius * Math.sin(angle);
      ctx.fillText(`${labelHue}°`, x - 8, y + 4);
    }
  }, [values, bands]);

  return <canvas ref={canvasRef} className={styles.chartCanvas} />;
}

export default function HueTest({ embed = false }) {
  const [rows, setRows] = useState(buildInitialRowIds);
  const [results, setResults] = useState(null);
  const [memberId, setMemberId] = useState(null);
  const [saveStatus, setSaveStatus] = useState("idle");
  const [dragState, setDragState] = useState(null);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [debugLogs, setDebugLogs] = useState([]);
  const [copyStatus, setCopyStatus] = useState("idle");
  const [renderEpoch, setRenderEpoch] = useState(0);
  const [highlightId, setHighlightId] = useState(null);
  const [hasScored, setHasScored] = useState(false);
  const rowRefs = useRef([]);
  const lastPointer = useRef({ x: 0, y: 0 });
  const pendingDomLog = useRef(null);
  const highlightTimer = useRef(null);

  useEffect(() => {
    if (!dragState) return undefined;
    const handleMove = (event) => {
      lastPointer.current = { x: event.clientX, y: event.clientY };
      setDragPos({ x: event.clientX, y: event.clientY });
      if (dragState.startPos) {
        const dx = event.clientX - dragState.startPos.x;
        const dy = event.clientY - dragState.startPos.y;
        if (Math.hypot(dx, dy) < 12) {
          return;
        }
        if (!dragState.hasMoved) {
          setDragState((prev) => (prev ? { ...prev, hasMoved: true } : prev));
        }
      }
      const rowIndex = dragState.rowIndex;
      const rowEl = rowRefs.current[rowIndex];
      const totalItems = dragState.originalRowIds.length;
      const newIndex =
        getDropIndexFromDom(rowEl, event.clientX, event.clientY, totalItems) ??
        computeDropIndex(rowEl, event.clientX, totalItems);
      if (newIndex === null) return;
      if (newIndex !== dragState.placeholderIndex) {
        setDragState((prev) =>
          prev
            ? {
                ...prev,
                placeholderIndex: newIndex,
                hasMoved: true
              }
            : prev
        );
      }
    };

    const handleUp = () => {
      const rowEl = rowRefs.current[dragState.rowIndex];
      const totalItems = dragState.originalRowIds.length;
      const finalIndex =
        getDropIndexFromDom(
          rowEl,
          lastPointer.current.x,
          lastPointer.current.y,
          totalItems
        ) ??
        computeDropIndex(rowEl, lastPointer.current.x, totalItems) ??
        dragState.placeholderIndex;
      if (!dragState.hasMoved || finalIndex === dragState.startIndex) {
        if (dragState?.startSnapshot) {
          setDebugLogs((prev) => [
            {
              type: "click",
              time: new Date().toISOString(),
              before: dragState.startSnapshot,
              after: null
            },
            ...prev
          ]);
        }
        setDragState(null);
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
        return;
      }
      pendingDomLog.current = {
        rowIndex: dragState.rowIndex,
        chipId: dragState.chipId,
        before: getRowDomSnapshot(rowEl)
      };
      setRows((prev) => {
        const lockedRowIds = enforceLockedPositionsById(
          dragState.rowIndex,
          moveIdToIndex(
            prev[dragState.rowIndex] || [],
            dragState.chipId,
            finalIndex
          )
        );
        const updated = [...prev];
        updated[dragState.rowIndex] = lockedRowIds;
        if (dragState?.startSnapshot) {
          setDebugLogs((prevLogs) => [
            {
              type: "move",
              time: new Date().toISOString(),
              before: dragState.startSnapshot,
              after: {
                rowIndex: dragState.rowIndex,
                chipId: dragState.chipId,
                rowIds: lockedRowIds,
                tiles: getChipSnapshot(lockedRowIds)
              }
            },
            ...prevLogs
          ]);
        }
        return updated;
      });
      setHighlightId(dragState.chipId);
      if (highlightTimer.current) {
        clearTimeout(highlightTimer.current);
      }
      highlightTimer.current = setTimeout(() => {
        setHighlightId(null);
        highlightTimer.current = null;
      }, 1200);
      setRenderEpoch((prev) => prev + 1);
      setDragState(null);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [dragState]);

  useEffect(() => {
    let cancelled = false;
    async function loadMember() {
      if (typeof globalThis === "undefined") return;
      const w = globalThis.window;
      if (!w) return;
      const start = Date.now();
      while (!w.$memberstackDom && Date.now() - start < 5000) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      if (
        !w.$memberstackDom ||
        typeof w.$memberstackDom.getCurrentMember !== "function"
      ) {
        return;
      }
      try {
        const res = await w.$memberstackDom.getCurrentMember();
        const data = res?.data || res;
        if (!cancelled && data?.id) setMemberId(data.id);
      } catch (error) {
        console.warn("[HueTest] Member lookup failed", error);
      }
    }
    loadMember();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!pendingDomLog.current) return;
    const pending = pendingDomLog.current;
    const rowEl = rowRefs.current[pending.rowIndex];
    const after = getRowDomSnapshot(rowEl);
    setDebugLogs((prev) => [
      {
        type: "dom",
        time: new Date().toISOString(),
        rowIndex: pending.rowIndex,
        chipId: pending.chipId,
        before: pending.before,
        after
      },
      ...prev
    ]);
    pendingDomLog.current = null;
  }, [rows]);

  useEffect(() => {
    return () => {
      if (highlightTimer.current) {
        clearTimeout(highlightTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const nodes = document.querySelectorAll(".hue-chip__swatch[data-hex]");
    nodes.forEach((node) => {
      const hex = node.getAttribute("data-hex");
      if (!hex) return;
      if (node.style.backgroundColor !== hex) {
        node.style.backgroundColor = hex;
        node.style.backgroundImage = "none";
      }
    });
  }, [rows, dragState]);

  const rowOrders = useMemo(() => rows, [rows]);

  const chartValues = useMemo(() => {
    if (!results?.bandErrors) return null;
    return results.bandErrors.map((value) => Math.max(0, 100 - value));
  }, [results]);

  async function handleScore() {
    if (hasScored) return;
    const scoringRows = rows.map((rowIds) =>
      rowIds.map((id) => getChipMeta(id)?.chip).filter(Boolean)
    );
    const scoring = scoreHueTest(scoringRows, HUE_TEST_CONFIG.bands);
    const interpretation = getInterpretation(scoring.totalScore);
    setResults({
      ...scoring,
      interpretation
    });
    setHasScored(true);

    if (!memberId) {
      setSaveStatus("not-logged-in");
      return;
    }

    setSaveStatus("saving");
    try {
      const payload = {
        member_id: memberId,
        source: "academy",
        total_score: scoring.totalScore,
        row_scores: scoring.rowScores,
        band_errors: scoring.bandErrors,
        row_orders: rowOrders
      };
      const res = await fetch("/api/hue-test/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error("Save failed");
      setSaveStatus("saved");
    } catch (error) {
      console.error("[HueTest] Save error", error);
      setSaveStatus("error");
    }
  }

  function handleReset() {
    setRows(buildInitialRowIds());
    setResults(null);
    setSaveStatus("idle");
    setDragState(null);
    setDebugLogs([]);
    setHighlightId(null);
    setHasScored(false);
    if (highlightTimer.current) {
      clearTimeout(highlightTimer.current);
      highlightTimer.current = null;
    }
    setRenderEpoch((prev) => prev + 1);
  }

  async function handleCopyLogs() {
    if (!debugLogs.length) {
      setCopyStatus("empty");
      setTimeout(() => setCopyStatus("idle"), 1200);
      return;
    }
    const payload = JSON.stringify(debugLogs, null, 2);
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = payload;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopyStatus("copied");
    } catch (error) {
      console.error("[HueTest] Copy failed", error);
      setCopyStatus("error");
    } finally {
      setTimeout(() => setCopyStatus("idle"), 1500);
    }
  }

  function handlePointerDown(event, rowIndex, chipId) {
    const chip = getChipMeta(chipId)?.chip;
    if (!chip || chip.locked) return;
    event.preventDefault();
    if (event.currentTarget?.setPointerCapture) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
    const rowIds = rows[rowIndex] || [];
    const chipIndex = rowIds.findIndex((id) => id === chipId);
    setDragState({
      rowIndex,
      chipId,
      placeholderId: createPlaceholder(rowIndex).id,
      placeholderIndex: chipIndex,
      originalRowIds: [...rowIds],
      startIndex: chipIndex,
      startPos: { x: event.clientX, y: event.clientY },
      hasMoved: false,
      startSnapshot: {
        rowIndex,
        chipId,
        rowIds: [...rowIds],
        tiles: getChipSnapshot(rowIds)
      }
    });
    setDragPos({ x: event.clientX, y: event.clientY });
  }

  return (
    <section className={`${styles.page} ${embed ? styles.embed : ""}`}>
      <div className={styles.container}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.headerTitle}>Hue Test</h1>
            <p className={styles.headerSubtitle}>
              Arrange each row from left (start) to right (end).
            </p>
          </div>
        </div>

        <div className={styles.instructions}>
          <p>Drag the colour chips to arrange by hue.</p>
          <p>First and last chip in each row are fixed.</p>
          <p>Complete all four rows, then click Score.</p>
          <p>Results depend on your screen/brightness.</p>
        </div>

        <div className={styles.testArea}>
          {rows.map((rowIds, rowIndex) => (
            <div key={`row-${rowIndex}`} className={styles.rowGroup}>
              <div className={styles.rowTitle}>
                Row {rowIndex + 1}: {HUE_TEST_CONFIG.rowLabels?.[rowIndex]}
              </div>
              <div
                className={styles.row}
                ref={(el) => {
                  rowRefs.current[rowIndex] = el;
                }}
              >
                {buildPreviewRow(rowIds, dragState, rowIndex).map((item) =>
                  item?.placeholder ? (
                    <div
                      key={item.id}
                      className={`${styles.placeholder} hue-placeholder`}
                      data-placeholder="true"
                      aria-hidden="true"
                    />
                  ) : (
                    (() => {
                      const chipMeta = getChipMeta(item);
                      const chip = chipMeta?.chip;
                      if (!chip) return null;
                      return (
                    <div
                      key={`${chip.id}-${renderEpoch}`}
                      className={`hue-chip ${
                        chip.locked ? "hue-chip--locked" : ""
                      } ${styles.chip} ${chip.locked ? styles.chipLocked : ""} ${
                        highlightId === chip.id ? styles.chipHighlight : ""
                      }`}
                      data-chip-id={chip.id}
                    >
                      <div
                        className={`${styles.chipSwatch} hue-chip__swatch`}
                        style={chipMeta?.style}
                        data-hex={chip.hex}
                        data-hue={chip.hue}
                        onPointerDown={(event) =>
                          handlePointerDown(event, rowIndex, chip.id)
                        }
                      >
                        {SHOW_TILE_NUMBERS && (
                          <span className={styles.chipIndex}>
                            {(getChipMeta(chip.id)?.orderIndex ?? 0) + 1}
                          </span>
                        )}
                      </div>
                      <div className={styles.chipLabel}>
                        {chip.locked ? "Locked" : "Drag"}
                      </div>
                    </div>
                      );
                    })()
                  )
                )}
              </div>
            </div>
          ))}
        </div>

        <div className={styles.buttonRow}>
          <button
            className={styles.primaryButton}
            onClick={handleScore}
            disabled={hasScored}
            aria-disabled={hasScored}
            title={
              hasScored
                ? "You need to reset before scoring again."
                : "Score my test"
            }
          >
            Score my test
          </button>
          <button className={styles.ghostButton} onClick={handleReset}>
            Reset
          </button>
        </div>

        {SHOW_DEBUG_LOG && (
          <div className={styles.debugPanel}>
            <div className={styles.debugHeader}>
              <strong>Debug log</strong>
              <div className={styles.debugActions}>
                <button
                  type="button"
                  className={styles.debugCopy}
                  onClick={handleCopyLogs}
                >
                  {copyStatus === "copied"
                    ? "Copied"
                    : copyStatus === "empty"
                      ? "No logs"
                      : copyStatus === "error"
                        ? "Copy failed"
                        : "Copy log"}
                </button>
                <button
                  type="button"
                  className={styles.debugClear}
                  onClick={() => setDebugLogs([])}
                >
                  Clear
                </button>
              </div>
            </div>
            {debugLogs.length === 0 ? (
              <div className={styles.debugEmpty}>No events yet.</div>
            ) : (
              <ul className={styles.debugList}>
                {debugLogs.slice(0, 8).map((entry) => (
                  <li
                    key={`${entry.time}-${entry.type}`}
                    className={styles.debugItem}
                  >
                    <div className={styles.debugLine}>
                      <span>{entry.type.toUpperCase()}</span>
                      <span>{entry.time}</span>
                    </div>
                    <div className={styles.debugBlock}>
                      <div className={styles.debugLabel}>Before</div>
                      <pre>{JSON.stringify(entry.before, null, 2)}</pre>
                    </div>
                    {entry.after && (
                      <div className={styles.debugBlock}>
                        <div className={styles.debugLabel}>After</div>
                        <pre>{JSON.stringify(entry.after, null, 2)}</pre>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {results && (
          <div className={styles.results}>
            <div className={styles.resultsHeader}>
              <div>
                <div className={styles.scoreLabel}>Total score</div>
                <div className={styles.scoreValue}>{results.totalScore}</div>
              </div>
              <div className={styles.interpretation}>
                <strong>{results.interpretation.label}:</strong>{" "}
                {results.interpretation.detail}
              </div>
            </div>

            <div className={styles.rowScores}>
              {results.rowScores.map((score, index) => (
                <div
                  key={HUE_TEST_CONFIG.rows[index]?.[0]?.id || `row-score-${score}`}
                  className={styles.rowScoreCard}
                >
                  <strong>Row {index + 1}</strong>
                  <span className={styles.rowScoreLabel}>
                    {HUE_TEST_CONFIG.rowLabels?.[index]}
                  </span>
                  <span className={styles.rowScoreValue}>{score} / 100</span>
                </div>
              ))}
            </div>

            <div className={styles.chartSection}>
              <HueRadarChart values={chartValues} bands={HUE_TEST_CONFIG.bands} />
              <div className={styles.chartNotes}>
                Higher values are better. Each spoke represents a 30° hue band.
                The filled area shows your hue ordering accuracy.
                <div className={styles.rowLegend}>
                  {HUE_TEST_CONFIG.rowLabels?.map((label) => (
                    <div key={`row-legend-${label}`} className={styles.rowLegendItem}>
                      <span className={styles.rowLegendDot} />
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className={styles.saveStatus}>
              {saveStatus === "saving" && "Saving to your dashboard..."}
              {saveStatus === "saved" && "Saved to your dashboard."}
              {saveStatus === "error" &&
                "Could not save right now. Try again later."}
              {saveStatus === "not-logged-in" && (
                <>
                  Sign in to save your score —{" "}
                  <a href="/academy/login">go to login</a>
                </>
              )}
            </div>
          </div>
        )}
        {dragState && (
          <div
            className={styles.dragPreview}
            style={{
              transform: `translate(${dragPos.x - 32}px, ${dragPos.y - 32}px)`
            }}
            aria-hidden="true"
          >
            <div
              className={styles.dragPreviewSwatch}
              style={{
                ...(getChipMeta(dragState.chipId)?.style || {})
              }}
            />
          </div>
        )}
      </div>
    </section>
  );
}
