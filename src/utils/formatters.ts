export const fmtNumber = (n: number | null | undefined): string => {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
};

export const fmtCurrency = (
  value: number | string | null | undefined,
  currency: string = 'USD'
) => {
  const amount = Number(value ?? 0);
  const safeCurrency = currency || 'USD';

  if (!currency) {
    console.warn(`[Format] Missing currency code. Falling back to USD for amount ${amount}`);
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: safeCurrency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(amount);
};

export const fmtPercent = (value: number | null | undefined): string => {
  if (value == null) return '—';
  return `${value.toFixed(1)}%`;
};

export const fmtDate = (dateString: string | null | undefined): string => {
  if (!dateString) return '—';
  try {
    return new Date(dateString).toLocaleDateString('en-US');
  } catch {
    return '—';
  }
};
