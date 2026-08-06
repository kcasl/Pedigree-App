/**
 * 족보 연결선 — 부부 가로 → trunk 세로 → rail 가로 → 자녀 세로 (끊김 없이 겹침)
 */

import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { ui } from '../theme/ui';
import { scaleSize } from '../theme/responsive';
import { CARD_SHADOW_BLEED } from '../utils/standardLayout';
import type { Edge, PositionedNode } from '../utils/pedigreeLayout';

export const EDGE_DRAW_BASE = {
  enabled: true,
  nodeLineGap: 8,
  strokeWidth: 2.5,
  color: ui.color.line,
} as const;

export type EdgeDrawConfig = {
  enabled: boolean;
  nodeLineGap: number;
  strokeWidth: number;
  color: string;
};

export function buildEdgeDrawConfig(uiScale = 1): EdgeDrawConfig {
  const rs = (n: number) => scaleSize(n, uiScale);
  return {
    enabled: EDGE_DRAW_BASE.enabled,
    nodeLineGap: rs(EDGE_DRAW_BASE.nodeLineGap + CARD_SHADOW_BLEED),
    strokeWidth: Math.max(2, rs(EDGE_DRAW_BASE.strokeWidth)),
    color: EDGE_DRAW_BASE.color,
  };
}

type Props = {
  edges: Edge[];
  nodeById: Record<string, PositionedNode>;
  spousePairs?: Array<{ aId: string; bId: string }>;
  strokeWidth?: number;
  color?: string;
  uiScale?: number;
};

type CoupleGroup = {
  kind: 'couple';
  leftId: string;
  rightId: string;
  childIds: string[];
};

type SingleGroup = {
  kind: 'single';
  parentId: string;
  childIds: string[];
};

type ParentGroup = CoupleGroup | SingleGroup;

function bar(
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  stroke: number,
) {
  if (![x, y, w, h, stroke].every(Number.isFinite)) {
    return {
      position: 'absolute' as const,
      left: 0,
      top: 0,
      width: 0,
      height: 0,
      backgroundColor: 'transparent',
    };
  }
  return {
    position: 'absolute' as const,
    left: x,
    top: y,
    width: Math.max(stroke, w),
    height: Math.max(stroke, h),
    backgroundColor: color,
    borderRadius: stroke / 2,
  };
}

function horizontalBar(
  x: number,
  centerY: number,
  w: number,
  color: string,
  stroke: number,
) {
  return bar(x, centerY - stroke / 2, w, stroke, color, stroke);
}

function verticalBar(
  centerX: number,
  y1: number,
  y2: number,
  color: string,
  stroke: number,
) {
  const topY = Math.min(y1, y2);
  const height = Math.max(stroke, Math.abs(y2 - y1));
  return bar(centerX - stroke / 2, topY, stroke, height, color, stroke);
}

function cx(n: PositionedNode): number {
  return n.x + n.width / 2;
}

function bottom(n: PositionedNode): number {
  return n.y + n.height;
}

