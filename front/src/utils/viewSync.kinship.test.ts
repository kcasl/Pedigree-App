import { buildViewKinshipLabels, syncAllViews } from './viewSync';
import { createViewTemplate } from './standardTemplate';
import type { PedigreeStore } from '../types/lineage';

function syncedStore(): PedigreeStore {
  return syncAllViews({
    activeView: 'self',
    version: 2,
    views: {
      self: createViewTemplate('self'),
      paternal: createViewTemplate('paternal'),
      maternal: createViewTemplate('maternal'),
      spouse: createViewTemplate('spouse'),
    },
  });
}

describe('buildViewKinshipLabels lineage views', () => {
  it('labels focal couple children as 자식 in paternal view', () => {
    const store = syncedStore();
    const labels = buildViewKinshipLabels('paternal', store.views.paternal, store.views.self);

    expect(labels.pat_sib2).toBe('본인');
    expect(labels.pat_sib2_sp).toBe('배우자');
    expect(labels.pat_c2_0).toBe('자식');
    expect(labels.pat_c2_1).toBe('자식');
    expect(labels.pat_c2_2).toBe('본인');
  });

  it('labels uncle and aunt spouses with specific in-law terms in paternal view', () => {
    const store = syncedStore();
    const labels = buildViewKinshipLabels('paternal', store.views.paternal, store.views.self);

    expect(labels.pat_sib1_sp).toBe('형수');
    expect(labels.pat_sib3_sp).toMatch(/매형|매부|매제/);
  });

  it('labels paternal uncles as 큰아버지/삼촌 and cousins as 사촌 in self view', () => {
    const store = syncedStore();
    const self = store.views.self;
    self.me_father = { ...self.me_father, birthDate: '1960-01-01' };
    self.me_psib_0 = {
      id: 'me_psib_0',
      name: '큰아버지실명',
      createdAt: '2020-01-01T00:00:00.000Z',
      gender: 'male',
      fatherId: 'me_gf',
      motherId: 'me_gm',
      birthDate: '1955-01-01',
      spouseId: 'me_psib_0_sp',
    };
    self.me_psib_0_sp = {
      id: 'me_psib_0_sp',
      name: '큰어머니',
      createdAt: '2020-01-01T00:00:00.000Z',
      gender: 'female',
      spouseId: 'me_psib_0',
    };
    self.me_psib_0_c0 = {
      id: 'me_psib_0_c0',
      name: '사촌실명',
      createdAt: '2020-01-01T00:00:00.000Z',
      gender: 'male',
      fatherId: 'me_psib_0',
      motherId: 'me_psib_0_sp',
    };
    store.views.self = self;
    const labels = buildViewKinshipLabels('self', store.views.self);
    expect(labels.me_psib_0).toBe('큰아버지');
    expect(labels.me_psib_0_c0).toBe('사촌');
  });

  it('labels default siblings by side when birth dates are missing', () => {
    const store = syncedStore();
    const labels = buildViewKinshipLabels('self', store.views.self);
    expect(labels.me_sib0).toBe('형');
    expect(labels.me_sib1).toBe('형');
    expect(labels.me_sib3).toBe('누나');
    expect(labels.me_sib4).toBe('남동생');
  });
});
