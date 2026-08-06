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

type DateParts = { year: number; month: number; day: number };

function isValidDateParts(year: number, month: number, day: number): boolean {
  const probe = new Date(year, month - 1, day, 12, 0, 0, 0);
  return (
    probe.getFullYear() === year &&
    probe.getMonth() === month - 1 &&
    probe.getDate() === day
  );
}

function datePartsFromGroups(y: string, m: string, d: string): DateParts | null {
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (!isValidDateParts(year, month, day)) return null;
  return { year, month, day };
}

/** YYYY-MM-DD · YYYYMMDD 등 생년월일/날짜 입력 파싱 */
export function parseFlexibleDateInput(input: string): DateParts | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const dashed = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (dashed) return datePartsFromGroups(dashed[1], dashed[2], dashed[3]);

  const compact = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) return datePartsFromGroups(compact[1], compact[2], compact[3]);

  return null;
}

export function formatDateParts(parts: DateParts): string {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

/** 생년월일 입력 → 저장용 YYYY-MM-DD */
export function normalizeBirthDateInput(input: string): string | null {
  const parts = parseFlexibleDateInput(input);
  if (!parts) return null;
  return formatDateParts(parts);
}

/** YYYY-MM-DD → ISO (로컬 정오 기준) */
export function parseDateInputToIso(input: string): string | null {
  const parts = parseFlexibleDateInput(input);
  if (!parts) return null;
  const d = new Date(parts.year, parts.month - 1, parts.day, 12, 0, 0, 0);
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

export function parseBirthDateParts(birthDate?: string): DateParts | null {
  if (!birthDate) return null;
  const fromInput = parseFlexibleDateInput(birthDate);
  if (fromInput) return fromInput;

  const parsed = new Date(birthDate.trim());
  if (Number.isNaN(parsed.getTime())) return null;
  return {
    year: parsed.getFullYear(),
    month: parsed.getMonth() + 1,
    day: parsed.getDate(),
  };
}

/** 생년월일 기준 만 나이 (기준일 미지정 시 오늘) */
export function internationalAge(birthDate?: string, referenceDate: Date = new Date()): number | null {
  const birth = parseBirthDateParts(birthDate);
  if (!birth) return null;

  let age = referenceDate.getFullYear() - birth.year;
  const refMonth = referenceDate.getMonth() + 1;
  const refDay = referenceDate.getDate();
  if (refMonth < birth.month || (refMonth === birth.month && refDay < birth.day)) {
    age -= 1;
  }
  if (age < 0) return null;
  return age;
}

export function formatNameWithAge(
  name: string,
  birthDate?: string,
  referenceDate: Date = new Date(),
): string {
  const age = internationalAge(birthDate, referenceDate);
  if (age == null) return name;
  return `${name} (${age})`;
}
