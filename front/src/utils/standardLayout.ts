/**
 * SDD 참고 4세대 고정 슬롯 배치
 */

import type { ActiveView } from '../types/lineage';
import type { Person, PersonId } from '../types/pedigree';
import type { Edge, LayoutResult, PositionedNode } from './pedigreeLayout';
import {
  DEFAULT_CHILDREN_PER_COUPLE,
  DEFAULT_SIBLING_SLOTS,
  focalBloodId,
  SELF_SLOT_INDEX,
  slotIdsForView,
} from './standardTemplate';

export type StandardLayoutOptions = {
  view: ActiveView;
  cardWidth: number;
  cardHeight: number;
  spouseGap: number;
  coupleGap: number;
  rowGap: number;
  childGap: number;
  padding: number;
};

export const STANDARD_LAYOUT_DEFAULTS: StandardLayoutOptions = {
  view: 'self',
  cardWidth: 158,
  cardHeight: 128,
  spouseGap: 22,
  coupleGap: 56,
  rowGap: 248,
  childGap: 40,
  padding: 72,
};

function unitW(opts: StandardLayoutOptions): number {
  return opts.cardWidth * 2 + opts.spouseGap;
}

function coupleCenterX(
  rowStartX: number,
  coupleIndex: number,
  opts: StandardLayoutOptions,
): number {
  const uw = unitW(opts);
  return rowStartX + coupleIndex * (uw + opts.coupleGap) + uw / 2;
}

function computeEdges(people: Record<PersonId, Person>): Edge[] {
  const ids = new Set(Object.keys(people));
  const edges: Edge[] = [];
  for (const p of Object.values(people)) {
    if (p.fatherId && ids.has(p.fatherId)) edges.push({ parentId: p.fatherId, childId: p.id });
    if (p.motherId && ids.has(p.motherId)) edges.push({ parentId: p.motherId, childId: p.id });
  }
  return edges;
}

function collectSiblingCouples(
  people: Record<PersonId, Person>,
  parentFather: PersonId,
  parentMother: PersonId,
  slots: ReturnType<typeof slotIdsForView>,
): Array<{ blood: PersonId; spouse?: PersonId }> {
  const templatePairs = slots.siblings.map(s => ({
    blood: s.blood,
    spouse: people[s.blood]?.spouseId,
  }));

  const extra: Array<{ blood: PersonId; spouse?: PersonId }> = [];
  const templateBlood = new Set(slots.siblings.map(s => s.blood));

  for (const p of Object.values(people)) {
    if (templateBlood.has(p.id)) continue;
    if (p.fatherId === parentFather && p.motherId === parentMother) {
      extra.push({ blood: p.id, spouse: p.spouseId });
    }
  }

  const merged: Array<{ blood: PersonId; spouse?: PersonId }> = [...templatePairs];
  for (const e of extra) {
    if (!merged.some(m => m.blood === e.blood)) merged.push(e);
  }
  return merged;
}

function collectChildren(
  people: Record<PersonId, Person>,
  bloodId: PersonId,
  spouseId?: PersonId,
): PersonId[] {
  const ids: PersonId[] = [];
  for (const p of Object.values(people)) {
    if (!p.fatherId && !p.motherId) continue;
    if (spouseId) {
      const ok =
        (p.fatherId === bloodId && p.motherId === spouseId) ||
        (p.fatherId === spouseId && p.motherId === bloodId);
      if (ok) ids.push(p.id);
    } else if (p.fatherId === bloodId || p.motherId === bloodId) {
      ids.push(p.id);
    }
  }
  return ids.sort();
}

function placeCoupleNode(
  nodes: PositionedNode[],
  nodeById: Record<PersonId, PositionedNode>,
  bloodId: PersonId,
  spouseId: PersonId | undefined,
  x: number,
  y: number,
  gen: number,
  opts: StandardLayoutOptions,
  highlightBlood?: boolean,
): void {
  if (!bloodId) return;

  const push = (
    id: PersonId,
    nx: number,
    role: 'blood' | 'spouse' | 'single',
    partner?: PersonId,
  ) => {
    const node: PositionedNode = {
      id,
      x: nx,
      y,
      width: opts.cardWidth,
      height: opts.cardHeight,
      generation: gen,
      side: 'center',
      slot: 0,
      layoutRole: role,
      partnerId: partner,
    };
    nodes.push(node);
    nodeById[id] = node;
    void highlightBlood;
  };

  push(bloodId, x, spouseId ? 'blood' : 'single', spouseId);
  if (spouseId) {
    push(spouseId, x + opts.cardWidth + opts.spouseGap, 'spouse', bloodId);
  }
}

