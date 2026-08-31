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
    expect(next.views.self.me_mother?.name).toBe('어머니');
    expect(next.views.self.me_sib2?.spouseId).toBeUndefined();
    expect(next.views.self.me_sib2_sp).toBeUndefined();
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

  it('자식 기준 재배치 시 배우자 본가 웃어른을 외조부모로 둔다', () => {
    const rebased = rebaseStoreAroundPerson(
      baseStore(familyWithSiblingsAndKids()),
      'me_c2_0',
      'self',
    );
    const imported = syncAllViews(reconcileStore(rebased));
    expect(imported.views.self.me_mgf?.name).toBe('외할아버지');
    expect(imported.views.self.me_mgm?.name).toBe('외할머니');
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

  it('자식 기준 재배치 시 나의 형제는 삼촌·고모로 유지', () => {
    const next = rebaseStoreAroundPerson(
      baseStore(familyWithSiblingsAndKids()),
      'me_c2_0',
      'self',
    );
    expect(next.views.self.me_sib2?.name).toBe('아들');
    expect(next.views.self.me_father?.name).toBe('나');

    const father = next.views.self.me_father;
    expect(father?.fatherId).toBe('me_gf');
    expect(father?.motherId).toBe('me_gm');

    const paternalUncles = Object.values(next.views.self)
      .filter(
        person =>
          person.id !== 'me_father' &&
          person.fatherId === 'me_gf' &&
          person.motherId === 'me_gm',
      )
      .map(person => person.name)
      .sort();
    expect(paternalUncles).toEqual(expect.arrayContaining(['누나', '형']));

    const pat = slotIdsForView('paternal');
    expect(next.views.paternal[pat.selfId]?.name).toBe('나');
    const paternalUnclesInPat = Object.values(next.views.paternal)
      .filter(
        person =>
          person.id !== pat.selfId &&
          person.fatherId === pat.father &&
          person.motherId === pat.mother,
      )
      .map(person => person.name)
      .sort();
    expect(paternalUnclesInPat).toEqual(expect.arrayContaining(['누나', '형']));
  });

  it('기본 족보 형제 칸은 나 기준 재배치에서도 유지', () => {
    const next = rebaseStoreAroundPerson(
      baseStore(familyWithSiblingsAndKids()),
      'me_sib2',
      'self',
    );
    const siblingNames = Object.values(next.views.self)
      .filter(person => person.fatherId === 'me_father' && person.motherId === 'me_mother')
      .map(person => person.name)
      .sort();
    expect(siblingNames).toEqual(expect.arrayContaining(['나', '누나', '형', '큰형', '남동생']));
    expect(siblingNames).not.toContain('형의 아들');
  });

  it('친가보기에만 있는 큰아버지는 나 기준 재배치 후에도 유지', () => {
    const store = syncAllViews(baseStore(familyWithSiblingsAndKids()));
    const pat = slotIdsForView('paternal');
    store.views.paternal = {
      ...store.views.paternal,
      [pat.siblings[1].blood]: p({
        id: pat.siblings[1].blood,
        name: '큰아버지실명',
        gender: 'male',
        fatherId: pat.father,
        motherId: pat.mother,
        birthDate: '1950-03-01',
      }),
    };

    const next = rebaseStoreAroundPerson(store, 'me_sib2', 'self');
    const uncleNames = Object.values(next.views.self)
      .filter(
        person =>
          person.id !== 'me_father' &&
          person.fatherId === 'me_gf' &&
          person.motherId === 'me_gm',
      )
      .map(person => person.name);
    expect(uncleNames).toContain('큰아버지실명');
  });

  it('배우자집안의 형제는 자식 기준에서 이모·외삼촌으로 유지', () => {
    const store = baseStore(familyWithSiblingsAndKids());
    const spo = slotIdsForView('spouse');
    const spouseView = createViewTemplate('spouse');
    spouseView[spo.siblings[3].blood] = p({
      id: spo.siblings[3].blood,
      name: '처형',
      gender: 'female',
      fatherId: spo.father,
      motherId: spo.mother,
      birthDate: '1986-06-01',
    });
    store.views.spouse = spouseView;

    const next = rebaseStoreAroundPerson(store, 'me_c2_0', 'self');
    const mother = next.views.self.me_mother;
    expect(mother?.name).toBe('어머니');
    expect(mother?.fatherId).toBeTruthy();
    expect(mother?.motherId).toBeTruthy();

    const maternalUncles = Object.values(next.views.self)
      .filter(
        person =>
          person.id !== 'me_mother' &&
          person.fatherId === mother?.fatherId &&
          person.motherId === mother?.motherId,
      )
      .map(person => person.name);
    expect(maternalUncles).toContain('처형');
  });

  it('외가보기에만 있는 이모는 나 기준 재배치 후에도 유지', () => {
    const store = syncAllViews(baseStore(familyWithSiblingsAndKids()));
    const mat = slotIdsForView('maternal');
    store.views.maternal = {
      ...store.views.maternal,
      [mat.siblings[3].blood]: p({
        id: mat.siblings[3].blood,
        name: '이모실명',
        gender: 'female',
        fatherId: mat.father,
        motherId: mat.mother,
        birthDate: '1955-04-01',
      }),
    };

    const next = rebaseStoreAroundPerson(store, 'me_sib2', 'self');
    const auntNames = Object.values(next.views.self)
      .filter(
        person =>
          person.id !== 'me_mother' &&
          person.fatherId === 'me_mgf' &&
          person.motherId === 'me_mgm',
      )
      .map(person => person.name);
    expect(auntNames).toContain('이모실명');
    expect(next.views.maternal[mat.selfId]?.name).toBe('어머니');
    const maternalAunts = Object.values(next.views.maternal)
      .filter(
        person =>
          person.id !== mat.selfId &&
          person.fatherId === mat.father &&
          person.motherId === mat.mother,
      )
      .map(person => person.name);
    expect(maternalAunts).toContain('이모실명');
  });

  it('외가보기 이모 초점은 이모가 나, 어머니는 형제가 된다', () => {
    const store = syncAllViews(baseStore(familyWithSiblingsAndKids()));
    const mat = slotIdsForView('maternal');
    const auntId = mat.siblings[3].blood;
    store.views.maternal = {
      ...store.views.maternal,
      [auntId]: p({
        id: auntId,
        name: '이모실명',
        gender: 'female',
        fatherId: mat.father,
        motherId: mat.mother,
        birthDate: '1955-04-01',
      }),
    };

    const next = rebaseStoreAroundPerson(store, auntId, 'maternal');
    expect(next.views.self.me_sib2?.name).toBe('이모실명');
    const siblingNames = Object.values(next.views.self)
      .filter(person => person.fatherId === 'me_father' && person.motherId === 'me_mother')
      .map(person => person.name);
    expect(siblingNames).toEqual(expect.arrayContaining(['이모실명', '어머니']));
  });

  it('extra sibling id survives export around 나 and can be the new 나', () => {
    const self = familyWithSiblingsAndKids();
    self.me_sib_extra_R5 = p({
      id: 'me_sib_extra_R5',
      name: '막내동생',
      gender: 'male',
      fatherId: 'me_father',
      motherId: 'me_mother',
      birthDate: '1992-01-01',
    });

    const aroundMe = rebaseStoreAroundPerson(baseStore(self), 'me_sib2', 'self');
    const namesAroundMe = Object.values(aroundMe.views.self)
      .filter(person => person.fatherId === 'me_father' && person.motherId === 'me_mother')
      .map(person => person.name);
    expect(namesAroundMe).toEqual(expect.arrayContaining(['나', '형', '누나', '막내동생']));

    const aroundYoungest = rebaseStoreAroundPerson(
      baseStore(self),
      'me_sib_extra_R5',
      'self',
    );
    expect(aroundYoungest.views.self.me_sib2?.name).toBe('막내동생');
    const namesAroundYoungest = Object.values(aroundYoungest.views.self)
      .filter(person => person.fatherId === 'me_father' && person.motherId === 'me_mother')
      .map(person => person.name);
    expect(namesAroundYoungest).toEqual(
      expect.arrayContaining(['나', '형', '누나', '막내동생']),
    );
  });

  it('손자 초점은 아들을 아버지, 나를 친조부로 두고 형제는 삼촌이 된다', () => {
    const self = familyWithSiblingsAndKids();
    self.me_gc_real = p({
      id: 'me_gc_real',
      name: '손자실명',
      gender: 'male',
      fatherId: 'me_c2_0',
      birthDate: '2030-01-01',
    });

    const next = rebaseStoreAroundPerson(baseStore(self), 'me_gc_real', 'self');
    expect(next.views.self.me_sib2?.name).toBe('손자실명');
    expect(next.views.self.me_father?.name).toBe('아들');
    expect(next.views.self.me_gf?.name).toBe('나');

    const father = next.views.self.me_father;
    const uncles = Object.values(next.views.self)
      .filter(
        person =>
          person.id !== 'me_father' &&
          person.fatherId === father?.fatherId &&
          person.motherId === father?.motherId,
      )
      .map(person => person.name);
    expect(uncles).toContain('딸');
  });

  it('친가 큰아버지 초점은 큰아버지가 나, 원본 나는 조카', () => {
    const store = syncAllViews(baseStore(familyWithSiblingsAndKids()));
    const pat = slotIdsForView('paternal');
    const uncleId = pat.siblings[1].blood;
    store.views.paternal = {
      ...store.views.paternal,
      [uncleId]: p({
        id: uncleId,
        name: '큰아버지실명',
        gender: 'male',
        fatherId: pat.father,
        motherId: pat.mother,
        birthDate: '1950-03-01',
      }),
    };

    const next = rebaseStoreAroundPerson(store, uncleId, 'paternal');
    expect(next.views.self.me_sib2?.name).toBe('큰아버지실명');
    const siblingNames = Object.values(next.views.self)
      .filter(person => person.fatherId === 'me_father' && person.motherId === 'me_mother')
      .map(person => person.name);
    expect(siblingNames).toContain('아버지');

    const nephewNames = Object.values(next.views.self)
      .filter(person => {
        const parent =
          next.views.self[person.fatherId ?? ''] ??
          next.views.self[person.motherId ?? ''];
        return parent?.name === '아버지';
      })
      .map(person => person.name);
    expect(nephewNames).toEqual(expect.arrayContaining(['나', '형', '누나']));
  });

  it('빈 템플릿만 있어도 나 기준 재배치가 형·동생 유령을 넣지 않는다', () => {
    const store: PedigreeStore = {
      version: 2,
      activeView: 'self',
      views: {
        self: createViewTemplate('self'),
        paternal: createViewTemplate('paternal'),
        maternal: createViewTemplate('maternal'),
        spouse: createViewTemplate('spouse'),
      },
    };
    const next = rebaseStoreAroundPerson(store, 'me_sib2', 'self');
    expect(next.views.self.me_sib2?.name).toBe('나');
    const siblingNames = Object.values(next.views.self)
      .filter(person => person.fatherId === 'me_father' && person.motherId === 'me_mother')
      .map(person => person.name)
      .sort();
    expect(siblingNames).toEqual(['나', '남동생', '누나', '큰형', '형']);
  });

  it('기본 족보에서 나의 아들 기준이면 형제와 외가 웃어른이 실린다', () => {
    const store: PedigreeStore = {
      version: 2,
      activeView: 'self',
      views: {
        self: createViewTemplate('self'),
        paternal: createViewTemplate('paternal'),
        maternal: createViewTemplate('maternal'),
        spouse: createViewTemplate('spouse'),
      },
    };
    const next = rebaseStoreAroundPerson(store, 'me_c2_0', 'self');
    expect(next.views.self.me_sib2?.name).toBe('나의 아들');
    expect(next.views.self.me_father?.name).toBe('나');
    expect(next.views.self.me_mother?.name).toBe('어머니');
    expect(next.views.self.me_sib2?.spouseId).toBeUndefined();
    expect(next.views.self.me_sib2_sp).toBeUndefined();

    const father = next.views.self.me_father;
    const uncles = Object.values(next.views.self)
      .filter(
        person =>
          person.id !== 'me_father' &&
          person.fatherId === father?.fatherId &&
          person.motherId === father?.motherId,
      )
      .map(person => person.name);
    expect(uncles).toEqual(expect.arrayContaining(['형', '누나', '큰형', '남동생']));

    const siblingOfSon = Object.values(next.views.self).filter(
      person =>
        person.id !== 'me_sib2' &&
        person.fatherId === 'me_father' &&
        person.motherId === 'me_mother',
    );
    expect(siblingOfSon.map(s => s.name)).toContain('나의 딸');

    expect(next.views.self.me_mgf?.name).toBe('외할아버지');
    expect(next.views.self.me_mgm?.name).toBe('외할머니');
    expect(next.views.maternal[slotIdsForView('maternal').father]?.name).toBe(
      '외할아버지',
    );

    const cousins = Object.values(next.views.self).filter(person => {
      const parent =
        (person.fatherId && next.views.self[person.fatherId]) ||
        (person.motherId && next.views.self[person.motherId]);
      if (!parent) return false;
      return (
        parent.id !== 'me_father' &&
        parent.fatherId === father?.fatherId &&
        parent.motherId === father?.motherId
      );
    });
    expect(
      cousins.filter(c => /사촌|형의 아들|형의 딸|큰형의 아들|누나의 아들/.test(c.name.trim())).length,
    ).toBeGreaterThan(0);

    const hyungCopies = Object.values(next.views.self).filter(person => person.name === '형');
    expect(hyungCopies.length).toBeLessThanOrEqual(1);
  });

  it('여성 나에서 자식 기준이면 오빠·언니가 외삼촌·이모 자리로 간다', () => {
    const self = createViewTemplate('self');
    self.me_sib2 = p({
      id: 'me_sib2',
      name: '나',
      gender: 'female',
      spouseId: 'me_sib2_sp',
      fatherId: 'me_father',
      motherId: 'me_mother',
      birthDate: '1988-01-01',
    });
    self.me_sib2_sp = p({
      id: 'me_sib2_sp',
      name: '배우자',
      gender: 'male',
      spouseId: 'me_sib2',
    });
    self.me_sib0 = p({
      id: 'me_sib0',
      name: '오빠',
      gender: 'male',
      fatherId: 'me_father',
      motherId: 'me_mother',
      birthDate: '1980-01-01',
    });
    self.me_sib3 = p({
      id: 'me_sib3',
      name: '언니',
      gender: 'female',
      fatherId: 'me_father',
      motherId: 'me_mother',
      birthDate: '1985-01-01',
    });
    self.me_c2_0 = p({
      id: 'me_c2_0',
      name: '딸',
      gender: 'female',
      birthDate: '2010-01-01',
      fatherId: 'me_sib2_sp',
      motherId: 'me_sib2',
    });

    const next = rebaseStoreAroundPerson(baseStore(self), 'me_c2_0', 'self');
    expect(next.views.self.me_sib2?.name).toBe('딸');
    expect(next.views.self.me_mother?.name).toBe('나');
    const maternalUncles = Object.values(next.views.self)
      .filter(
        person =>
          person.id !== 'me_mother' &&
          person.fatherId === next.views.self.me_mother?.fatherId &&
          person.motherId === next.views.self.me_mother?.motherId,
      )
      .map(person => person.name)
      .sort();
    expect(maternalUncles).toEqual(expect.arrayContaining(['언니', '오빠']));
  });

  it('나 기준 재배치 후 외가보기에 외조부모·이모가 실리고 배우자보기에는 배우자 본가가 실린다', () => {
    const store = syncAllViews(baseStore(familyWithSiblingsAndKids()));
    const mat = slotIdsForView('maternal');
    const spo = slotIdsForView('spouse');
    store.views.maternal = {
      ...store.views.maternal,
      [mat.siblings[3].blood]: p({
        id: mat.siblings[3].blood,
        name: '이모실명',
        gender: 'female',
        fatherId: mat.father,
        motherId: mat.mother,
        birthDate: '1955-04-01',
      }),
    };
    store.views.spouse = {
      ...createViewTemplate('spouse'),
      [spo.father]: p({
        id: spo.father,
        name: '장인',
        gender: 'male',
        spouseId: spo.mother,
      }),
      [spo.mother]: p({
        id: spo.mother,
        name: '장모',
        gender: 'female',
        spouseId: spo.father,
      }),
      [spo.selfId]: {
        ...createViewTemplate('spouse')[spo.selfId],
        name: '배우자',
        fatherId: spo.father,
        motherId: spo.mother,
      },
    };

    const next = rebaseStoreAroundPerson(store, 'me_sib2', 'self');
    expect(next.views.maternal[mat.selfId]?.name).toBe('어머니');
    expect(next.views.maternal[mat.father]?.name).toMatch(/외할아버지|장인|친족/);
    const maternalSibs = Object.values(next.views.maternal)
      .filter(
        person =>
          person.id !== mat.selfId &&
          (person.fatherId === mat.father || person.motherId === mat.mother),
      )
      .map(person => person.name);
    expect(maternalSibs).toContain('이모실명');

    expect(next.views.spouse[spo.selfId]?.name).toBe('배우자');
    expect(next.views.spouse[spo.father]?.name).toBe('장인');
    expect(next.views.spouse[spo.mother]?.name).toBe('장모');
  });

  it('기본 템플릿 이모·삼촌은 나 화면에 몰아넣지 않는다', () => {
    const store = syncAllViews({
      version: 2,
      activeView: 'self',
      views: {
        self: createViewTemplate('self'),
        paternal: createViewTemplate('paternal'),
        maternal: createViewTemplate('maternal'),
        spouse: createViewTemplate('spouse'),
      },
    });
    const next = rebaseStoreAroundPerson(store, 'me_sib2', 'self');
    const mother = next.views.self.me_mother;
    const maternalSibs = Object.values(next.views.self)
      .filter(
        person =>
          person.id !== 'me_mother' &&
          person.fatherId === mother?.fatherId &&
          person.motherId === mother?.motherId,
      )
      .map(person => person.name);
    expect(maternalSibs).not.toEqual(expect.arrayContaining(['이모', '삼촌', '외삼촌']));
  });

  it('아들 기준이면 실데이터 배우자 형제만 외가 프리셋에 실린다', () => {
    const store = syncAllViews({
      version: 2,
      activeView: 'self',
      views: {
        self: createViewTemplate('self'),
        paternal: createViewTemplate('paternal'),
        maternal: createViewTemplate('maternal'),
        spouse: createViewTemplate('spouse'),
      },
    });
    const next = rebaseStoreAroundPerson(store, 'me_c2_0', 'self');
    const mother = next.views.self.me_mother;
    expect(mother?.name).toBe('어머니');
    expect(next.views.self.me_mgf?.name).toMatch(/외할아버지/);
    const maternalSibs = Object.values(next.views.self)
      .filter(
        person =>
          person.id !== 'me_mother' &&
          !!mother?.fatherId &&
          person.fatherId === mother.fatherId &&
          person.motherId === mother.motherId,
      )
      .map(person => person.name);
    expect(maternalSibs.join(',')).not.toMatch(/배우자 형|배우자 오빠/);
    expect(Object.keys(next.views.maternal).length).toBeGreaterThan(0);
  });

  it('실데이터 배우자가 없으면 배우자 집안을 만들지 않는다', () => {
    const self = createViewTemplate('self');
    delete self.me_sib2_sp;
    self.me_sib2 = { ...self.me_sib2, spouseId: undefined };
    const next = rebaseStoreAroundPerson(baseStore(self), 'me_sib2', 'self');
    expect(Object.keys(next.views.spouse)).toHaveLength(0);
  });

  it('증조가 있으면 아들 기준에서 한 세대를 더 올린다', () => {
    const self = familyWithSiblingsAndKids();
    self.me_ggf = p({
      id: 'me_ggf',
      name: '증조실명',
      gender: 'male',
      spouseId: 'me_ggm',
    });
    self.me_ggm = p({
      id: 'me_ggm',
      name: '증조할머니실명',
      gender: 'female',
      spouseId: 'me_ggf',
    });
    self.me_gf = { ...self.me_gf, fatherId: 'me_ggf', motherId: 'me_ggm' };

    const next = rebaseStoreAroundPerson(baseStore(self), 'me_c2_0', 'self');
    expect(next.views.self.me_sib2?.name).toBe('아들');
    expect(next.views.self.me_ggf?.name).toBe('친할아버지');
    const ggf = next.views.self.me_ggf;
    expect(ggf?.fatherId).toBeTruthy();
    expect(next.views.self[ggf!.fatherId!]?.name).toBe('증조실명');
  });
});
