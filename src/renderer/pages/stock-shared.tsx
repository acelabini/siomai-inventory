import { describePieces } from '../../main/domain/quantities';
import type { CatalogLocation, CatalogProduct } from '../../shared/schemas';

export function formatMoney(centavos: number): string {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(centavos / 100);
}

export function formatMovementTimestamp(timestamp: string): string {
  const isoTimestamp = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(timestamp)
    ? `${timestamp.replace(' ', 'T')}Z`
    : timestamp;
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return new Intl.DateTimeFormat('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    hourCycle: 'h12', timeZone: 'Asia/Manila',
  }).format(date);
}

export function formatQuantity(pieces: number, piecesPerPack: number): string {
  const quantity = describePieces(pieces, piecesPerPack);
  const packLabel = `${quantity.packs} ${quantity.packs === 1 ? 'pack' : 'packs'}`;
  return `${pieces} pc (${packLabel}${quantity.remainingPieces ? ` + ${quantity.remainingPieces} pc` : ''})`;
}

export function LocationSelect({ locations, value, onChange, label = 'Location' }: { locations: CatalogLocation[]; value: string; onChange: (value: string) => void; label?: string }) {
  return <label className="form-field">{label}<select value={value} onChange={(event) => onChange(event.target.value)}>
    {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
  </select></label>;
}

export function ProductSelect({ products, value, onChange, label = 'Product' }: { products: CatalogProduct[]; value: string; onChange: (value: string) => void; label?: string }) {
  return <label className="form-field">{label}<select value={value} onChange={(event) => onChange(event.target.value)}>
    {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
  </select></label>;
}
