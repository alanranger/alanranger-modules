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

function buildInitialRows() {
  return HUE_TEST_CONFIG.rows.map((row) =>
    shuffleRow(row.map((chip) => ({ ...chip })))
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

function enforceLockedPositions(rowIndex, row) {
  const { firstId, lastId } = getLockedIds(rowIndex);
  if (!firstId || !lastId) return row;
  const byId = new Map(row.map((chip) => [chip.id, chip]));
  const middle = row.filter((chip) => chip.id !== firstId && chip.id !== lastId);
  const next = [];
  if (byId.has(firstId)) next.push(byId.get(firstId));
  next.push(...middle);
  if (byId.has(lastId)) next.push(byId.get(lastId));
  return next;
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
  const [rows, setRows] = useState(buildInitialRows);
  const [results, setResults] = useState(null);
  const [memberId, setMemberId] = useState(null);
  const [saveStatus, setSaveStatus] = useState("idle");
  const [dragState, setDragState] = useState(null);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const rowRefs = useRef([]);

  useEffect(() => {
    if (!dragState) return undefined;
    const handleMove = (event) => {
      setDragPos({ x: event.clientX, y: event.clientY });
      const rowIndex = dragState.rowIndex;
      const rowEl = rowRefs.current[rowIndex];
      if (!rowEl) return;
      const items = Array.from(
        rowEl.querySelectorAll(".hue-chip, .hue-placeholder")
      );
      if (!items.length) return;
      const targetIndex = items.findIndex((el) => {
        const rect = el.getBoundingClientRect();
        return event.clientX < rect.left + rect.width / 2;
      });
      const unclamped = targetIndex === -1 ? items.length : targetIndex;
      const minIndex = 1;
      const maxIndex = Math.max(1, items.length - 1);
      const newIndex = Math.min(Math.max(unclamped, minIndex), maxIndex);
      if (newIndex !== dragState.placeholderIndex) {
        setDragState((prev) =>
          prev ? { ...prev, placeholderIndex: newIndex } : prev
        );
      }
    };

    const handleUp = () => {
      setRows((prev) => {
        const row = dragState.originalRow;
        const without = row.filter((chip) => chip.id !== dragState.chip.id);
        const nextRow = [...without];
        nextRow.splice(dragState.placeholderIndex, 0, dragState.chip);
        const updated = [...prev];
        updated[dragState.rowIndex] = enforceLockedPositions(
          dragState.rowIndex,
          nextRow
        );
        return updated;
      });
      setDragState(null);
      document.body.style.userSelect = "";
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

  const rowOrders = useMemo(
    () => rows.map((row) => row.map((chip) => chip.id)),
    [rows]
  );

  const chartValues = useMemo(() => {
    if (!results?.bandErrors) return null;
    return results.bandErrors.map((value) => Math.max(0, 100 - value));
  }, [results]);

  async function handleScore() {
    const scoring = scoreHueTest(rows, HUE_TEST_CONFIG.bands);
    const interpretation = getInterpretation(scoring.totalScore);
    setResults({
      ...scoring,
      interpretation
    });

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
    setRows(buildInitialRows());
    setResults(null);
    setSaveStatus("idle");
    setDragState(null);
  }

  function handlePointerDown(event, rowIndex, chip) {
    if (chip.locked || chip.placeholder) return;
    event.preventDefault();
    if (event.currentTarget?.setPointerCapture) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    document.body.style.userSelect = "none";
    const row = rows[rowIndex];
    const chipIndex = row.findIndex((item) => item.id === chip.id);
    setDragState({
      rowIndex,
      chip,
      placeholderId: createPlaceholder(rowIndex).id,
      placeholderIndex: chipIndex,
      originalRow: [...row]
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
          {rows.map((row, rowIndex) => (
            <div key={row[0]?.id || `row-${rowIndex}`} className={styles.rowGroup}>
              <div className={styles.rowTitle}>
                Row {rowIndex + 1}: {HUE_TEST_CONFIG.rowLabels?.[rowIndex]}
              </div>
              <div
                className={styles.row}
                ref={(el) => {
                  rowRefs.current[rowIndex] = el;
                }}
              >
                {(dragState && dragState.rowIndex === rowIndex
                  ? (() => {
                      const without = dragState.originalRow.filter(
                        (item) => item.id !== dragState.chip.id
                      );
                      const placeholder = createPlaceholder(rowIndex);
                      const nextRow = [...without];
                      nextRow.splice(dragState.placeholderIndex, 0, placeholder);
                      return nextRow;
                    })()
                  : row
                ).map((chip) =>
                  chip.placeholder ? (
                    <div
                      key={chip.id}
                      className={`${styles.placeholder} hue-placeholder`}
                      data-placeholder="true"
                      aria-hidden="true"
                    />
                  ) : (
                    <div
                      key={chip.id}
                      className={`hue-chip ${
                        chip.locked ? "hue-chip--locked" : ""
                      } ${styles.chip} ${chip.locked ? styles.chipLocked : ""}`}
                      data-chip-id={chip.id}
                    >
                      <div
                        className={`${styles.chipSwatch} hue-chip__swatch`}
                        style={{ backgroundColor: chip.hex }}
                        onPointerDown={(event) =>
                          handlePointerDown(event, rowIndex, chip)
                        }
                      />
                      <div className={styles.chipLabel}>
                        {chip.locked ? "Locked" : "Drag"}
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          ))}
        </div>

        <div className={styles.buttonRow}>
          <button className={styles.primaryButton} onClick={handleScore}>
            Score my test
          </button>
          <button className={styles.ghostButton} onClick={handleReset}>
            Reset
          </button>
        </div>

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
              style={{ backgroundColor: dragState.chip.hex }}
            />
          </div>
        )}
      </div>
    </section>
  );
}
