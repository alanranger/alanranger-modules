import { useCallback, useMemo, useState } from 'react';

function coalesceSortValue(value) {
  if (value == null || value === '' || value === '—' || value === '-') return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  const s = String(value).trim();
  if (s.endsWith('%')) {
    const pct = parseFloat(s);
    if (Number.isFinite(pct)) return pct;
  }
  const plain = s.replace(/,/g, '');
  if (/^-?\d+(\.\d+)?$/.test(plain)) return Number(plain);
  const t = Date.parse(s);
  if (Number.isFinite(t) && /\d{4}/.test(s)) return t;
  return s.toLowerCase();
}

export function compareSortValues(a, b, dir) {
  const mult = dir === 'desc' ? -1 : 1;
  const av = coalesceSortValue(a);
  const bv = coalesceSortValue(b);
  if (av == null && bv == null) return 0;
  if (av == null) return 1 * mult;
  if (bv == null) return -1 * mult;
  if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv) * mult;
  if (av === bv) return 0;
  return (av < bv ? -1 : 1) * mult;
}

export function sortByColumn(rows, columnKey, dir, getValue) {
  if (!columnKey || !rows?.length) return rows || [];
  const accessor = getValue || ((row) => row[columnKey]);
  return [...rows].sort((a, b) => compareSortValues(accessor(a), accessor(b), dir));
}

export function useTableSort(initialColumn, initialDir = 'asc') {
  const [sortColumn, setSortColumn] = useState(initialColumn || null);
  const [sortDir, setSortDir] = useState(initialDir);

  const handleSort = useCallback((column) => {
    if (sortColumn === column) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDir('asc');
    }
  }, [sortColumn]);

  const sortedRows = useCallback((rows, columns) => {
    if (!sortColumn || !rows?.length) return rows || [];
    const col = columns?.find((c) => c.key === sortColumn);
    const getVal = col?.sortValue || ((row) => row[sortColumn]);
    return sortByColumn(rows, sortColumn, sortDir, getVal);
  }, [sortColumn, sortDir]);

  return { sortColumn, sortDir, handleSort, sortedRows };
}

export function SortableTh({
  column,
  label,
  sortColumn,
  sortDir,
  onSort,
  style,
  title,
  colSpan,
  className = 'ar-sortable-th',
}) {
  const active = sortColumn === column;
  const arrow = active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';
  return (
    <th
      colSpan={colSpan}
      className={className}
      style={style}
      title={title || `Sort by ${label}`}
      onClick={() => onSort(column)}
    >
      {label}{arrow}
    </th>
  );
}

export default function SortableTable({
  columns,
  rows,
  rowKey,
  defaultSort,
  defaultDir = 'desc',
  className = 'ar-admin-table',
  tableStyle,
  wrapperClassName,
  wrapperStyle,
  emptyMessage = 'No rows',
  onRowClick,
  getRowStyle,
}) {
  const firstSortable = defaultSort || columns?.[0]?.key;
  const { sortColumn, sortDir, handleSort, sortedRows } = useTableSort(firstSortable, defaultDir);
  const data = useMemo(
    () => sortedRows(rows, columns),
    [rows, columns, sortedRows]
  );

  const resolveKey = rowKey || ((row, i) => row.key || row.id || row.member_id || row.path || row.week || i);

  const tableEl = (
    <table className={className} style={tableStyle}>
      <thead>
        <tr>
          {columns.map((col) => (
            <SortableTh
              key={col.key}
              column={col.key}
              label={col.label}
              sortColumn={sortColumn}
              sortDir={sortDir}
              onSort={handleSort}
              style={col.thStyle || col.style}
              title={col.title}
            />
          ))}
        </tr>
      </thead>
      <tbody>
        {!data.length ? (
          <tr>
            <td colSpan={columns.length} style={{ color: 'var(--ar-text-muted)', fontSize: 13 }}>
              {emptyMessage}
            </td>
          </tr>
        ) : data.map((row, i) => (
          <tr
            key={resolveKey(row, i)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            style={{
              cursor: onRowClick ? 'pointer' : undefined,
              ...(getRowStyle ? getRowStyle(row) : null),
            }}
          >
            {columns.map((col) => (
              <td key={col.key} style={col.tdStyle || col.style}>
                {col.render ? col.render(row) : (row[col.key] ?? '—')}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );

  if (wrapperClassName || wrapperStyle) {
    return (
      <div className={wrapperClassName} style={wrapperStyle}>
        {tableEl}
      </div>
    );
  }
  return tableEl;
}
