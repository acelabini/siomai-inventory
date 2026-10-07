import { useEffect, useMemo, useState } from 'react';
import type { InventoryApi } from '../../shared/contracts';
import type { CsvImportCommitInput, ImportKind, ImportMapping, ImportPreview, CatalogLocation } from '../../shared/schemas';
import { getInventoryApi } from '../api';

type ChosenFile = { fileName: string; csv: string };
type Column = { key: string; label: string; aliases: string[]; optional?: boolean };

const columns: Record<ImportKind, Column[]> = {
  products: [
    { key: 'sku', label: 'SKU', aliases: ['sku'] }, { key: 'name', label: 'Product name', aliases: ['name', 'product name'] },
    { key: 'piecesPerPack', label: 'Pieces per pack', aliases: ['pieces per pack'] }, { key: 'purchaseCostPerPack', label: 'Purchase cost (PHP)', aliases: ['purchase cost (php)', 'purchase cost per pack (php)', 'cost per pack'] },
    { key: 'sellingPricePerPiece', label: 'Piece price (PHP)', aliases: ['piece price (php)', 'selling price per piece (php)'] }, { key: 'sellingPricePerPack', label: 'Pack price (PHP)', aliases: ['pack price (php)', 'selling price per pack (php)'] },
    { key: 'openingPacks', label: 'Opening packs', aliases: ['opening packs', 'pack quantity'], optional: true },
  ],
  'opening-stock': [
    { key: 'sku', label: 'SKU', aliases: ['sku'], optional: true }, { key: 'name', label: 'Product name', aliases: ['name', 'product', 'product name'], optional: true },
    { key: 'quantity', label: 'Quantity', aliases: ['quantity'] }, { key: 'unit', label: 'Unit', aliases: ['unit'] },
  ],
  'spreadsheet-aggregate': [
    { key: 'name', label: 'Product name', aliases: ['product name', 'product'] }, { key: 'piecesPerPack', label: 'Pieces per pack', aliases: ['pieces per pack'] },
    { key: 'packQuantity', label: 'Opening packs', aliases: ['pack quantity'] }, { key: 'replenishmentQuantity', label: 'Replenishment packs', aliases: ['replenishment quantity'] },
    { key: 'pieces', label: 'Loose opening pieces', aliases: ['pieces'] }, { key: 'totalCost', label: 'Cost per pack (PHP)', aliases: ['total cost'] },
  ],
};

function csvHeaders(csv: string): string[] {
  const firstLine = csv.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] ?? '';
  const headers: string[] = [];
  let value = '', quoted = false;
  for (let i = 0; i < firstLine.length; i += 1) {
    const char = firstLine[i]!;
    if (quoted && char === '"' && firstLine[i + 1] === '"') { value += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { headers.push(value.trim()); value = ''; }
    else value += char;
  }
  headers.push(value.trim());
  return headers.filter(Boolean);
}

function mapByAliases(kind: ImportKind, headers: string[]): ImportMapping {
  const mapping: ImportMapping = {};
  for (const column of columns[kind]) {
    const header = headers.find((candidate) => column.aliases.includes(candidate.trim().toLocaleLowerCase().replaceAll(/\s+/g, ' ')));
    if (header) mapping[column.key] = header;
  }
  return mapping;
}

