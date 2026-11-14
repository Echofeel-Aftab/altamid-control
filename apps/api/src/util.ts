import { createHash, randomBytes, randomUUID } from 'crypto';

export function id(): string {
  return randomUUID();
}

export function nowSql(date = new Date()): string {
  return date.toISOString().slice(0, 23).replace('T', ' ');
}

export function todayUtc(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function sqlToIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withT = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
  const noFraction = withT.replace(/\.\d+$/, '');
  return noFraction.endsWith('Z') ? noFraction : noFraction + 'Z';
}

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

const KEY_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function randomKeyBody(length = 20): string {
  const bytes = randomBytes(length);
  let out = '';
  for (const byte of bytes) {
    out += KEY_ALPHABET[byte % KEY_ALPHABET.length];
  }
  return out;
}

export function asArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function asObject(value: unknown): Record<string, number> {
  const source = typeof value === 'string' ? safeParse(value) : value;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {};
  const out: Record<string, number> = {};
  for (const [key, item] of Object.entries(source as Record<string, unknown>)) {
    if (typeof item === 'number' && Number.isFinite(item)) out[key] = item;
  }
  return out;
}

export function asJson(value: unknown): unknown {
  if (typeof value === 'string') return safeParse(value);
  return value;
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

export function isDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return !Number.isNaN(Date.parse(value + 'T00:00:00Z'));
}

export function addPeriod(start: string, period: string): string {
  const [year, month, day] = start.split('-').map((part) => Number(part));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (period === 'trial') date.setUTCDate(date.getUTCDate() + 14);
  else if (period === 'monthly') date.setUTCMonth(date.getUTCMonth() + 1);
  else date.setUTCFullYear(date.getUTCFullYear() + 1);
  return date.toISOString().slice(0, 10);
}

export function clampText(value: unknown, max: number): string {
  return String(value ?? '').trim().slice(0, max);
}

export function flag(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}
