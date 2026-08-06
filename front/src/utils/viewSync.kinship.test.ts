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
    expect(labels.pat_sib3_sp).toMatch(/매형|매부/);
  });

  it('labels focal couple children as 자식 in maternal view', () => {
    const store = syncedStore();
    const labels = buildViewKinshipLabels('maternal', store.views.maternal, store.views.self);

    expect(labels.mat_sib2).toBe('본인');
    expect(labels.mat_sib2_sp).toBe('배우자');
    expect(labels.mat_c2_0).toBe('자식');
    expect(labels.mat_c2_2).toBe('본인');
  });
});
