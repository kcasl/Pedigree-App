import { kinshipLabelToDisplayName } from './kinship';
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

describe('buildViewKinshipLabels — 모든 보기 나 시점', () => {
  it('self: 형제·인척은 나 기준 형/형수/매형/제수', () => {
    const store = syncedStore();
    const labels = buildViewKinshipLabels('self', store.views.self);

    expect(labels.me_sib2).toBe('본인');
    expect(labels.me_sib2_sp).toBe('배우자');
    expect(labels.me_sib0).toBe('형');
    expect(labels.me_sib0_sp).toBe('형수');
    expect(labels.me_sib1).toBe('형');
    expect(labels.me_sib1_sp).toBe('형수');
    expect(labels.me_sib3).toBe('누나');
    expect(labels.me_sib3_sp).toBe('매형');
    expect(labels.me_sib4).toBe('남동생');
    expect(labels.me_sib4_sp).toBe('제수');
    expect(labels.me_father).toBe('부');
    expect(labels.me_mother).toBe('모');
    expect(kinshipLabelToDisplayName(labels.me_father, store.views.self.me_father)).toBe(
      '아버지',
    );
  });

  it('paternal: 가운데는 아버지이지 나가 아니다', () => {
    const store = syncedStore();
    const labels = buildViewKinshipLabels('paternal', store.views.paternal, store.views.self);

    expect(labels.pat_sib2).toBe('부');
    expect(labels.pat_sib2_sp).toBe('모');
    expect(kinshipLabelToDisplayName(labels.pat_sib2, store.views.paternal.pat_sib2)).toBe(
      '아버지',
    );
    expect(kinshipLabelToDisplayName(labels.pat_sib2_sp, store.views.paternal.pat_sib2_sp)).toBe(
      '어머니',
    );
    expect(labels.pat_c2_2).toBe('본인');
    expect(labels.pat_sib1).toBe('큰아버지');
    expect(labels.pat_sib1_sp).toBe('큰어머니');
    expect(labels.pat_sib3).toBe('고모');
    expect(labels.pat_sib3_sp).toBe('고모부');
    expect(labels.pat_father).toBe('조부');
    expect(labels.pat_mother).toBe('조모');
  });

  it('paternal: 아버지 아래 형제는 나 기준 형/누나/동생', () => {
    const store = syncedStore();
    const labels = buildViewKinshipLabels('paternal', store.views.paternal, store.views.self);

    expect(labels.pat_c2_0).toBe('형');
    expect(labels.pat_c2_1).toBe('형');
    expect(labels.pat_c2_2).toBe('본인');
    expect(labels.pat_c2_3).toBe('누나');
    expect(labels.pat_c2_4).toBe('남동생');
  });

  it('maternal: 가운데는 어머니, 외삼촌/외숙모/이모/이모부', () => {
    const store = syncedStore();
    const labels = buildViewKinshipLabels('maternal', store.views.maternal, store.views.self);

    expect(labels.mat_sib2).toBe('모');
    expect(labels.mat_sib2_sp).toBe('부');
    expect(labels.mat_c2_2).toBe('본인');
    expect(labels.mat_sib1).toBe('외삼촌');
    expect(labels.mat_sib1_sp).toBe('외숙모');
    expect(labels.mat_sib3).toBe('이모');
    expect(labels.mat_sib3_sp).toBe('이모부');
    expect(labels.mat_father).toBe('외조부');
    expect(labels.mat_mother).toBe('외조모');
  });

  it('spouse: 가운데는 배우자, 옆이 나, 형제 배우자는 동서', () => {
    const store = syncedStore();
    const labels = buildViewKinshipLabels('spouse', store.views.spouse, store.views.self);

    expect(labels.spo_sib2).toBe('배우자');
    expect(labels.spo_sib2_sp).toBe('본인');
    expect(labels.spo_sib0_sp).toBe('동서');
    expect(labels.spo_sib1_sp).toBe('동서');
    expect(labels.spo_sib3_sp).toBe('동서');
    expect(labels.spo_sib4_sp).toBe('동서');
    expect(labels.spo_sib0).toBe('처남');
    expect(labels.spo_sib3).toMatch(/처형|처제/);
    expect(labels.spo_sib4).toBe('처남');
  });

  it('spouse: 여성 나는 시누이·시동생·시아주버니', () => {
    const store = syncedStore();
    store.views.self.me_sib2 = { ...store.views.self.me_sib2, gender: 'female' };
    store.views.spouse.spo_sib2_sp = { ...store.views.spouse.spo_sib2_sp, gender: 'female' };
    const labels = buildViewKinshipLabels('spouse', store.views.spouse, store.views.self);

    expect(labels.spo_sib2_sp).toBe('본인');
    expect(labels.spo_sib2).toBe('배우자');
    expect(labels.spo_sib0).toMatch(/시아주버니|시동생/);
    expect(labels.spo_sib3).toBe('시누이');
    expect(labels.spo_sib4).toBe('시동생');
    expect(labels.spo_sib0_sp).toBe('동서');
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

describe('default template names — 나 시점 족보명', () => {
  it('self keeps 형수·매형·제수 for sibling spouses', () => {
    const self = createViewTemplate('self');
    expect(self.me_sib0_sp.name).toBe('형수');
    expect(self.me_sib3_sp.name).toBe('매형');
    expect(self.me_sib4_sp.name).toBe('제수');
    expect(self.me_sib2.name).toBe('나');
    expect(self.me_sib2_sp.name).toBe('배우자');
  });

  it('paternal center is 아버지, uncles are 큰아버지/고모', () => {
    const pat = createViewTemplate('paternal');
    expect(pat.pat_sib2.name).toBe('아버지');
    expect(pat.pat_sib2_sp.name).toBe('어머니');
    expect(pat.pat_sib1.name).toBe('큰아버지');
    expect(pat.pat_sib1_sp.name).toBe('큰어머니');
    expect(pat.pat_sib3.name).toBe('고모');
    expect(pat.pat_sib3_sp.name).toBe('고모부');
    expect(pat.pat_c2_0).toBeUndefined();
  });

  it('maternal uses 외삼촌/외숙모/이모, not 나 as mother', () => {
    const mat = createViewTemplate('maternal');
    expect(mat.mat_sib2.name).toBe('어머니');
    expect(mat.mat_sib2_sp.name).toBe('아버지');
    expect(mat.mat_sib1.name).toBe('외삼촌');
    expect(mat.mat_sib1_sp.name).toBe('외숙모');
    expect(mat.mat_sib3.name).toBe('이모');
    expect(mat.mat_sib3_sp.name).toBe('이모부');
    expect(mat.mat_mgf.name).toBe('증조할아버지');
    expect(mat.mat_mgm.name).toBe('증조할머니');
  });

  it('spouse sibling spouses are 동서, not 형수/제수', () => {
    const spo = createViewTemplate('spouse');
    expect(spo.spo_sib2.name).toBe('배우자');
    expect(spo.spo_sib2_sp.name).toBe('나');
    expect(spo.spo_sib0_sp.name).toBe('동서');
    expect(spo.spo_sib1_sp.name).toBe('동서');
    expect(spo.spo_sib3_sp.name).toBe('동서');
    expect(spo.spo_sib4_sp.name).toBe('동서');
    expect(spo.spo_c2_0.name).toBe('나의 아들');
    expect(spo.spo_c0_0.name).toBe('배우자 형의 아들');
  });
});
