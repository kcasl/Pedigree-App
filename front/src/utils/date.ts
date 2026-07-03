export function nowIso(): string {
  return new Date().toISOString();
}

/** ISO → 입력 필드용 YYYY-MM-DD */
export function isoToDateInput(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** YYYY-MM-DD → ISO (로컬 정오 기준) */
export function parseDateInputToIso(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const da = Number(m[3]);
  const d = new Date(y, mo - 1, da, 12, 0, 0, 0);
  if (d.getFullYear() !== y || d.getMonth() !== mo - 1 || d.getDate() !== da) return null;
  return d.toISOString();
}

async function fetchWithTimeout(url: string, ms: number, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** 와이파이 등 네트워크 시간 우선, 실패 시 기기 시간 */
export async function nowIsoFromNetwork(): Promise<string> {
  try {
    const res = await fetchWithTimeout('https://worldtimeapi.org/api/ip', 4500);
    if (res.ok) {
      const data = (await res.json()) as { datetime?: string; utc_datetime?: string };
      const raw = data.datetime ?? data.utc_datetime;
      if (raw) {
        const d = new Date(raw);
        if (!Number.isNaN(d.getTime())) return d.toISOString();
      }
    }
  } catch {
    // fall through
  }

  try {
    const res = await fetchWithTimeout('https://www.google.com/generate_204', 3000, {
      method: 'HEAD',
    });
    const dateHeader = res.headers.get('Date');
    if (dateHeader) {
      const d = new Date(dateHeader);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
  } catch {
    // fall through
  }

  return nowIso();
}

export function formatKoreanDate(isoOrDateString?: string): string {
  if (!isoOrDateString) return '';
  const d = new Date(isoOrDateString);
  if (Number.isNaN(d.getTime())) return isoOrDateString;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}

