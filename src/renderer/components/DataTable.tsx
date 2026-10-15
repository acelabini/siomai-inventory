import type { ReactNode } from 'react';

export type DataColumn<Row> = { key: string; label: string; render: (row: Row) => ReactNode; numeric?: boolean };

export default function DataTable<Row>({ label, columns, rows, rowKey, empty, className = '' }: { label: string; columns: DataColumn<Row>[]; rows: Row[]; rowKey: (row: Row) => string; empty?: ReactNode; className?: string }) {
  return <div className={`data-table-scroll ${className}`.trim()} role="region" aria-label={label} tabIndex={0}>
    <table className="data-table" role="table" aria-label={label}>
      <thead role="rowgroup"><tr role="row">{columns.map((column) => <th key={column.key} role="columnheader" scope="col" className={column.numeric ? 'numeric' : undefined}>{column.label}</th>)}</tr></thead>
      <tbody role="rowgroup">{rows.length ? rows.map((row) => <tr key={rowKey(row)} role="row">{columns.map((column) => <td key={column.key} role="cell" data-label={column.label} className={column.numeric ? 'numeric mono' : undefined}><div className="record-cell-value">{column.render(row)}</div></td>)}</tr>) : <tr role="row"><td role="cell" className="table-empty" colSpan={columns.length}>{empty ?? 'No records for this date.'}</td></tr>}</tbody>
    </table>
  </div>;
}
