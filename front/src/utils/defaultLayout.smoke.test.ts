import { createDefaultStore, createViewTemplate, SELF_SLOT_INDEX, slotIdsForView } from './standardTemplate';
import { buildStandardPedigreeLayout } from './standardLayout';
import { syncAllViews } from './viewSync';
import type { Person } from '../types/pedigree';

describe('default pedigree smoke', () => {
  it('creates a non-empty self view layout', () => {
    const store = syncAllViews(createDefaultStore('2020-01-01T00:00:00.000Z'));
    const people = store.views.self;
    expect(Object.keys(people).length).toBeGreaterThan(5);

    const layout = buildStandardPedigreeLayout(people, { view: 'self' });
    expect(layout.nodes.length).toBeGreaterThan(5);
    expect(layout.nodeById[layout.selfId]).toBeTruthy();
    for (const n of layout.nodes) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
      expect(n.width).toBeGreaterThan(0);
      expect(n.height).toBeGreaterThan(0);
    }
  });

  it('places 조부·조모·외조부·외조모 parents on one row without overlap', () => {
    const people = createViewTemplate('self', '2020-01-01T00:00:00.000Z');
    const slots = slotIdsForView('self');
    const p = (id: string, name: string, extra: Partial<Person> = {}): Person => ({
      id,
      name,
      createdAt: '2020-01-01T00:00:00.000Z',
      gender: 'unknown',
      ...extra,
    });

    people[slots.ggf] = p(slots.ggf, '조부아버지', { spouseId: slots.ggm, gender: 'male' });
    people[slots.ggm] = p(slots.ggm, '조부어머니', { spouseId: slots.ggf, gender: 'female' });
    people[slots.gf] = { ...people[slots.gf], fatherId: slots.ggf, motherId: slots.ggm };

    people.me_gm_f = p('me_gm_f', '조모아버지', { spouseId: 'me_gm_m', gender: 'male' });
    people.me_gm_m = p('me_gm_m', '조모어머니', { spouseId: 'me_gm_f', gender: 'female' });
    people[slots.gm] = { ...people[slots.gm], fatherId: 'me_gm_f', motherId: 'me_gm_m' };

    people[slots.mggf] = p(slots.mggf, '외조부아버지', { spouseId: slots.mggm, gender: 'male' });
    people[slots.mggm] = p(slots.mggm, '외조부어머니', { spouseId: slots.mggf, gender: 'female' });
    people[slots.mgf] = { ...people[slots.mgf], fatherId: slots.mggf, motherId: slots.mggm };

    people.me_mgm_f = p('me_mgm_f', '외조모아버지', { spouseId: 'me_mgm_m', gender: 'male' });
    people.me_mgm_m = p('me_mgm_m', '외조모어머니', { spouseId: 'me_mgm_f', gender: 'female' });
    people[slots.mgm] = { ...people[slots.mgm], fatherId: 'me_mgm_f', motherId: 'me_mgm_m' };

    const layout = buildStandardPedigreeLayout(people, { view: 'self' });
    const parentIds = [
      slots.ggf,
      slots.ggm,
      'me_gm_f',
      'me_gm_m',
      slots.mggf,
      slots.mggm,
      'me_mgm_f',
      'me_mgm_m',
    ];
    parentIds.forEach(id => {
      expect(layout.nodeById[id]).toBeTruthy();
    });

    const y = layout.nodeById[slots.ggf].y;
    parentIds.forEach(id => {
      expect(layout.nodeById[id].y).toBe(y);
    });

    const boxes = parentIds.map(id => layout.nodeById[id]);
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        const overlap = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
        expect(overlap).toBeLessThanOrEqual(0);
      }
    }

    expect(people[slots.gf].fatherId).toBe(slots.ggf);
    expect(people[slots.gm].fatherId).toBe('me_gm_f');
    expect(people[slots.mgf].fatherId).toBe(slots.mggf);
    expect(people[slots.mgm].fatherId).toBe('me_mgm_f');

    const mid = (a: string, b: string) =>
      (layout.nodeById[a].x + layout.nodeById[a].width / 2 +
        layout.nodeById[b].x + layout.nodeById[b].width / 2) /
      2;
    const childX = (id: string) => layout.nodeById[id].x + layout.nodeById[id].width / 2;
    expect(mid(slots.ggf, slots.ggm)).toBeCloseTo(childX(slots.gf), 0);
    expect(mid('me_gm_f', 'me_gm_m')).toBeCloseTo(childX(slots.gm), 0);
    expect(mid(slots.mggf, slots.mggm)).toBeCloseTo(childX(slots.mgf), 0);
    expect(mid('me_mgm_f', 'me_mgm_m')).toBeCloseTo(childX(slots.mgm), 0);

    expect(layout.nodeById[slots.gf].x + layout.nodeById[slots.gf].width).toBeLessThanOrEqual(
      layout.nodeById[slots.gm].x,
    );
    expect(layout.nodeById[slots.gm].x + layout.nodeById[slots.gm].width).toBeLessThanOrEqual(
      layout.nodeById[slots.mgf].x,
    );
  });

  it('keeps 나 centered; siblings without birth dates stay on their original side', () => {
    const people = createViewTemplate('self', '2020-01-01T00:00:00.000Z');
    const slots = slotIdsForView('self');
    people[slots.siblings[0].blood] = {
      ...people[slots.siblings[0].blood],
      birthDate: '1980-01-01',
    };
    people[slots.selfId] = { ...people[slots.selfId], birthDate: '1988-01-01' };
    people[slots.siblings[4].blood] = {
      ...people[slots.siblings[4].blood],
      birthDate: '1992-01-01',
    };

    const layout = buildStandardPedigreeLayout(people, { view: 'self' });
    const meX = layout.nodeById[slots.selfId].x;
    expect(layout.nodeById[slots.siblings[1].blood].x).toBeLessThan(meX);
    expect(layout.nodeById[slots.siblings[0].blood].x).toBeLessThan(meX);
    expect(layout.nodeById[slots.siblings[3].blood].x).toBeLessThan(meX);
    expect(layout.nodeById[slots.siblings[4].blood].x).toBeGreaterThan(meX);
  });

  it('packs single siblings tightly and stacks 조부모 on the parent couple', () => {
    const people = createViewTemplate('self', '2020-01-01T00:00:00.000Z');
    const slots = slotIdsForView('self');
    const drop = (id?: string) => {
      if (id) delete people[id];
    };
    drop(slots.siblings[0].blood);
    drop(slots.siblings[0].spouse);
    drop(slots.siblings[1].blood);
    drop(slots.siblings[1].spouse);
    drop(slots.siblings[4].blood);
    drop(slots.siblings[4].spouse);
    drop(slots.siblings[3].spouse);
    drop(slots.spouseId);
    people[slots.selfId] = { ...people[slots.selfId], spouseId: undefined };
    people[slots.siblings[3].blood] = {
      ...people[slots.siblings[3].blood],
      spouseId: undefined,
    };
    drop(slots.mgf);
    drop(slots.mgm);
    for (const id of Object.keys(people)) {
      const person = people[id];
      if (
        person.fatherId === slots.selfId ||
        person.motherId === slots.selfId ||
        person.fatherId === slots.siblings[3].blood ||
        person.motherId === slots.siblings[3].blood
      ) {
        drop(id);
      }
    }

    const layout = buildStandardPedigreeLayout(people, { view: 'self' });
    const sister = layout.nodeById[slots.siblings[3].blood];
    const me = layout.nodeById[slots.selfId];
    expect(sister).toBeTruthy();
    expect(me).toBeTruthy();
    const space = me.x - (sister.x + sister.width);
    expect(space).toBeGreaterThan(0);
    expect(space).toBeLessThan(120);

    const father = layout.nodeById[slots.father];
    const mother = layout.nodeById[slots.mother];
    const gf = layout.nodeById[slots.gf];
    expect(gf.x).toBeCloseTo(father.x, 0);
    const parentMid = (father.x + father.width / 2 + mother.x + mother.width / 2) / 2;
    const groupLeft = sister.x;
    const groupRight = me.x + me.width;
    expect((groupLeft + groupRight) / 2).toBeCloseTo(parentMid, 0);
  });

  it('centers a real sibling pair under the parent couple', () => {
    const people = createViewTemplate('self', '2020-01-01T00:00:00.000Z');
    const slots = slotIdsForView('self');
    const drop = (id?: string) => {
      if (id) delete people[id];
    };
    drop(slots.siblings[0].blood);
    drop(slots.siblings[0].spouse);
    drop(slots.siblings[1].blood);
    drop(slots.siblings[1].spouse);
    drop(slots.siblings[4].blood);
    drop(slots.siblings[4].spouse);
    drop(slots.siblings[3].blood);
    drop(slots.siblings[3].spouse);
    drop(slots.spouseId);
    people[slots.selfId] = { ...people[slots.selfId], spouseId: undefined };
    const daughterId = slots.children[SELF_SLOT_INDEX][1];
    people[daughterId] = {
      ...people[daughterId],
      fatherId: slots.father,
      motherId: slots.mother,
      birthDate: '2008-06-01',
      name: '실명딸',
    };
    people[slots.selfId] = { ...people[slots.selfId], birthDate: '2010-01-01' };
    drop(slots.mgf);
    drop(slots.mgm);
    for (const id of Object.keys(people)) {
      const person = people[id];
      if (
        person.id !== daughterId &&
        (person.fatherId === slots.selfId || person.motherId === slots.selfId)
      ) {
        drop(id);
      }
    }

    const layout = buildStandardPedigreeLayout(people, { view: 'self' });
    const daughter = layout.nodeById[daughterId];
    const me = layout.nodeById[slots.selfId];
    const father = layout.nodeById[slots.father];
    const mother = layout.nodeById[slots.mother];
    expect(daughter).toBeTruthy();
    expect(me).toBeTruthy();
    expect(daughter.x).toBeLessThan(me.x);
    const parentMid = (father.x + father.width / 2 + mother.x + mother.width / 2) / 2;
    const groupMid = (daughter.x + me.x + me.width) / 2;
    expect(groupMid).toBeCloseTo(parentMid, 0);
  });

  it('places older paternal uncles left of father and younger ones right of mother', () => {
    const people = createViewTemplate('self', '2020-01-01T00:00:00.000Z');
    const slots = slotIdsForView('self');
    const p = (id: string, name: string, extra: Partial<Person> = {}): Person => ({
      id,
      name,
      createdAt: '2020-01-01T00:00:00.000Z',
      gender: 'unknown',
      ...extra,
    });
    people.me_psib_hyung = p('me_psib_hyung', '형', {
      gender: 'male',
      fatherId: slots.gf,
      motherId: slots.gm,
      spouseId: 'me_psib_hyung_sp',
    });
    people.me_psib_hyung_sp = p('me_psib_hyung_sp', '형수', {
      gender: 'female',
      spouseId: 'me_psib_hyung',
    });
    people.me_psib_keun = p('me_psib_keun', '큰형', {
      gender: 'male',
      fatherId: slots.gf,
      motherId: slots.gm,
    });
    people.me_psib_dong = p('me_psib_dong', '남동생', {
      gender: 'male',
      fatherId: slots.gf,
      motherId: slots.gm,
    });
    people.me_cousin = p('me_cousin', '형의 아들', {
      gender: 'male',
      fatherId: 'me_psib_hyung',
      motherId: 'me_psib_hyung_sp',
    });

    const layout = buildStandardPedigreeLayout(people, { view: 'self' });
    const father = layout.nodeById[slots.father];
    const mother = layout.nodeById[slots.mother];
    const keun = layout.nodeById.me_psib_keun;
    const hyung = layout.nodeById.me_psib_hyung;
    const dong = layout.nodeById.me_psib_dong;
    const cousin = layout.nodeById.me_cousin;
    expect(keun).toBeTruthy();
    expect(hyung).toBeTruthy();
    expect(dong).toBeTruthy();
    expect(cousin).toBeTruthy();
    expect(keun.x).toBeLessThan(hyung.x);
    expect(hyung.x + hyung.width).toBeLessThan(father.x);
    expect(dong.x).toBeGreaterThan(mother.x);
    expect(cousin.y).toBeGreaterThan(hyung.y);
    expect(Math.abs(cousin.x + cousin.width / 2 - (hyung.x + hyung.width / 2))).toBeLessThan(200);
  });

  it('places 외가 이모 to the right of 어머니', () => {
    const people = createViewTemplate('self', '2020-01-01T00:00:00.000Z');
    const slots = slotIdsForView('self');
    const p = (id: string, name: string, extra: Partial<Person> = {}): Person => ({
      id,
      name,
      createdAt: '2020-01-01T00:00:00.000Z',
      gender: 'unknown',
      ...extra,
    });
    people.me_msib_emo = p('me_msib_emo', '이모', {
      gender: 'female',
      fatherId: slots.mgf,
      motherId: slots.mgm,
    });
    people.me_msib_sam = p('me_msib_sam', '삼촌', {
      gender: 'male',
      fatherId: slots.mgf,
      motherId: slots.mgm,
    });
    people.me_cousin_emo = p('me_cousin_emo', '이모의 아들', {
      gender: 'male',
      fatherId: 'me_msib_emo',
    });

    const layout = buildStandardPedigreeLayout(people, { view: 'self' });
    const mother = layout.nodeById[slots.mother];
    const emo = layout.nodeById.me_msib_emo;
    const sam = layout.nodeById.me_msib_sam;
    const cousin = layout.nodeById.me_cousin_emo;
    const mgf = layout.nodeById[slots.mgf];
    expect(emo).toBeTruthy();
    expect(sam).toBeTruthy();
    expect(mgf).toBeTruthy();
    expect(emo.x).toBeGreaterThan(mother.x);
    expect(sam.x).toBeGreaterThan(mother.x);
    expect(cousin).toBeTruthy();
    expect(cousin.y).toBeGreaterThan(emo.y);
  });
});
