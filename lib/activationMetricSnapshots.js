/**
 * Persist activation tile metrics as dated snapshots (baseline + weekly cron).
 * Reuses lib/activationTargetsStats.js so stored values match live tiles exactly.
 */

const {
  PROVISIONAL_TARGETS,
  COHORT_DEFINITION,
  buildActivationTargetsStats,
} = require("./activationTargetsStats");

const PERIODS = ["7d", "30d", "90d", "all"];

const METRIC_SPECS = [
  { statsKey: "week1_modules_3", metricKey: "week1_modules_ge3", targetKey: "week1_modules_3" },
  { statsKey: "week1_logins_5", metricKey: "week1_logins_ge5", targetKey: "week1_logins_5" },
  { statsKey: "week2_active", metricKey: "week2_active", targetKey: "week2_active" },
  { statsKey: "conversion", metricKey: "cohort_conversion", targetKey: "cohort_conversion" },
];

function utcDateString(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function rowsFromStats(stats, snapshotDate, snapshotAt) {
  const rows = [];
  METRIC_SPECS.forEach((spec) => {
    const metric = stats.cohort[spec.statsKey];
    rows.push({
      snapshot_date: snapshotDate,
      snapshot_at: snapshotAt,
      period: stats.period,
      metric_key: spec.metricKey,
      numerator: metric.hit,
      denominator: metric.total,
      pct: metric.pct,
      target_pct: PROVISIONAL_TARGETS[spec.targetKey],
      cohort_definition: COHORT_DEFINITION,
      notes: snapshotDate === "2026-06-05" ? "Pre-intervention baseline freeze" : null,
    });
  });
  return rows;
}

async function buildSnapshotRowsForDate(supabase, snapshotDate, snapshotAt) {
  const allRows = [];
  for (const period of PERIODS) {
    const stats = await buildActivationTargetsStats(supabase, period);
    allRows.push(...rowsFromStats(stats, snapshotDate, snapshotAt));
  }
  return allRows;
}

async function upsertSnapshotRows(supabase, rows) {
  if (!rows.length) return { upserted: 0 };
  const { data, error } = await supabase
    .from("activation_metric_snapshots")
    .upsert(rows, { onConflict: "snapshot_date,period,metric_key" })
    .select("id");
  if (error) throw error;
  return { upserted: (data || []).length };
}

async function writeActivationSnapshots(supabase, opts = {}) {
  const snapshotAt = opts.snapshotAt || new Date().toISOString();
  const snapshotDate = opts.snapshotDate || utcDateString(new Date(snapshotAt));
  const rows = await buildSnapshotRowsForDate(supabase, snapshotDate, snapshotAt);
  const result = await upsertSnapshotRows(supabase, rows);
  return { snapshotDate, snapshotAt, rows, ...result };
}

async function seedBaselineChangeLog(supabase, changeDate = "2026-06-05") {
  const row = {
    change_date: changeDate,
    title: "Baseline frozen - pre-intervention",
    description:
      "Activation metric baseline captured before shipping Next-module button, dashboard do-next strip, and foundation simple-dashboard fixes.",
    commit_ref: null,
    category: "other",
  };
  const { data: existing, error: findError } = await supabase
    .from("activation_change_log")
    .select("id")
    .eq("change_date", changeDate)
    .eq("title", row.title)
    .maybeSingle();
  if (findError) throw findError;
  if (existing) return { seeded: false, row: existing };

  const { data, error } = await supabase
    .from("activation_change_log")
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return { seeded: true, row: data };
}

module.exports = {
  PERIODS,
  METRIC_SPECS,
  buildSnapshotRowsForDate,
  upsertSnapshotRows,
  writeActivationSnapshots,
  seedBaselineChangeLog,
};