export default function ImportPage({ api = getInventoryApi(), onComplete, onBack }: { api?: InventoryApi; onComplete: () => void; onBack?: () => void }) {
  const [stage, setStage] = useState(1);
  const [file, setFile] = useState<ChosenFile | null>(null);
  const [kind, setKind] = useState<ImportKind>('products');
  const [mapping, setMapping] = useState<ImportMapping>({});
  const [locations, setLocations] = useState<CatalogLocation[]>([]);
  const [locationId, setLocationId] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [imported, setImported] = useState(0);
  const headers = useMemo(() => file ? csvHeaders(file.csv) : [], [file]);

  useEffect(() => {
    let active = true;
    void api.listLocations().then((items) => { if (active) { setLocations(items); setLocationId((current) => current || items[0]?.id || ''); } }).catch(() => { if (active) setError('Locations could not be loaded.'); });
    return () => { active = false; };
  }, [api]);

  async function chooseFile() {
    setError('');
    try {
      const selected = await api.chooseCsvImportFile();
      if (!selected) return;
      setFile(selected);
      setMapping(mapByAliases(kind, csvHeaders(selected.csv)));
      setPreview(null);
      setStage(2);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The CSV file could not be opened.'); }
  }

  function changeKind(value: ImportKind) {
    setKind(value);
    setMapping(mapByAliases(value, headers));
    setPreview(null);
  }

  async function previewFile() {
    if (!file) return;
    setBusy(true); setError('');
    try {
      const next = await api.previewCsvImport({ csv: file.csv, kind, mapping, ...(needsLocation ? { locationId } : {}) });
      setPreview(next);
      setStage(3);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The CSV could not be validated.'); }
    finally { setBusy(false); }
  }

  async function commitImport() {
    if (!file || !preview || preview.errors.length || preview.validRows === 0) return;
    const input: CsvImportCommitInput = { csv: file.csv, kind, mapping, ...(needsLocation ? { locationId } : {}), token: preview.token, contentHash: preview.contentHash };
    setBusy(true); setError('');
    try {
      const result = await api.commitCsvImport(input);
      setImported(result.importedRows);
      setStage(4);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The import could not be committed. Preview the file again.'); }
    finally { setBusy(false); }
  }

  const currentColumns = columns[kind];
  const needsLocation = kind !== 'products' || !!mapping.openingPacks;
  const fileIssueCount = preview?.errors.filter((item) => item.row === 1).length ?? 0;
  const invalidRowCount = new Set(preview?.errors.filter((item) => item.row > 1).map((item) => item.row) ?? []).size;
  return <section className="catalog-page import-page" aria-labelledby="page-title">
    <div className="page-heading"><div><p className="eyebrow">Settings · CSV import</p><h1 id="page-title">Import data</h1></div>{onBack && <button className="secondary-button" type="button" onClick={onBack}>Back to Settings</button>}</div>
    <ol className="import-stages" aria-label="Import stages"><li aria-current={stage === 1 ? 'step' : undefined}>1 Choose file</li><li aria-current={stage === 2 ? 'step' : undefined}>2 Map columns</li><li aria-current={stage === 3 ? 'step' : undefined}>3 Preview and validate</li><li aria-current={stage === 4 ? 'step' : undefined}>4 Commit</li></ol>
    {error && <p role="alert" className="field-error">{error}</p>}
    {stage === 1 && <section aria-labelledby="choose-file-title"><h2 id="choose-file-title">Choose a CSV file</h2><p>Start with a products, opening stock, or spreadsheet aggregate template.</p><button type="button" className="primary-button" onClick={() => void chooseFile()}>Choose CSV file</button><p className="report-note">Choose a CSV file to begin. Files are checked before anything is added to your ledger.</p></section>}
    {stage === 2 && file && <section aria-labelledby="map-title"><h2 id="map-title">Map columns</h2><p>File: <strong>{file.fileName}</strong></p>
      <label className="form-field compact-field" htmlFor="import-kind">Import type<select id="import-kind" aria-label="Import type" value={kind} onChange={(event) => changeKind(event.target.value as ImportKind)}><option value="products">Products</option><option value="opening-stock">Opening stock</option><option value="spreadsheet-aggregate">Spreadsheet aggregate</option></select></label>
      {needsLocation && <label className="form-field compact-field" htmlFor="import-location">Location<select id="import-location" aria-label="Import location" value={locationId} onChange={(event) => setLocationId(event.target.value)}>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>}
      {kind === 'opening-stock' && <p className="report-note">Map at least one: SKU or product name.</p>}
      <div className="import-mapping-grid">{currentColumns.map((column) => <label className="form-field compact-field" htmlFor={`map-${column.key}`} key={column.key}>{column.label}{column.optional && <small>Optional</small>}<select id={`map-${column.key}`} aria-label={column.label} value={mapping[column.key] ?? ''} onChange={(event) => setMapping((current) => ({ ...current, [column.key]: event.target.value }))}><option value="">{column.optional ? 'Do not import' : 'Choose a column'}</option>{headers.map((header) => <option value={header} key={header}>{header}</option>)}</select></label>)}</div>
      {kind === 'spreadsheet-aggregate' && <p className="report-note" role="note">Aggregate stock values are recorded as opening and replenishment movements. Transaction sales will not be created.</p>}
      <div className="form-actions"><button className="primary-button" type="button" disabled={busy || (needsLocation && !locationId)} onClick={() => void previewFile()}>{busy ? 'Checking…' : 'Preview and validate'}</button></div>
    </section>}
    {stage === 3 && preview && <section aria-labelledby="preview-title"><h2 id="preview-title">Preview and validate</h2>{preview.kind !== 'spreadsheet-aggregate' && <p>{preview.summary}</p>}<dl className="import-preview-counts"><div><dt>Valid rows</dt><dd>{preview.validRows}</dd></div><div><dt>Invalid rows</dt><dd>{invalidRowCount}</dd></div><div><dt>File issues</dt><dd>{fileIssueCount}</dd></div></dl>
      {preview.kind === 'spreadsheet-aggregate' && <p className="report-note" role="note">Imported aggregate stock data. No transaction sales will be created.</p>}
      {fileIssueCount > 0 && <section aria-label="File issues"><h3>File issues</h3><ul className="import-errors">{preview.errors.filter((item) => item.row === 1).map((item, index) => <li key={`file-${index}`}>{item.message}</li>)}</ul></section>}
      {preview.errors.some((item) => item.row > 1) && <section aria-label="Import errors"><h3>Rows to correct</h3><ul className="import-errors">{preview.errors.filter((item) => item.row > 1).map((item, index) => <li key={`${item.row}-${index}`}><strong>Row {item.row}</strong> {item.message}</li>)}</ul></section>}
      <div className="form-actions"><button className="secondary-button" type="button" onClick={() => setStage(2)}>Back to mapping</button><button className="primary-button" type="button" disabled={preview.errors.length > 0 || preview.validRows === 0 || busy} onClick={() => void commitImport()}>{busy ? 'Importing…' : 'Commit import'}</button></div>
    </section>}
    {stage === 4 && <section aria-labelledby="import-complete-title"><p className="eyebrow">Import complete</p><h2 id="import-complete-title">Imported {imported} row{imported === 1 ? '' : 's'}</h2>{kind === 'spreadsheet-aggregate' && <p>Aggregate stock movements were imported. No transaction sales were created.</p>}<button type="button" className="primary-button" onClick={onComplete}>Done</button></section>}
  </section>;
}
