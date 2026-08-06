import { createViewTemplate, slotIdsForView } from './standardTemplate';
import { resolveParentAdd, syncAllViews } from './viewSync';
import type { PedigreeStore } from '../types/lineage';
import type { Person } from '../types/pedigree';

describe('resolveParentAdd great-grandparents', () => {
  it('fills ggf/ggm slots when adding parents to 친할아버지/친할머니', () => {
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

    const fromGrandmother = resolveParentAdd('self', people, slots.gm, 'mother', 'person_tmp');
    expect(fromGrandmother).toEqual(
      expect.objectContaining({
        status: 'ok',
        parentId: slots.ggm,
        linkChildId: slots.gf,
        useSlotId: true,
      }),
    );
  });

  it('fills mggf/mggm slots when adding parents to 외조부모', () => {
    const people = createViewTemplate('self');
    const slots = slotIdsForView('self');

    const add = resolveParentAdd('self', people, slots.mgm, 'father', 'person_tmp');
    expect(add).toEqual(
      expect.objectContaining({
        status: 'ok',
        parentId: slots.mggf,
        linkChildId: slots.mgf,
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
});
