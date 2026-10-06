function parseCentavos(value: string): bigint {
  const trimmed = value.trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(trimmed);
  if (!match) {
    throw new RangeError('Peso amount must be non-negative with at most two decimal places');
  }

  const whole = BigInt(match[1]);
  const fraction = BigInt((match[2] ?? '').padEnd(2, '0') || '0');
  return whole * 100n + fraction;
}

export function pesosToCentavos(value: string): number {
  const centavos = parseCentavos(value);
  if (centavos > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError('Peso amount exceeds the safe integer range');
  }
  return Number(centavos);
}

export function centavosToPesos(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError('Centavos must be a non-negative safe integer');
  }
  const amount = BigInt(value);
  const pesos = amount / 100n;
  const centavos = (amount % 100n).toString().padStart(2, '0');
  return `${pesos}.${centavos}`;
}
