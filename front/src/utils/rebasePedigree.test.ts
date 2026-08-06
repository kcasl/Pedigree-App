import { createViewTemplate, reconcileStore, slotIdsForView } from './standardTemplate';
import { rebaseStoreAroundPerson } from './rebasePedigree';
import { syncAllViews } from './viewSync';
import type { PedigreeStore } from '../types/lineage';
import type { Person } from '../types/pedigree';

function p(partial: Partial<Person> & { id: string; name: string }): Person {
  return {
    createdAt: '2020-01-01T00:00:00.000Z',
    gender: 'unknown',
    ...partial,
  };
}

function baseStore(self: Record<string, Person>): PedigreeStore {
  return {
    version: 2,
    activeView: 'self',
    views: {
      self,
      paternal: createViewTemplate('paternal'),
      maternal: createViewTemplate('maternal'),
      spouse: createViewTemplate('spouse'),
    },
  };
}

function familyWithSiblingsAndKids(): Record<string, Person> {
  const self = createViewTemplate('self');
  self.me_sib2 = p({
    id: 'me_sib2',
    name: '나',
    gender: 'male',
    spouseId: 'me_sib2_sp',
    fatherId: 'me_father',
    motherId: 'me_mother',
    birthDate: '1988-01-01',
  });
  self.me_sib2_sp = p({
    id: 'me_sib2_sp',
    name: '배우자',
    gender: 'female',
    spouseId: 'me_sib2',
  });
  self.me_sib0 = p({
    id: 'me_sib0',
    name: '형',
    gender: 'male',
    fatherId: 'me_father',
    motherId: 'me_mother',
    birthDate: '1980-01-01',
  });
  self.me_sib3 = p({
    id: 'me_sib3',
    name: '누나',
    gender: 'female',
    fatherId: 'me_father',
    motherId: 'me_mother',
    birthDate: '1985-01-01',
    spouseId: 'me_sib3_sp',
  });
  self.me_sib3_sp = p({
    id: 'me_sib3_sp',
    name: '매형',
    gender: 'male',
    spouseId: 'me_sib3',
  });
  self.me_c2_0 = p({
    id: 'me_c2_0',
    name: '아들',
    gender: 'male',
    birthDate: '2010-01-01',
    fatherId: 'me_sib2',
    motherId: 'me_sib2_sp',
  });
  self.me_c2_1 = p({
    id: 'me_c2_1',
    name: '딸',
    gender: 'female',
    birthDate: '2012-01-01',
    fatherId: 'me_sib2',
    motherId: 'me_sib2_sp',
  });
  return self;
}

describe('rebaseStoreAroundPerson', () => {
  it('makes selected child the new self and maps parents', () => {
    const self = familyWithSiblingsAndKids();
    const next = rebaseStoreAroundPerson(baseStore(self), 'me_c2_0', 'self');
    expect(next.views.self.me_sib2?.name).toBe('아들');
    expect(next.views.self.me_father?.name).toBe('나');
    expect(next.views.self.me_mother?.name).toBe('배우자');
  });

  it('places daughter as sibling of son-focal after reconcile import', () => {
    const rebased = rebaseStoreAroundPerson(
      baseStore(familyWithSiblingsAndKids()),
      'me_c2_0',
      'self',
    );
    const imported = syncAllViews(reconcileStore(rebased));
    const people = imported.views.self;

    expect(people.me_sib2?.name).toBe('아들');
    const siblingNames = Object.values(people)
      .filter(person => person.fatherId === 'me_father' && person.motherId === 'me_mother')
      .map(person => person.name)
      .sort();
    expect(siblingNames).toEqual(['딸', '아들']);
    expect(people.me_sib0).toBeUndefined();
    expect(siblingNames).not.toContain('형');
    expect(siblingNames).not.toContain('누나');
  });

  it('does not resurrect ghost 외조부모 when child-focal mother has no parents', () => {
    const rebased = rebaseStoreAroundPerson(
      baseStore(familyWithSiblingsAndKids()),
      'me_c2_0',
      'self',
    );
    const imported = syncAllViews(reconcileStore(rebased));
    expect(imported.views.self.me_mgf).toBeUndefined();
    expect(imported.views.self.me_mgm).toBeUndefined();
  });

  it('매형 초점: 매형=나, 누나=배우자, 원본 나·형은 배우자 집안 형제', () => {
    const rebased = rebaseStoreAroundPerson(
      baseStore(familyWithSiblingsAndKids()),
      'me_sib3_sp',
      'self',
    );
    const imported = syncAllViews(reconcileStore(rebased));
    const me = slotIdsForView('self');
    const spo = slotIdsForView('spouse');

    expect(imported.views.self[me.selfId]?.name).toBe('매형');
    expect(imported.views.self[me.spouseId]?.name).toBe('누나');

    const spouseSiblings = Object.values(imported.views.spouse)
      .filter(
        person =>
          person.fatherId === spo.father &&
          person.motherId === spo.mother &&
          !!imported.views.spouse[spo.father],
      )
      .map(person => person.name)
      .sort();

    expect(imported.views.spouse[spo.selfId]?.name).toBe('누나');
    expect(imported.views.spouse[spo.spouseId]?.name).toBe('매형');
    expect(spouseSiblings).toEqual(expect.arrayContaining(['나', '누나', '형']));
    expect(spouseSiblings).not.toContain('매형');
  });

  it('친가보기 아버지 슬롯 초점은 self 아버지로 해석해 재구성', () => {
    const store = syncAllViews(baseStore(familyWithSiblingsAndKids()));
    const pat = slotIdsForView('paternal');
    const rebased = rebaseStoreAroundPerson(store, pat.selfId, 'paternal');
    // pat.selfId → me_father(아버지)가 새 나
    expect(rebased.views.self.me_sib2?.name).toBe('아버지');
    const kids = Object.values(rebased.views.self).filter(
      person => person.fatherId === 'me_sib2' || person.motherId === 'me_sib2',
    );
    const kidNames = kids.map(k => k.name).sort();
    expect(kidNames).toEqual(expect.arrayContaining(['나', '형', '누나']));
  });
});
