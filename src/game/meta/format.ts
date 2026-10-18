const SUFFIXES = [
  '',
  'K',
  'M',
  'B',
  'T',
  'Qa',
  'Qi',
  'Sx',
  'Sp',
  'Oc',
  'No',
  'Dc',
  'Ud',
  'Dd',
];

export function formatNumber(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return '∞';
  const sign = value < 0 ? '-' : '';
  let n = Math.abs(value);
  if (n < 1000) {
    if (Number.isInteger(n)) return sign + String(n);
    if (n < 10) return sign + n.toFixed(decimals);
    if (n < 100) return sign + n.toFixed(1).replace(/\.0$/, '');
    return sign + n.toFixed(0);
  }
  let tier = 0;
  while (n >= 1000 && tier < SUFFIXES.length - 1) {
    n /= 1000;
    tier++;
  }
  const digits = n >= 100 ? 0 : n >= 10 ? 1 : decimals;
  return `${sign}${n.toFixed(digits).replace(/\.0$/, '')}${SUFFIXES[tier]}`;
}

export function formatFullNumber(value: number): string {
  if (!Number.isFinite(value)) return '∞';
  return Math.floor(value).toLocaleString('en-US');
}

export function formatPercent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits).replace(/\.0$/, '')}%`;
}

export function formatMultiplier(value: number): string {
  if (value >= 100) return `×${formatNumber(value)}`;
  return `×${value.toFixed(2).replace(/\.?0+$/, '')}`;
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatDurationLong(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  if (total < 60) return `${total} 秒`;
  const m = Math.floor(total / 60);
  if (m < 60) return `${m} 分 ${total % 60} 秒`;
  const h = Math.floor(m / 60);
  return `${h} 小时 ${m % 60} 分`;
}

export function formatRate(perSecond: number): string {
  const perMinute = perSecond * 60;
  if (perMinute < 0.1) return `${(perSecond * 3600).toFixed(1)} / 时`;
  return `${formatNumber(perMinute, 1)} / 分`;
}

export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(
    date.getDate(),
  ).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`;
}

export function timeAgo(timestamp: number): string {
  const diff = Math.max(0, Date.now() - timestamp);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return '刚刚';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

export function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}
