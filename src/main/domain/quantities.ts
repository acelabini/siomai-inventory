export type QuantityDisplay = {
  packs: number;
  remainingPieces: number;
};

function assertPositiveSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive safe integer`);
  }
}

function decimalFraction(value: number): { numerator: bigint; denominator: bigint } {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError('Quantity must be a positive finite number');
  }

  const match = /^([0-9]+)(?:\.([0-9]*))?(?:e([+-]?[0-9]+))?$/i.exec(value.toString());
  if (!match) {
    throw new RangeError('Quantity must be a valid decimal number');
  }

  const fraction = match[2] ?? '';
  const exponent = Number(match[3] ?? '0');
  let scale = fraction.length - exponent;
  let numerator = BigInt(`${match[1]}${fraction}`);

  if (scale < 0) {
    numerator *= 10n ** BigInt(-scale);
    scale = 0;
  }
  if (scale > 100) {
    throw new RangeError('Quantity is too precise to convert safely');
  }

  return { numerator, denominator: 10n ** BigInt(scale) };
}

export function toPieces(
  quantity: number,
  unit: 'piece' | 'pack',
  piecesPerPack: number,
): number {
  assertPositiveSafeInteger(piecesPerPack, 'Pieces per pack');
  if (unit !== 'piece' && unit !== 'pack') {
    throw new RangeError('Unit must be piece or pack');
  }

  const { numerator, denominator } = decimalFraction(quantity);
  const pieceNumerator = unit === 'pack' ? numerator * BigInt(piecesPerPack) : numerator;
  if (pieceNumerator % denominator !== 0n) {
    throw new RangeError('Quantity must convert to a whole piece');
  }

  const pieces = pieceNumerator / denominator;
  if (pieces > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError('Piece quantity exceeds the safe integer range');
  }
  return Number(pieces);
}

export function describePieces(pieces: number, piecesPerPack: number): QuantityDisplay {
  assertPositiveSafeInteger(piecesPerPack, 'Pieces per pack');
  if (!Number.isSafeInteger(pieces) || pieces < 0) {
    throw new RangeError('Pieces must be a non-negative safe integer');
  }

  return {
    packs: Math.floor(pieces / piecesPerPack),
    remainingPieces: pieces % piecesPerPack,
  };
}
