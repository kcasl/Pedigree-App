import type { Person, PersonId } from '../types/pedigree';

export type AgeRelation = 'older' | 'younger' | 'same' | 'unknown';

export function birthTimestamp(person?: Person): number | null {
  if (!person) return null;
  if (person.birthDate) {
    const t = Date.parse(person.birthDate);
    if (Number.isFinite(t)) return t;
  }
  if (person.createdAt) {
    const t = Date.parse(person.createdAt);
    if (Number.isFinite(t)) return t;
  }
  return null;
}

export function compareByBirthAsc(a: Person, b: Person): number {
  const ta = birthTimestamp(a);
  const tb = birthTimestamp(b);
  if (ta != null && tb != null) {
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  }
  if (ta != null) return -1;
  if (tb != null) return 1;
  return a.id.localeCompare(b.id);
}

export function compareAgeToSelf(self: Person, other: Person): AgeRelation {
  const ts = birthTimestamp(self);
  const to = birthTimestamp(other);
  if (ts == null || to == null) return 'unknown';
  if (to < ts) return 'older';
  if (to > ts) return 'younger';
  return 'same';
}

export type SiblingCouple = { blood: PersonId; spouse?: PersonId };

/** 나를 중앙에 두고, 연장자는 왼쪽·후배는 오른쪽(각각 생년월일 오름차순). */
export function orderSiblingCouplesAroundFocal(
  couples: SiblingCouple[],
  focalId: PersonId,
  people: Record<PersonId, Person>,
): { couples: SiblingCouple[]; focalIndex: number } {
  const present = couples.filter(c => people[c.blood]);
  const focal = present.find(c => c.blood === focalId);
  const rest = present.filter(c => c.blood !== focalId);
  const selfPerson = people[focalId];

  const older: SiblingCouple[] = [];
  const younger: SiblingCouple[] = [];
  const unknown: SiblingCouple[] = [];

  for (const couple of rest) {
    const blood = people[couple.blood];
    if (!selfPerson || !blood) {
      unknown.push(couple);
      continue;
    }
    const rel = compareAgeToSelf(selfPerson, blood);
    if (rel === 'older') older.push(couple);
    else if (rel === 'younger') younger.push(couple);
    else unknown.push(couple);
  }

  older.sort((a, b) => compareByBirthAsc(people[a.blood]!, people[b.blood]!));
  younger.sort((a, b) => compareByBirthAsc(people[a.blood]!, people[b.blood]!));
  unknown.sort((a, b) => a.blood.localeCompare(b.blood));

  const ordered = [...older, ...(focal ? [focal] : []), ...younger, ...unknown];
  const focalIndex = focal ? older.length : 0;
  return { couples: ordered, focalIndex };
}

const ORDINAL_LABELS = ['첫째', '둘째', '셋째', '넷째', '다섯째', '여섯째', '일곱째', '여덟째', '아홉째', '열째'];

export function ordinalLabel(index: number): string {
  return ORDINAL_LABELS[index] ?? `${index + 1}째`;
}

export function sortIdsByBirth(ids: PersonId[], people: Record<PersonId, Person>): PersonId[] {
  return [...ids]
    .filter(id => people[id])
    .sort((a, b) => compareByBirthAsc(people[a]!, people[b]!));
}
