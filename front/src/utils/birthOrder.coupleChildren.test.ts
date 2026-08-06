import { collectCoupleChildIds, isChildOfCouple } from './birthOrder';
import type { Person } from '../types/pedigree';

function p(partial: Partial<Person> & { id: string }): Person {
  return {
    name: partial.name ?? partial.id,
    createdAt: '2020-01-01T00:00:00.000Z',
    gender: partial.gender ?? 'unknown',
    ...partial,
  };
}

describe('collectCoupleChildIds', () => {
  it('includes single-parent-linked children when couple has a spouse', () => {
    const people = {
      son: p({ id: 'son', gender: 'male', spouseId: 'dil' }),
      dil: p({ id: 'dil', gender: 'female', spouseId: 'son' }),
      gc: p({ id: 'gc', gender: 'male', fatherId: 'son' }),
    };
    expect(isChildOfCouple(people.gc, 'son', 'dil')).toBe(true);
    expect(collectCoupleChildIds(people, 'son', 'dil')).toEqual(['gc']);
  });

  it('requires full couple match when both parents are set', () => {
    const people = {
      a: p({ id: 'a', gender: 'male' }),
      b: p({ id: 'b', gender: 'female' }),
      kid: p({ id: 'kid', fatherId: 'a', motherId: 'other' }),
    };
    expect(isChildOfCouple(people.kid, 'a', 'b')).toBe(false);
    expect(collectCoupleChildIds(people, 'a', 'b')).toEqual([]);
  });

  it('does not treat grandchild as child of grandparent couple', () => {
    const people = {
      son: p({ id: 'son', gender: 'male', spouseId: 'dil' }),
      dil: p({ id: 'dil', gender: 'female', spouseId: 'son' }),
      gc: p({ id: 'gc', gender: 'male', fatherId: 'son', motherId: 'dil' }),
      ggc: p({ id: 'ggc', gender: 'male', fatherId: 'gc' }),
    };
    expect(collectCoupleChildIds(people, 'son', 'dil')).toEqual(['gc']);
    expect(collectCoupleChildIds(people, 'gc', undefined)).toEqual(['ggc']);
  });
});
