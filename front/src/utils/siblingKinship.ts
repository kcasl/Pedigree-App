import type { Person, PersonId } from '../types/pedigree';
import { compareAgeByBirthDate, type AgeRelation } from './birthOrder';

export function siblingAgeRelation(
  self: Person,
  sibling: Person,
  orderedBloodIds?: PersonId[],
): AgeRelation {
  const byDate = compareAgeByBirthDate(self, sibling);
  if (byDate !== 'unknown') return byDate;
  if (orderedBloodIds?.length) {
    const selfIndex = orderedBloodIds.indexOf(self.id);
    const otherIndex = orderedBloodIds.indexOf(sibling.id);
    if (selfIndex >= 0 && otherIndex >= 0 && otherIndex !== selfIndex) {
      return otherIndex < selfIndex ? 'older' : 'younger';
    }
  }
  return 'unknown';
}

export function siblingBloodLabel(
  self: Person,
  sibling: Person,
  orderedBloodIds?: PersonId[],
): string {
  const rel = siblingAgeRelation(self, sibling, orderedBloodIds);
  if (rel === 'same' || rel === 'unknown') return '형제';

  if (self.gender === 'female') {
    if (rel === 'older') {
      if (sibling.gender === 'male') return '오빠';
      if (sibling.gender === 'female') return '언니';
      return '형제';
    }
    if (sibling.gender === 'male') return '남동생';
    if (sibling.gender === 'female') return '여동생';
    return '형제';
  }

  if (self.gender === 'male') {
    if (rel === 'older') {
      if (sibling.gender === 'male') return '형';
      if (sibling.gender === 'female') return '누나';
      return '형제';
    }
    if (sibling.gender === 'male') return '남동생';
    if (sibling.gender === 'female') return '여동생';
    return '형제';
  }

  if (rel === 'older') {
    if (sibling.gender === 'male') return '형';
    if (sibling.gender === 'female') return '누나';
    return '형제';
  }
  if (sibling.gender === 'male') return '남동생';
  if (sibling.gender === 'female') return '여동생';
  return '형제';
}

function spouseLabelBySiblingRelation(
  rel: AgeRelation,
  siblingGender: Person['gender'] | undefined,
  selfGender: Person['gender'] | undefined,
): string {
  if (rel === 'older') {
    if (siblingGender === 'male') return '형수';
    if (siblingGender === 'female') {
      return selfGender === 'female' ? '형부' : '매형';
    }
  }
  if (rel === 'younger') {
    if (siblingGender === 'male') return '제수';
    if (siblingGender === 'female') return '매제';
  }
  if (rel === 'same' || rel === 'unknown') {
    if (siblingGender === 'male') return '형수';
    if (siblingGender === 'female') {
      return selfGender === 'female' ? '형부' : '매부';
    }
  }
  return '인척';
}

/** 배우자 집안 형제 — 나 시점(남성 기본: 처가, 여성: 시가) */
export function spouseSideSiblingLabel(
  selfGender: Person['gender'] | undefined,
  sibling: Person,
  rel: AgeRelation,
): string {
  if (selfGender === 'female') {
    if (sibling.gender === 'female') return '시누이';
    if (rel === 'older') return '시아주버니';
    if (rel === 'younger') return '시동생';
    return '시동생';
  }
  if (sibling.gender === 'female') {
    if (rel === 'older') return '처형';
    if (rel === 'younger') return '처제';
    return '처제/처형';
  }
  return '처남';
}

export function siblingSpouseLabel(
  self: Person,
  siblingBlood: Person,
  orderedBloodIds?: PersonId[],
): string {
  const rel = siblingAgeRelation(self, siblingBlood, orderedBloodIds);
  return spouseLabelBySiblingRelation(rel, siblingBlood.gender, self.gender);
}

export function buildSiblingKinshipLabels(
  peopleById: Record<PersonId, Person>,
  selfId: PersonId,
  siblingBloodIds: PersonId[],
): Record<PersonId, string> {
  const out: Record<PersonId, string> = {};
  const self = peopleById[selfId];
  if (!self) return out;

  for (const bloodId of siblingBloodIds) {
    const blood = peopleById[bloodId];
    if (!blood) continue;
    if (bloodId === selfId) {
      out[bloodId] = '본인';
      continue;
    }
    out[bloodId] = siblingBloodLabel(self, blood, siblingBloodIds);
    if (blood.spouseId && peopleById[blood.spouseId]) {
      out[blood.spouseId] = siblingSpouseLabel(self, blood, siblingBloodIds);
    }
  }
  return out;
}
