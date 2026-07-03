/**
 * 기본 족보 템플릿 — 참고 가계도 포맷
 *
 *   [친할아버지]──[친할머니]     [외할아버지]──[외할머니]
 *            \                        /
 *         [아버지]────[어머니]
 *               \        /
 *              [나]──[배우자]
 *                  │
 *               [자녀]
 */

import type { Person, PersonId } from '../types/pedigree';
import { nowIso } from './date';

export const DEFAULT_PEDIGREE_IDS = {
  self: 'self',
  spouse: 'spouse',
  father: 'father',
  mother: 'mother',
  pGrandfather: 'p_grandfather',
  pGrandmother: 'p_grandmother',
  mGrandfather: 'm_grandfather',
  mGrandmother: 'm_grandmother',
  child1: 'child1',
} as const;

export function createDefaultPedigreePeople(
  createdAt: string = nowIso(),
): Record<PersonId, Person> {
  const I = DEFAULT_PEDIGREE_IDS;

  const pGrandfather: Person = {
    id: I.pGrandfather,
    name: '친할아버지',
    createdAt,
    gender: 'male',
    spouseId: I.pGrandmother,
  };
  const pGrandmother: Person = {
    id: I.pGrandmother,
    name: '친할머니',
    createdAt,
    gender: 'female',
    spouseId: I.pGrandfather,
  };

  const mGrandfather: Person = {
    id: I.mGrandfather,
    name: '외할아버지',
    createdAt,
    gender: 'male',
    spouseId: I.mGrandmother,
  };
  const mGrandmother: Person = {
    id: I.mGrandmother,
    name: '외할머니',
    createdAt,
    gender: 'female',
    spouseId: I.mGrandfather,
  };

  const father: Person = {
    id: I.father,
    name: '아버지',
    createdAt,
    gender: 'male',
    spouseId: I.mother,
    fatherId: I.pGrandfather,
    motherId: I.pGrandmother,
  };
  const mother: Person = {
    id: I.mother,
    name: '어머니',
    createdAt,
    gender: 'female',
    spouseId: I.father,
    fatherId: I.mGrandfather,
    motherId: I.mGrandmother,
  };

  const spouse: Person = {
    id: I.spouse,
    name: '배우자',
    createdAt,
    gender: 'unknown',
    spouseId: I.self,
  };

  const self: Person = {
    id: I.self,
    name: '나',
    createdAt,
    gender: 'unknown',
    fatherId: I.father,
    motherId: I.mother,
    spouseId: I.spouse,
  };

  const child1: Person = {
    id: I.child1,
    name: '자녀',
    createdAt,
    gender: 'unknown',
    fatherId: I.self,
    motherId: I.spouse,
  };

  return {
    [I.pGrandfather]: pGrandfather,
    [I.pGrandmother]: pGrandmother,
    [I.mGrandfather]: mGrandfather,
    [I.mGrandmother]: mGrandmother,
    [I.father]: father,
    [I.mother]: mother,
    [I.self]: self,
    [I.spouse]: spouse,
    [I.child1]: child1,
  };
}

/** 저장 데이터가 예전 최소 템플릿(조부모 없음)인지 */
export function isLegacyMinimalPedigree(people: Record<PersonId, Person>): boolean {
  const ids = Object.keys(people);
  if (ids.length > 6) return false;
  return !people[DEFAULT_PEDIGREE_IDS.pGrandfather] && !people[DEFAULT_PEDIGREE_IDS.mGrandfather];
}

/** 예전 최소 템플릿 → 기본 포맷으로 보강 (기존 이름·사진 유지) */
export function upgradeLegacyPedigree(
  people: Record<PersonId, Person>,
): Record<PersonId, Person> {
  const fresh = createDefaultPedigreePeople();
  const merged: Record<PersonId, Person> = { ...fresh };

  for (const [id, person] of Object.entries(people)) {
    if (merged[id]) {
      merged[id] = {
        ...merged[id],
        ...person,
        id,
        fatherId: person.fatherId ?? merged[id].fatherId,
        motherId: person.motherId ?? merged[id].motherId,
        spouseId: person.spouseId ?? merged[id].spouseId,
      };
    } else {
      merged[id] = person;
    }
  }

  // 잘못 뒤바뀐 부모 링크 복구 (템플릿 기준)
  const I = DEFAULT_PEDIGREE_IDS;
  if (merged[I.self] && merged[I.father] && merged[I.mother]) {
    merged[I.self] = {
      ...merged[I.self],
      fatherId: I.father,
      motherId: I.mother,
    };
    merged[I.father] = {
      ...merged[I.father],
      fatherId: I.pGrandfather,
      motherId: I.pGrandmother,
      spouseId: I.mother,
    };
    merged[I.mother] = {
      ...merged[I.mother],
      fatherId: I.mGrandfather,
      motherId: I.mGrandmother,
      spouseId: I.father,
    };
  }

  const self = merged[DEFAULT_PEDIGREE_IDS.self];
  if (self && !self.spouseId && merged[DEFAULT_PEDIGREE_IDS.spouse]) {
    merged[DEFAULT_PEDIGREE_IDS.self] = {
      ...self,
      spouseId: DEFAULT_PEDIGREE_IDS.spouse,
    };
    merged[DEFAULT_PEDIGREE_IDS.spouse] = {
      ...merged[DEFAULT_PEDIGREE_IDS.spouse],
      spouseId: DEFAULT_PEDIGREE_IDS.self,
    };
  }

  const child = merged[DEFAULT_PEDIGREE_IDS.child1];
  if (child && !child.motherId && merged[DEFAULT_PEDIGREE_IDS.spouse]) {
    merged[DEFAULT_PEDIGREE_IDS.child1] = {
      ...child,
      motherId: DEFAULT_PEDIGREE_IDS.spouse,
    };
  }

  return merged;
}
