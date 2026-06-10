/** Read-only badge level pill for admin member tables (from evaluateTableBadge fields). */
export default function BadgeLevelCell({ member, compact = false }) {
  const label = member?.badge_label || 'Enrolled';
  const isMaster = member?.badge_is_master || member?.badge_key === 'master';
  const paused = member?.badge_paused;

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: compact ? '4px' : '6px' }}>
      {isMaster ? (
        <span title="Master" style={{ color: '#fbbf24', fontSize: compact ? '12px' : '14px' }}>★</span>
      ) : null}
      <span style={{ fontWeight: 600, color: 'var(--ar-text)', fontSize: compact ? '12px' : 'inherit' }}>
        {label}
      </span>
      {paused ? (
        <span style={{ fontSize: '11px', color: '#f59e0b' }}>(paused)</span>
      ) : null}
    </span>
  );
}