export function buildStandardPedigreeLayout(
  people: Record<PersonId, Person>,
  options: Partial<StandardLayoutOptions> = {},
): LayoutResult & { selfId: PersonId; highlightIds: Set<PersonId> } {
  const opts = { ...STANDARD_LAYOUT_DEFAULTS, ...options };
  const slots = slotIdsForView(opts.view);
  const focalId = focalBloodId(opts.view, slots);
  const uw = unitW(opts);
  const isSelfView = opts.view === 'self';

  const sibParentFather = isSelfView ? slots.father : slots.gf;
  const sibParentMother = isSelfView ? slots.mother : slots.gm;

  const siblingCouples = collectSiblingCouples(
    people,
    sibParentFather,
    sibParentMother,
    slots,
  );

  const coupleCount = Math.max(DEFAULT_SIBLING_SLOTS, siblingCouples.length);
  let focalIndex = siblingCouples.findIndex(c => c.blood === focalId);
  if (focalIndex < 0) focalIndex = SELF_SLOT_INDEX;

  const rowW = coupleCount * uw + (coupleCount - 1) * opts.coupleGap;
  const canvasWidth = Math.max(1600, rowW + opts.padding * 2 + 240);
  const centerX = canvasWidth / 2;
  const siblingRowStartX = centerX - rowW / 2;

  const nodes: PositionedNode[] = [];
  const nodeById: Record<PersonId, PositionedNode> = {};
  const highlightIds = new Set<PersonId>([focalId]);

  const ancestorRows = isSelfView ? 3 : 2;
  const ySibling = opts.padding + opts.rowGap * ancestorRows;
  const yParent = ySibling - opts.rowGap;
  const yGrand = yParent - opts.rowGap;
  const yGreat = yGrand - opts.rowGap;

  const focalCenterX = coupleCenterX(siblingRowStartX, focalIndex, opts);

  siblingCouples.forEach((couple, i) => {
    if (!people[couple.blood]) return;
    const x = siblingRowStartX + i * (uw + opts.coupleGap);
    placeCoupleNode(
      nodes,
      nodeById,
      couple.blood,
      couple.spouse && people[couple.spouse] ? couple.spouse : undefined,
      x,
      ySibling,
      0,
      opts,
      couple.blood === focalId,
    );
  });

  if (isSelfView) {
    if (people[slots.father]) {
      placeCoupleNode(
        nodes,
        nodeById,
        slots.father,
        people[slots.mother] ? slots.mother : undefined,
        focalCenterX - uw / 2,
        yParent,
        -1,
        opts,
      );
    }
    if (people[slots.gf]) {
      placeCoupleNode(
        nodes,
        nodeById,
        slots.gf,
        people[slots.gm] ? slots.gm : undefined,
        focalCenterX - uw / 2,
        yGrand,
        -2,
        opts,
      );
    }
    if (people[slots.ggf]) {
      placeCoupleNode(
        nodes,
        nodeById,
        slots.ggf,
        people[slots.ggm] ? slots.ggm : undefined,
        focalCenterX - uw / 2,
        yGreat,
        -3,
        opts,
      );
    }
  } else {
    if (people[slots.gf]) {
      placeCoupleNode(
        nodes,
        nodeById,
        slots.gf,
        people[slots.gm] ? slots.gm : undefined,
        focalCenterX - uw / 2,
        yParent,
        -1,
        opts,
      );
    }
    if (people[slots.ggf]) {
      placeCoupleNode(
        nodes,
        nodeById,
        slots.ggf,
        people[slots.ggm] ? slots.ggm : undefined,
        focalCenterX - uw / 2,
        yGrand,
        -2,
        opts,
      );
    }
  }

  const yChild = ySibling + opts.rowGap;
  siblingCouples.forEach((couple, i) => {
    const kids = collectChildren(people, couple.blood, couple.spouse);
    const coupleCenter = coupleCenterX(siblingRowStartX, i, opts);
    const childCount = Math.max(kids.length, DEFAULT_CHILDREN_PER_COUPLE);
    const childRowW =
      childCount * opts.cardWidth + (childCount - 1) * opts.childGap;
    const childStartX = coupleCenter - childRowW / 2;

    kids.forEach((kidId, ki) => {
      if (!people[kidId]) return;
      const nx = childStartX + ki * (opts.cardWidth + opts.childGap);
      placeCoupleNode(nodes, nodeById, kidId, undefined, nx, yChild, 1, opts);
    });

    slots.children[i]?.forEach((cid, ci) => {
      if (people[cid] && !nodeById[cid]) {
        const nx = childStartX + ci * (opts.cardWidth + opts.childGap);
        placeCoupleNode(nodes, nodeById, cid, undefined, nx, yChild, 1, opts);
      }
    });
  });

  const canvasHeight = yChild + opts.cardHeight + opts.padding + 100;

  return {
    canvasWidth,
    canvasHeight,
    nodes,
    edges: computeEdges(people),
    nodeById,
    selfId: focalId,
    highlightIds,
  };
}
