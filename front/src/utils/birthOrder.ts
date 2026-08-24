import type { ActiveView } from '../types/lineage';
import type { Person, PersonId } from '../types/pedigree';
import { SELF_SLOT_INDEX, slotIdsForView } from './standardTemplate';

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

export function birthDateTimestamp(person?: Person): number | null {
  if (!person?.birthDate) return null;
  const t = Date.parse(person.birthDate);
  return Number.isFinite(t) ? t : null;
}

export function compareByBirthDateOnly(a: Person, b: Person): number {
  const ta = birthDateTimestamp(a);
  const tb = birthDateTimestamp(b);
  if (ta != null && tb != null) {
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  }
  if (ta != null) return -1;
  if (tb != null) return 1;
  return 0;
}

/** 생년월일이 없을 때 호칭·슬롯으로 연장자(작을수록 위)를 가린다. */
export function relativeOrderHint(person: Person): number {
  const n = person.name?.trim() ?? '';
  const id = person.id;
  if (/^큰(형|아버지|어머니)/.test(n)) return 0;
  if (/^(형|오빠)$/.test(n)) return 1;
  if (/^(누나|언니)$/.test(n)) return 2;
  if (/^고모/.test(n)) return 3;
  if (/^(나|본인|아버지|어머니)$/.test(n)) return 4;
  if (/^(삼촌|숙모|남동생|외삼촌)$/.test(n)) return 5;
  if (/^(여동생|이모)/.test(n)) return 6;
  if (/_sib1\b/.test(id) || /_extra_L/i.test(id)) return 0;
  if (/_sib0\b/.test(id)) return 1;
  if (/_sib3\b/.test(id)) return 2;
  if (/_sib4\b/.test(id) || /_extra_R/i.test(id)) return 5;
  return 4;
}

export function compareRelativesForLayout(a: Person, b: Person): number {
  const ta = birthDateTimestamp(a);
  const tb = birthDateTimestamp(b);
  if (ta != null && tb != null && ta !== tb) return ta - tb;
  const hint = relativeOrderHint(a) - relativeOrderHint(b);
  if (hint !== 0) return hint;
  if (ta != null && tb == null) return -1;
  if (ta == null && tb != null) return 1;
  const ca = birthTimestamp(a);
  const cb = birthTimestamp(b);
  if (ca != null && cb != null && ca !== cb) return ca - cb;
  return a.id.localeCompare(b.id);
}

/** anchor보다 연장자면 true. 생년월일 → 호칭 → 생성일 순. */
export function isOlderRelative(anchor: Person, other: Person): boolean {
  const byDate = compareAgeByBirthDate(anchor, other);
  if (byDate === 'older' || byDate === 'same') return true;
  if (byDate === 'younger') return false;
  const hint = relativeOrderHint(other) - relativeOrderHint(anchor);
  if (hint !== 0) return hint < 0;
  const byTs = compareAgeToSelf(anchor, other);
  if (byTs === 'younger') return false;
  return true;
}

