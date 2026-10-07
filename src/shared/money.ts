/** Multiplies a decimal quantity by a centavo price using exact integer arithmetic. */
export function decimalQuantityPriceCentavos(quantity: number, priceCentavos: number): number {
  if (!Number.isFinite(quantity) || quantity < 0 || !Number.isSafeInteger(priceCentavos) || priceCentavos < 0) {
    throw new RangeError('Quantity and price must be non-negative safe values');
  }
  const match = /^([0-9]+)(?:\.([0-9]*))?(?:e([+-]?[0-9]+))?$/i.exec(quantity.toString());
  if (!match) throw new RangeError('Quantity must be a valid decimal number');
  const fraction = match[2] ?? '';
  const exponent = Number(match[3] ?? '0');
  const scale = fraction.length - exponent;
  let numerator = BigInt(`${match[1]}${fraction}`) * BigInt(priceCentavos);
  let denominator = 1n;
  if (scale < 0) numerator *= 10n ** BigInt(-scale);
  else denominator = 10n ** BigInt(scale);
  const rounded = (numerator + denominator / 2n) / denominator;
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('The amount exceeds the safe integer range');
  return Number(rounded);
}
