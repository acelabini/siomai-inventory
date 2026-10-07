import type { ReactNode } from 'react';

export type DataColumn<Row> = { key: string; label: string; render: (row: Row) => ReactNode; numeric?: boolean };

export default function DataTable<Row>({ label, columns, rows, rowKey, empty, className = '' }: { label: string; columns: DataColumn<Row>[]; rows: Row[]; rowKey: (row: Row) => string; empty?: ReactNode; className?: string }) {
  return <div className={`data-table-scroll ${className}`.trim()} role="region" aria-label={label} tabIndex={0}>
    <table className="data-table" aria-label={label}>
      <thead><tr>{columns.map((column) => <th key={column.key} scope="col" className={column.numeric ? 'numeric' : undefined}>{column.label}</th>)}</tr></thead>
      <tbody>{rows.length ? rows.map((row) => <tr key={rowKey(row)}>{columns.map((column) => <td key={column.key} className={column.numeric ? 'numeric mono' : undefined}>{column.render(row)}</td>)}</tr>) : <tr><td className="table-empty" colSpan={columns.length}>{empty ?? 'No records for this date.'}</td></tr>}</tbody>
    </table>
  </div>;
}
