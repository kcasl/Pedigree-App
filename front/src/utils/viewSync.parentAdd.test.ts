import { createViewTemplate, slotIdsForView } from './standardTemplate';
import { resolveParentAdd, syncAllViews } from './viewSync';
import type { PedigreeStore } from '../types/lineage';
import type { Person } from '../types/pedigree';

describe('resolveParentAdd great-grandparents', () => {
  it('fills ggf/ggm slots when adding parents to 친할아버지', () => {
    const people = createViewTemplate('self');
    const slots = slotIdsForView('self');

    const fatherAdd = resolveParentAdd('self', people, slots.gf, 'father', 'person_tmp');
    expect(fatherAdd).toEqual(
      expect.objectContaining({
        status: 'ok',
        parentId: slots.ggf,
        linkChildId: slots.gf,
        useSlotId: true,
      }),
    );
  });

  it('adds 친할머니 parents onto 친할머니, not 친할아버지', () => {
    const people = createViewTemplate('self');
    const slots = slotIdsForView('self');

    const fromGrandmother = resolveParentAdd('self', people, slots.gm, 'mother', 'person_tmp');
    expect(fromGrandmother).toEqual(
      expect.objectContaining({
        status: 'ok',
        parentId: 'me_gm_m',
        linkChildId: slots.gm,
        useSlotId: true,
      }),
    );
    expect(fromGrandmother && fromGrandmother.status === 'ok' ? fromGrandmother.parentId : '').not.toBe(
      slots.ggm,
    );
  });

  it('fills mggf/mggm slots when adding parents to 외할아버지', () => {
    const people = createViewTemplate('self');
    const slots = slotIdsForView('self');

    const add = resolveParentAdd('self', people, slots.mgf, 'father', 'person_tmp');
    expect(add).toEqual(
      expect.objectContaining({
        status: 'ok',
        parentId: slots.mggf,
        linkChildId: slots.mgf,
        useSlotId: true,
      }),
    );
  });

  it('adds 외할머니 parents onto 외할머니, not 외할아버지', () => {
    const people = createViewTemplate('self');
    const slots = slotIdsForView('self');

    const add = resolveParentAdd('self', people, slots.mgm, 'father', 'person_tmp');
    expect(add).toEqual(
      expect.objectContaining({
        status: 'ok',
        parentId: 'me_mgm_f',
        linkChildId: slots.mgm,
        useSlotId: true,
      }),
    );
  });

  it('syncs self 증조 into paternal/maternal views', () => {
    const slots = slotIdsForView('self');
    const self = createViewTemplate('self');
    const ggf: Person = {
      id: slots.ggf,
      name: '증조할배',
      createdAt: '2020-01-01T00:00:00.000Z',
      gender: 'male',
      spouseId: slots.ggm,
    };
    const ggm: Person = {
      id: slots.ggm,
      name: '증조할매',
      createdAt: '2020-01-01T00:00:00.000Z',
      gender: 'female',
      spouseId: slots.ggf,
    };
    const mggf: Person = {
      id: slots.mggf,
      name: '외증조할배',
      createdAt: '2020-01-01T00:00:00.000Z',
      gender: 'male',
    };
    self[slots.ggf] = ggf;
    self[slots.ggm] = ggm;
    self[slots.mggf] = mggf;
    self[slots.gf] = { ...self[slots.gf], fatherId: slots.ggf, motherId: slots.ggm };
    self[slots.mgf] = { ...self[slots.mgf], fatherId: slots.mggf };

    const store: PedigreeStore = syncAllViews({
      activeView: 'self',
      version: 2,
      views: {
        self,
        paternal: createViewTemplate('paternal'),
        maternal: createViewTemplate('maternal'),
        spouse: createViewTemplate('spouse'),
      },
    });

    expect(store.views.paternal.pat_gf.name).toBe('증조할배');
    expect(store.views.paternal.pat_gm.name).toBe('증조할매');
    expect(store.views.maternal.mat_gf.name).toBe('외증조할배');
  });

  it('syncs 친할머니 본가 부모 to paternal 친할머니, not 친할아버지', () => {
    const slots = slotIdsForView('self');
    const pat = slotIdsForView('paternal');
    const self = createViewTemplate('self');
    self.me_gm_f = {
      id: 'me_gm_f',
      name: '친할머니아버지',
      createdAt: '2020-01-01T00:00:00.000Z',
      gender: 'male',
      spouseId: 'me_gm_m',
    };
    self.me_gm_m = {
      id: 'me_gm_m',
      name: '친할머니어머니',
      createdAt: '2020-01-01T00:00:00.000Z',
      gender: 'female',
      spouseId: 'me_gm_f',
    };
    self[slots.gm] = {
      ...self[slots.gm],
      fatherId: 'me_gm_f',
      motherId: 'me_gm_m',
    };

    const store: PedigreeStore = syncAllViews({
      activeView: 'self',
      version: 2,
      views: {
        self,
        paternal: createViewTemplate('paternal'),
        maternal: createViewTemplate('maternal'),
        spouse: createViewTemplate('spouse'),
      },
    });

    expect(store.views.self[slots.gf].fatherId).not.toBe('me_gm_f');
    expect(store.views.paternal[pat.mother]?.fatherId).toBe('pat_gm_f');
    expect(store.views.paternal[pat.father]?.fatherId).not.toBe('pat_gm_f');
    expect(store.views.paternal.pat_gm_f?.name).toBe('친할머니아버지');
  });

  it('assigns four distinct parent couples for 조부·조모·외조부·외조모', () => {
    const people = createViewTemplate('self');
    const slots = slotIdsForView('self');
    const ids = [
      resolveParentAdd('self', people, slots.gf, 'father', 'tmp1'),
      resolveParentAdd('self', people, slots.gm, 'father', 'tmp2'),
      resolveParentAdd('self', people, slots.mgf, 'father', 'tmp3'),
      resolveParentAdd('self', people, slots.mgm, 'father', 'tmp4'),
    ]
      .filter((r): r is Extract<typeof r, { status: 'ok' }> => !!r && r.status === 'ok')
      .map(r => r.parentId);

    expect(new Set(ids).size).toBe(4);
    expect(ids).toEqual([slots.ggf, 'me_gm_f', slots.mggf, 'me_mgm_f']);
    expect(
      [
        resolveParentAdd('self', people, slots.gf, 'father', 'tmp1'),
        resolveParentAdd('self', people, slots.gm, 'father', 'tmp2'),
        resolveParentAdd('self', people, slots.mgf, 'father', 'tmp3'),
        resolveParentAdd('self', people, slots.mgm, 'father', 'tmp4'),
      ].map(r => (r && r.status === 'ok' ? r.linkChildId : null)),
    ).toEqual([slots.gf, slots.gm, slots.mgf, slots.mgm]);
  });
});
