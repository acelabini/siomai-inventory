import { describePieces } from '../../main/domain/quantities';
import type { CatalogLocation, CatalogProduct } from '../../shared/schemas';

const currencyFormatter = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });
const pesoIntegerFormatter = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 0 });

export function formatMoney(centavos: number): string {
  if (Number.isSafeInteger(centavos)) {
    const amount = BigInt(centavos);
    const magnitude = amount < 0n ? -amount : amount;
    const parts = currencyFormatter.formatToParts(amount < 0n ? -1n : 1n);
    const wholePesos = pesoIntegerFormatter.format(magnitude / 100n);
    const fractionalCentavos = (magnitude % 100n).toString().padStart(2, '0');
    return parts.map((part) => part.type === 'integer' ? wholePesos
      : part.type === 'group' ? ''
        : part.type === 'fraction' ? fractionalCentavos : part.value).join('');
  }
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(centavos / 100);
}

export function proratedCentavos(packCostCentavos: number, quantityPieces: number, piecesPerPack: number): number {
  if (!Number.isSafeInteger(packCostCentavos) || packCostCentavos < 0
    || !Number.isSafeInteger(quantityPieces) || !Number.isSafeInteger(piecesPerPack) || piecesPerPack <= 0) {
    throw new RangeError('Stock value inputs must be safe whole numbers.');
  }
  const signedNumerator = BigInt(packCostCentavos) * BigInt(quantityPieces);
  const denominator = BigInt(piecesPerPack);
  const magnitude = signedNumerator < 0n ? -signedNumerator : signedNumerator;
  const roundedMagnitude = (magnitude + denominator / 2n) / denominator;
  const rounded = signedNumerator < 0n ? -roundedMagnitude : roundedMagnitude;
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER) || rounded < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError('Stock value exceeds the safe integer range.');
  }
  return Number(rounded);
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
