import {
  allocateChildId,
  allocateSiblingId,
  canAddSiblingFromNode,
  resolveSiblingAdd,
  syncAllViews,
} from './viewSync';
import { createViewTemplate, slotIdsForView } from './standardTemplate';
import { buildStandardPedigreeLayout } from './standardLayout';
import type { ActiveView } from '../types/lineage';
import type { Person, PersonId } from '../types/pedigree';

function p(id: PersonId, extra: Partial<Person> = {}): Person {
  return {
    id,
    name: extra.name ?? id,
    createdAt: extra.createdAt ?? '2020-01-01T00:00:00.000Z',
    gender: extra.gender ?? 'unknown',
    ...extra,
  };
}

function incoming(id = 'p_tmp'): Person {
  return p(id, { name: '새친척', gender: 'male' });
}

describe('sibling/child add slots across views', () => {
  it.each(['self', 'paternal', 'maternal', 'spouse'] as ActiveView[])(
    '%s: sibling of focal generation fills an empty sibling slot or extra_L/R',
    view => {
      const people = createViewTemplate(view);
      const slots = slotIdsForView(view);
      expect(canAddSiblingFromNode(view, slots.selfId)).toBe(true);
      const resolved = resolveSiblingAdd(view, people, slots.selfId);
      expect(resolved?.target).toBe('couple_child');
      const id = allocateSiblingId(view, people, resolved!, incoming());
      if (view === 'paternal' || view === 'maternal') {
        expect(id).toBe(slots.siblings[0].blood);
      } else {
        expect(id).toMatch(/_sib_extra_/);
      }
    },
  );

  it('self: extra sibling is laid out on the sibling row without overlap', () => {
    const people = createViewTemplate('self');
    const slots = slotIdsForView('self');
    const resolved = resolveSiblingAdd('self', people, slots.selfId);
    const id = allocateSiblingId('self', people, resolved!, incoming());
    people[id] = p(id, {
      name: '추가동생',
      gender: 'male',
      fatherId: slots.father,
      motherId: slots.mother,
    });

    const layout = buildStandardPedigreeLayout(people, { view: 'self' });
    expect(layout.nodeById[id]).toBeTruthy();
    expect(layout.nodeById[id].y).toBe(layout.nodeById[slots.selfId].y);
    expect(layout.nodeById[id].x).toBeGreaterThan(layout.nodeById[slots.selfId].x);

    const row = layout.nodes.filter(n => n.y === layout.nodeById[slots.selfId].y);
    for (let i = 0; i < row.length; i += 1) {
      for (let j = i + 1; j < row.length; j += 1) {
        const a = row[i];
        const b = row[j];
        const overlap = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
        expect(overlap).toBeLessThanOrEqual(0);
      }
    }
  });

  it('paternal: adding a sibling of 아버지 fills 큰아버지/삼촌 슬롯', () => {
    const people = createViewTemplate('paternal');
    const slots = slotIdsForView('paternal');
    expect(canAddSiblingFromNode('paternal', slots.selfId)).toBe(true);
    const resolved = resolveSiblingAdd('paternal', people, slots.selfId);
    expect(resolved?.target).toBe('couple_child');
    expect(allocateSiblingId('paternal', people, resolved!, incoming())).toBe(
      slots.siblings[0].blood,
    );
  });

  it('self: adding a sibling of 아들 uses the next child slot', () => {
    const people = createViewTemplate('self');
    const slots = slotIdsForView('self');
    const sonId = slots.children[2][0];
    const resolved = resolveSiblingAdd('self', people, sonId);
    expect(resolved?.target).toBe('blood');
    const id = allocateSiblingId('self', people, resolved!, incoming());
    expect(id).toBe(`${slots.children[2][0].replace(/_0$/, '_2')}`);
    expect(id).toBe('me_c2_2');
  });

  it('allocateChildId fills empty child slots then extra indices', () => {
    const people = createViewTemplate('self');
    const slots = slotIdsForView('self');
    delete people[slots.children[2][1]];
    const first = allocateChildId('self', people, slots.selfId, incoming());
    expect(first).toBe(slots.children[2][1]);
    people[first] = p(first, { fatherId: slots.selfId, motherId: slots.spouseId });
    const second = allocateChildId('self', people, slots.selfId, incoming('p_tmp2'));
    expect(second).toBe('me_c2_2');
  });

  it('sync keeps extra self siblings visible in paternal/maternal layout', () => {
    const slots = slotIdsForView('self');
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
    const resolved = resolveSiblingAdd('self', store.views.self, slots.selfId);
    const id = allocateSiblingId('self', store.views.self, resolved!, incoming());
    store.views.self[id] = p(id, {
      name: '막내',
      gender: 'male',
      fatherId: slots.father,
      motherId: slots.mother,
    });
    const synced = syncAllViews(store);
    const patLayout = buildStandardPedigreeLayout(synced.views.paternal, {
      view: 'paternal',
    });
    const matLayout = buildStandardPedigreeLayout(synced.views.maternal, {
      view: 'maternal',
    });
    const named = (layout: ReturnType<typeof buildStandardPedigreeLayout>) =>
      Object.values(synced.views.paternal).some(person => person.name === '막내') &&
      layout.nodes.some(n => synced.views.paternal[n.id]?.name === '막내' || synced.views.maternal[n.id]?.name === '막내');
    expect(Object.values(synced.views.paternal).some(person => person.name === '막내')).toBe(
      true,
    );
    expect(Object.values(synced.views.maternal).some(person => person.name === '막내')).toBe(
      true,
    );
    expect(patLayout.nodes.length).toBeGreaterThan(5);
    expect(matLayout.nodes.length).toBeGreaterThan(5);
    expect(named(patLayout) || named(matLayout)).toBe(true);
  });
});
