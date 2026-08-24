import { parseBirthDateParts } from './date';
import type { FamilyDirectoryEntry } from './familyDirectory';

export type AnniversaryEntry = FamilyDirectoryEntry & {
  daysUntil: number;
  turningAge: number | null;
  isToday: boolean;
  birthLabel: string;
};

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** 올해 생일이 지났으면 내년 생일까지 남은 일수. 오늘이면 0. */
export function daysUntilNextBirthday(month: number, day: number, referenceDate: Date): number {
  const today = startOfDay(referenceDate);
  let next = new Date(today.getFullYear(), month - 1, day);
  if (next.getMonth() !== month - 1) {
    next = new Date(today.getFullYear(), month - 1, 28);
  }
  if (next < today) {
    next = new Date(today.getFullYear() + 1, month - 1, day);
    if (next.getMonth() !== month - 1) {
      next = new Date(today.getFullYear() + 1, month - 1, 28);
    }
  }
  return Math.round((next.getTime() - today.getTime()) / 86_400_000);
}

export function buildAnniversaryList(
  entries: FamilyDirectoryEntry[],
  referenceDate: Date = new Date(),
): AnniversaryEntry[] {
  const out: AnniversaryEntry[] = [];

  for (const entry of entries) {
    const parts = parseBirthDateParts(entry.person.birthDate);
    if (!parts) continue;

    const daysUntil = daysUntilNextBirthday(parts.month, parts.day, referenceDate);
    const today = startOfDay(referenceDate);
    let next = new Date(today.getFullYear(), parts.month - 1, parts.day);
    if (next.getMonth() !== parts.month - 1) {
      next = new Date(today.getFullYear(), parts.month - 1, 28);
    }
    if (next < today) {
      next = new Date(today.getFullYear() + 1, parts.month - 1, parts.day);
      if (next.getMonth() !== parts.month - 1) {
        next = new Date(today.getFullYear() + 1, parts.month - 1, 28);
      }
    }
    const turningAge = Math.max(0, next.getFullYear() - parts.year);

    out.push({
      ...entry,
      daysUntil,
      turningAge,
      isToday: daysUntil === 0,
      birthLabel: `${parts.month}월 ${parts.day}일`,
    });
  }

  return out.sort((a, b) => {
    if (a.daysUntil !== b.daysUntil) return a.daysUntil - b.daysUntil;
    return a.kinshipLabel.localeCompare(b.kinshipLabel, 'ko');
  });
}

export function formatDaysUntil(daysUntil: number): string {
  if (daysUntil === 0) return '오늘';
  if (daysUntil === 1) return '내일';
  return `${daysUntil}일 후`;
}
