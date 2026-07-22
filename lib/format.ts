export function formatAtomic(value: string | bigint, decimals = 18, maxFraction = 2): string {
  const raw = BigInt(value);
  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  const fraction = raw % base;
  const fractionText = fraction.toString().padStart(decimals, '0').slice(0, maxFraction).replace(/0+$/, '');
  return `${whole.toLocaleString()}${fractionText ? `.${fractionText}` : ''}`;
}

export function compactNumber(value: number): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}