export function compareAgeByBirthDate(self: Person, other: Person): AgeRelation {
  const ts = birthDateTimestamp(self);
  const to = birthDateTimestamp(other);
  if (ts == null || to == null) return 'unknown';
  if (to < ts) return 'older';
  if (to > ts) return 'younger';
  return 'same';
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

/** 생년월일로 비교할 수 있는 쌍이 있으면 형제·자녀 배치 순서를 바꾼다. */
export function shouldReorderByBirthDate(
  focal: Person,
  others: Person[],
): boolean {
  const dated = [focal, ...others].filter(p => birthDateTimestamp(p) != null);
  return dated.length >= 2;
}

/** 기본 템플릿: 왼쪽 큰형·형·누나, 가운데 나, 오른쪽 남동생 */
export function defaultSelfSiblingCoupleOrder(
  couples: SiblingCouple[],
  focalId: PersonId,
  templateBloodOrder: PersonId[],
): { couples: SiblingCouple[]; focalIndex: number } {
  const byBlood = new Map(couples.map(c => [c.blood, c]));
  const ordered: SiblingCouple[] = [];
  const seen = new Set<PersonId>();

  for (const bloodId of templateBloodOrder) {
    const couple = byBlood.get(bloodId);
    if (couple && !seen.has(bloodId)) {
      ordered.push(couple);
      seen.add(bloodId);
    }
  }
  for (const couple of couples) {
    if (!seen.has(couple.blood)) {
      ordered.push(couple);
      seen.add(couple.blood);
    }
  }

  const focalIndex = ordered.findIndex(c => c.blood === focalId);
  return { couples: ordered, focalIndex: focalIndex >= 0 ? focalIndex : 0 };
}

/** 뷰별 형제 줄 기본 순서 (생년월일 없을 때) */
export function defaultSiblingBloodOrder(
  view: ActiveView,
  slots: ReturnType<typeof slotIdsForView>,
): PersonId[] {
  if (view === 'self' || view === 'spouse') {
    return [
      slots.siblings[1].blood,
      slots.siblings[0].blood,
      slots.siblings[3].blood,
      slots.selfId,
      slots.siblings[4].blood,
    ];
  }
  return [slots.siblings[1].blood, slots.selfId, slots.siblings[3].blood];
}

function unknownAgeSide(id: PersonId, fallback: 'left' | 'right'): 'left' | 'right' {
  if (/_extra_L/i.test(id)) return 'left';
  if (/_extra_R/i.test(id)) return 'right';
  return fallback;
}

/** extra_L 는 나 왼쪽, extra_R 는 나 오른쪽으로 고정 */
function stabilizeExtraSiblingSides(
  couples: SiblingCouple[],
  focalId: PersonId,
): SiblingCouple[] {
  const focalIndex = couples.findIndex(c => c.blood === focalId);
  if (focalIndex < 0) return couples;
  const focal = couples[focalIndex]!;
  const rest = couples.filter(c => c.blood !== focalId);
  const extraLeft = rest.filter(c => /_extra_L/i.test(c.blood));
  const extraRight = rest.filter(c => /_extra_R/i.test(c.blood));
  const coreLeft = couples
    .slice(0, focalIndex)
    .filter(c => !/_extra_[LR]/i.test(c.blood));
  const coreRight = couples
    .slice(focalIndex + 1)
    .filter(c => !/_extra_[LR]/i.test(c.blood));
  return [...extraLeft, ...coreLeft, focal, ...coreRight, ...extraRight];
}

export function orderedSiblingBloodIds(
  people: Record<PersonId, Person>,
  focalId: PersonId,
  view: ActiveView,
  slots: ReturnType<typeof slotIdsForView>,
): PersonId[] {
  const focal = people[focalId];
  const fromParents =
    focal?.fatherId || focal?.motherId
      ? collectCoupleChildIds(
          people,
          (focal.fatherId ?? focal.motherId)!,
          focal.fatherId && focal.motherId ? focal.motherId : undefined,
        )
      : [];
  const fromSlots = slots.siblings.map(s => s.blood);
  const unique = [...new Set([...fromParents, ...fromSlots, focalId])].filter(
    id => people[id],
  );
  return orderSiblingCouplesAroundFocal(
    unique.map(blood => ({ blood })),
    focalId,
    people,
    defaultSiblingBloodOrder(view, slots),
  ).couples.map(c => c.blood);
}

/** 나를 중앙에 두고, 생년월일 기준 연장자는 왼쪽·후배는 오른쪽. 나이 미상은 원래 쪽을 유지. */
export function orderSiblingCouplesAroundFocal(
  couples: SiblingCouple[],
  focalId: PersonId,
  people: Record<PersonId, Person>,
  templateBloodOrder?: PersonId[],
): { couples: SiblingCouple[]; focalIndex: number } {
  const present = couples.filter(c => people[c.blood]);
  const selfPerson = people[focalId];
  const others = present.filter(c => c.blood !== focalId).map(c => people[c.blood]!);

  const templated = stabilizeExtraSiblingSides(
    templateBloodOrder?.length
      ? defaultSelfSiblingCoupleOrder(present, focalId, templateBloodOrder).couples
      : present,
    focalId,
  );
  const focalIndexInBase = templated.findIndex(c => c.blood === focalId);
  if (focalIndexInBase < 0) {
    return { couples: templated, focalIndex: 0 };
  }

  if (!selfPerson || !shouldReorderByBirthDate(selfPerson, others)) {
    return { couples: templated, focalIndex: focalIndexInBase };
  }

  const focal = templated[focalIndexInBase]!;
  const leftOrig = templated.slice(0, focalIndexInBase);
  const rightOrig = templated.slice(focalIndexInBase + 1);

  const older: SiblingCouple[] = [];
  const younger: SiblingCouple[] = [];
  const unknownLeft: SiblingCouple[] = [];
  const unknownRight: SiblingCouple[] = [];

  const bucket = (couple: SiblingCouple, fallback: 'left' | 'right') => {
    const blood = people[couple.blood];
    if (!blood) return;
    const rel = compareAgeByBirthDate(selfPerson, blood);
    if (rel === 'older' || rel === 'same') older.push(couple);
    else if (rel === 'younger') younger.push(couple);
    else if (unknownAgeSide(couple.blood, fallback) === 'left') unknownLeft.push(couple);
    else unknownRight.push(couple);
  };

  leftOrig.forEach(c => bucket(c, 'left'));
  rightOrig.forEach(c => bucket(c, 'right'));

  older.sort((a, b) => compareByBirthDateOnly(people[a.blood]!, people[b.blood]!));
  younger.sort((a, b) => compareByBirthDateOnly(people[a.blood]!, people[b.blood]!));
  unknownLeft.sort((a, b) => compareByBirthDateOnly(people[a.blood]!, people[b.blood]!));
  unknownRight.sort((a, b) => compareByBirthDateOnly(people[a.blood]!, people[b.blood]!));

  const ordered = [...unknownLeft, ...older, focal, ...younger, ...unknownRight];
  return { couples: ordered, focalIndex: unknownLeft.length + older.length };
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

/** 자녀·형제 배치: 생년월일, 없으면 호칭(큰형→형→누나→동생) 순 */
export function sortChildIdsForLayout(
  ids: PersonId[],
  people: Record<PersonId, Person>,
): PersonId[] {
  return [...ids]
    .filter(id => people[id])
    .sort((a, b) => {
      const cmp = compareRelativesForLayout(people[a]!, people[b]!);
      if (cmp !== 0) return cmp;
      return ids.indexOf(a) - ids.indexOf(b);
    });
}

/**
 * 부부(또는 단독 부모)의 자녀인지 판별.
 * 배우자가 있어도 한쪽 부모만 연결된 템플릿/레거시 자녀는 포함한다.
 * 양쪽 부모가 모두 있으면 부부 일치만 인정한다.
 */
export function isChildOfCouple(
  person: Person,
  bloodId: PersonId,
  spouseId?: PersonId,
): boolean {
  if (!person.fatherId && !person.motherId) return false;
  if (!spouseId) {
    return person.fatherId === bloodId || person.motherId === bloodId;
  }
  if (person.fatherId && person.motherId) {
    return (
      (person.fatherId === bloodId && person.motherId === spouseId) ||
      (person.fatherId === spouseId && person.motherId === bloodId)
    );
  }
  const sole = person.fatherId ?? person.motherId;
  return sole === bloodId || sole === spouseId;
}

/**
 * 초점(본인)을 가운데 슬롯(2)에 두고 형제를 좌우 슬롯에 배치한다.
 * 0·1 = 위쪽(형), 3·4 = 아래쪽(동생), 범위 밖은 extra.
 */
export function assignSiblingSlotIndices(
  siblingIdsSorted: PersonId[],
  focalId: PersonId,
): Map<PersonId, number> {
  const focalPos = siblingIdsSorted.indexOf(focalId);
  const map = new Map<PersonId, number>();
  if (focalPos < 0) {
    map.set(focalId, SELF_SLOT_INDEX);
    return map;
  }

  map.set(focalId, SELF_SLOT_INDEX);
  const older = siblingIdsSorted.slice(0, focalPos).reverse();
  const younger = siblingIdsSorted.slice(focalPos + 1);

  older.forEach((id, i) => {
    map.set(id, i === 0 ? 1 : i === 1 ? 0 : -(i - 1));
  });
  younger.forEach((id, i) => {
    map.set(id, i === 0 ? 3 : i === 1 ? 4 : 5 + (i - 2));
  });

  return map;
}

export function siblingSlotBloodId(prefix: string, slotIndex: number): PersonId {
  if (slotIndex >= 0 && slotIndex <= 4) return `${prefix}_sib${slotIndex}`;
  if (slotIndex < 0) return `${prefix}_sib_extra_L${Math.abs(slotIndex)}`;
  return `${prefix}_sib_extra_R${slotIndex}`;
}

/** 부부(또는 단독 부모) 아래 자녀 id 목록 — 출생순 정렬은 호출측에서 */
export function collectCoupleChildIds(
  people: Record<PersonId, Person>,
  bloodId: PersonId,
  spouseId?: PersonId,
): PersonId[] {
  const ids: PersonId[] = [];
  for (const p of Object.values(people)) {
    if (isChildOfCouple(p, bloodId, spouseId)) ids.push(p.id);
  }
  return ids;
}

function collectChildIds(
  people: Record<PersonId, Person>,
  bloodId: PersonId,
  spouseId?: PersonId,
): PersonId[] {
  return collectCoupleChildIds(people, bloodId, spouseId);
}

export function buildChildOrdinalLabels(
  people: Record<PersonId, Person>,
  parentPairs: Array<{ bloodId: PersonId; spouseId?: PersonId }>,
): Record<PersonId, string> {
  const out: Record<PersonId, string> = {};
  for (const pair of parentPairs) {
    const kids = sortIdsByBirth(collectChildIds(people, pair.bloodId, pair.spouseId), people);
    kids.forEach((id, index) => {
      out[id] = ordinalLabel(index);
    });
  }
  return out;
}