function top(n: PositionedNode): number {
  return n.y;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}__${b}` : `${b}__${a}`;
}

function isLayoutCouple(a: PositionedNode, b: PositionedNode): boolean {
  if (a.generation !== b.generation) return false;
  return a.partnerId === b.id || b.partnerId === a.id;
}

function pickCouple(
  parentIds: string[],
  spouseKeys: Set<string>,
  nodeById: Record<string, PositionedNode>,
): { couple: [string, string] | null; rest: string[] } {
  if (parentIds.length < 2) return { couple: null, rest: parentIds };

  if (parentIds.length === 2) {
    const a = nodeById[parentIds[0]];
    const b = nodeById[parentIds[1]];
    if (a && b) {
      const left = cx(a) <= cx(b) ? parentIds[0] : parentIds[1];
      const right = left === parentIds[0] ? parentIds[1] : parentIds[0];
      return { couple: [left, right], rest: [] };
    }
  }

  for (let i = 0; i < parentIds.length; i++) {
    for (let j = i + 1; j < parentIds.length; j++) {
      const a = nodeById[parentIds[i]];
      const b = nodeById[parentIds[j]];
      if (!a || !b) continue;
      const key = pairKey(parentIds[i], parentIds[j]);
      if (spouseKeys.has(key) || isLayoutCouple(a, b)) {
        const left = cx(a) <= cx(b) ? parentIds[i] : parentIds[j];
        const right = left === parentIds[i] ? parentIds[j] : parentIds[i];
        const rest = parentIds.filter(id => id !== left && id !== right);
        return { couple: [left, right], rest };
      }
    }
  }
  return { couple: null, rest: parentIds };
}

function buildGroups(
  edges: Edge[],
  spousePairs: Array<{ aId: string; bId: string }>,
  nodeById: Record<string, PositionedNode>,
): { groups: ParentGroup[]; drawnCouples: Set<string> } {
  const byChild = new Map<string, Set<string>>();
  for (const { parentId, childId } of edges) {
    const set = byChild.get(childId) ?? new Set();
    set.add(parentId);
    byChild.set(childId, set);
  }

  const spouseKeys = new Set(spousePairs.map(p => pairKey(p.aId, p.bId)));
  const groupMap = new Map<string, ParentGroup>();
  const drawnCouples = new Set<string>();

  const addSingle = (parentId: string, childId: string) => {
    const k = `s:${parentId}`;
    const g = groupMap.get(k);
    if (g?.kind === 'single') g.childIds.push(childId);
    else groupMap.set(k, { kind: 'single', parentId, childIds: [childId] });
  };

  for (const [childId, parentSet] of byChild) {
    let remaining = Array.from(parentSet);
    const { couple, rest } = pickCouple(remaining, spouseKeys, nodeById);

    if (couple) {
      const [leftId, rightId] = couple;
      const k = `c:${pairKey(leftId, rightId)}`;
      drawnCouples.add(pairKey(leftId, rightId));
      const g = groupMap.get(k);
      if (g?.kind === 'couple') g.childIds.push(childId);
      else groupMap.set(k, { kind: 'couple', leftId, rightId, childIds: [childId] });
      remaining = rest;
    }

    for (const pid of remaining) addSingle(pid, childId);
  }

  return { groups: Array.from(groupMap.values()), drawnCouples };
}

function coupleLineCenterY(
  a: PositionedNode,
  b: PositionedNode,
  cfg: EdgeDrawConfig,
  stroke: number,
): number {
  return Math.max(bottom(a), bottom(b)) + cfg.nodeLineGap + stroke / 2;
}

function singleLineCenterY(node: PositionedNode, cfg: EdgeDrawConfig, stroke: number): number {
  return bottom(node) + cfg.nodeLineGap + stroke / 2;
}

function railCenterY(lineCenterY: number, minChildTop: number): number {
  return (lineCenterY + minChildTop) / 2;
}

function lineColor(fallbackColor: string | undefined): string {
  return fallbackColor ?? EDGE_DRAW_BASE.color;
}

type Ctx = {
  out: React.ReactNode[];
  nodeById: Record<string, PositionedNode>;
  stroke: number;
  fallbackColor?: string;
  cfg: EdgeDrawConfig;
};

function drawCouple(group: CoupleGroup, ctx: Ctx): void {
  const { out, nodeById, stroke, fallbackColor, cfg } = ctx;
  const left = nodeById[group.leftId];
  const right = nodeById[group.rightId];
  if (!left || !right) return;

  const children = group.childIds
    .map(id => nodeById[id])
    .filter(Boolean)
    .sort((a, b) => cx(a) - cx(b)) as PositionedNode[];
  if (!children.length) return;

  const lineCenterY = coupleLineCenterY(left, right, cfg, stroke);
  const midX = (left.x + right.x + right.width) / 2;
  const minChildTop = Math.min(...children.map(top));
  const ry = railCenterY(lineCenterY, minChildTop);
  const join = stroke / 2;
  const key = pairKey(group.leftId, group.rightId);
  const parentColor = lineColor(fallbackColor);
  const childColor = lineColor(fallbackColor);

  const leftEdge = left.x + left.width;
  const rightEdge = right.x;
  const childXs = children.map(cx);
  const railLeft = Math.min(midX, ...childXs);
  const railW = Math.max(midX, ...childXs) - railLeft;

  out.push(
    <View
      key={`c_h_${key}`}
      style={horizontalBar(leftEdge, lineCenterY, rightEdge - leftEdge, parentColor, stroke)}
    />,
  );
  out.push(
    <View
      key={`c_v_${key}`}
      style={verticalBar(midX, lineCenterY, ry + join, parentColor, stroke)}
    />,
  );
  out.push(
    <View key={`c_r_${key}`} style={horizontalBar(railLeft, ry, railW, childColor, stroke)} />,
  );

  for (const ch of children) {
    out.push(
      <View
        key={`c_ch_${key}_${ch.id}`}
        style={verticalBar(cx(ch), ry - join, top(ch) + join, childColor, stroke)}
      />,
    );
  }
}

function drawSingle(group: SingleGroup, ctx: Ctx): void {
  const { out, nodeById, stroke, fallbackColor, cfg } = ctx;
  const parent = nodeById[group.parentId];
  if (!parent) return;

  const children = group.childIds
    .map(id => nodeById[id])
    .filter(Boolean)
    .sort((a, b) => cx(a) - cx(b)) as PositionedNode[];
  if (!children.length) return;

  const px = cx(parent);
  const lineCenterY = singleLineCenterY(parent, cfg, stroke);
  const minChildTop = Math.min(...children.map(top));
  const ry = railCenterY(lineCenterY, minChildTop);
  const join = stroke / 2;
  const pid = group.parentId;
  const parentColor = lineColor(fallbackColor);
  const childColor = lineColor(fallbackColor);

  const childXs = children.map(cx);
  const railLeft = Math.min(px, ...childXs);
  const railW = Math.max(px, ...childXs) - railLeft;

  out.push(
    <View
      key={`s_v_${pid}`}
      style={verticalBar(px, lineCenterY, ry + join, parentColor, stroke)}
    />,
  );
  out.push(
    <View key={`s_r_${pid}`} style={horizontalBar(railLeft, ry, railW, childColor, stroke)} />,
  );

  for (const ch of children) {
    out.push(
      <View
        key={`s_ch_${pid}_${ch.id}`}
        style={verticalBar(cx(ch), ry - join, top(ch) + join, childColor, stroke)}
      />,
    );
  }
}

function drawSpouseOnly(
  pairs: Array<{ aId: string; bId: string }>,
  drawn: Set<string>,
  nodeById: Record<string, PositionedNode>,
  ctx: Ctx,
): void {
  const { out, stroke, fallbackColor, cfg } = ctx;

  pairs.forEach((pair, idx) => {
    const key = pairKey(pair.aId, pair.bId);
    if (drawn.has(key)) return;

    const a = nodeById[pair.aId];
    const b = nodeById[pair.bId];
    if (!a || !b) return;
    if (a.generation !== b.generation) return;

    const left = cx(a) <= cx(b) ? a : b;
    const right = cx(a) <= cx(b) ? b : a;
    const lineCenterY = coupleLineCenterY(left, right, cfg, stroke);
    const spouseColor = lineColor(fallbackColor);

    out.push(
      <View
        key={`sp_${idx}_${key}`}
        style={horizontalBar(
          left.x + left.width,
          lineCenterY,
          right.x - (left.x + left.width),
          spouseColor,
          stroke,
        )}
      />,
    );
  });
}

export function EdgeLines({
  edges,
  nodeById,
  spousePairs = [],
  strokeWidth,
  color = '#000000',
  uiScale = 1,
}: Props) {
  const content = useMemo(() => {
    const cfg = buildEdgeDrawConfig(uiScale);
    if (!cfg.enabled) return null;

    const stroke = strokeWidth ?? cfg.strokeWidth;
    const { groups, drawnCouples } = buildGroups(edges, spousePairs, nodeById);
    const out: React.ReactNode[] = [];
    const ctx: Ctx = { out, nodeById, stroke, fallbackColor: color, cfg };

    for (const g of groups) {
      if (g.kind === 'couple') drawCouple(g, ctx);
      else drawSingle(g, ctx);
    }

    drawSpouseOnly(spousePairs, drawnCouples, nodeById, ctx);

    return out;
  }, [edges, nodeById, spousePairs, strokeWidth, color, uiScale]);

  if (!content?.length) return null;

  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>{content}</View>;
}
