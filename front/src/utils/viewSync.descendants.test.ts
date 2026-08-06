import { syncAllViews, syncStoreAfterEdit } from './viewSync';
import { createViewTemplate, slotIdsForView } from './standardTemplate';
import { collectCoupleChildIds } from './birthOrder';
import type { PedigreeStore } from '../types/lineage';
import type { Person } from '../types/pedigree';

function baseStore(): PedigreeStore {
  return {
    activeView: 'self',
    version: 2,
    views: {
      self: createViewTemplate('self'),
      paternal: createViewTemplate('paternal'),
      maternal: createViewTemplate('maternal'),
      spouse: createViewTemplate('spouse'),
    },
  };
}

describe('sync focal descendants self ↔ lineage', () => {
  it('copies my child and grandchild into paternal/maternal under mapped sibling', () => {
    const me = slotIdsForView('self');
    let store = syncAllViews(baseStore());
    const self = { ...store.views.self };
    const sonId = 'me_c2_0';
    const gcId = 'me_gc2_0';
    expect(self[sonId]).toBeTruthy();
    expect(self[gcId]).toBeTruthy();

    self[sonId] = { ...self[sonId], name: '아들이름', photoUri: 'file://son.jpg' };
    self[gcId] = { ...self[gcId], name: '손자이름', photoUri: 'file://gc.jpg' };

    // 손자 아래 자녀 추가
    const ggc: Person = {
      id: 'person_ggc_test',
      name: '증손',
      createdAt: '2024-01-01T00:00:00.000Z',
      gender: 'male',
      fatherId: gcId,
    };
    self[ggc.id] = ggc;

    store = syncAllViews({ ...store, views: { ...store.views, self } });

    const siblingIds = collectCoupleChildIds(
      store.views.self,
      me.father,
      me.mother,
    ).sort(); // birth sort applied inside sync; find index of 나
    const selfSiblings = Object.values(store.views.self)
      .filter(p => p.fatherId === me.father && p.motherId === me.mother)
      .map(p => p.id);

    // 재현: sync 후 친가에서 나에 해당하는 자녀 아래 자손 존재
    const pat = store.views.paternal;
    const mat = store.views.maternal;
    const patDesc = Object.values(pat).find(p => p.name === '아들이름');
    const matDesc = Object.values(mat).find(p => p.name === '아들이름');
    expect(patDesc?.photoUri).toBe('file://son.jpg');
    expect(matDesc?.photoUri).toBe('file://son.jpg');

    const patGc = Object.values(pat).find(p => p.name === '손자이름');
    const matGc = Object.values(mat).find(p => p.name === '손자이름');
    expect(patGc?.photoUri).toBe('file://gc.jpg');
    expect(matGc?.photoUri).toBe('file://gc.jpg');

    const patGgc = Object.values(pat).find(p => p.name === '증손');
    const matGgc = Object.values(mat).find(p => p.name === '증손');
    expect(patGgc).toBeTruthy();
    expect(matGgc).toBeTruthy();
    expect(selfSiblings.length).toBeGreaterThan(0);
    expect(siblingIds.length).toBeGreaterThan(0);
  });

  it('propagates paternal descendant edits back to self', () => {
    let store = syncAllViews(baseStore());
    const self = { ...store.views.self };
    self.me_c2_0 = { ...self.me_c2_0, name: '동기화아들' };
    store = syncAllViews({ ...store, views: { ...store.views, self } });

    const patSon = Object.values(store.views.paternal).find(p => p.name === '동기화아들');
    expect(patSon).toBeTruthy();
    if (!patSon) return;

    const nextPat = {
      ...store.views.paternal,
      [patSon.id]: { ...patSon, name: '친가에서수정', note: 'n1' },
    };
    store = syncStoreAfterEdit(store, 'paternal', nextPat);
    expect(store.views.self.me_c2_0.name).toBe('친가에서수정');
    expect(store.views.self.me_c2_0.note).toBe('n1');
  });
});
