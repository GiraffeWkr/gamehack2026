/**
 * The talent tree panel — a 1:1 rebuild of `TreeCreator` + `TreeNode` + `UILineRenderer`.
 *
 * Everything visual here comes from the decompiled original, not from taste:
 *
 * | what | original | source |
 * |---|---|---|
 * | node position | `CalculateNodeWorldPosition` = `FirstNodePosition + Position * distancesMultiplier`, `(0,0)` + x1.2 | `TreeCreator.cs:1512`, scene |
 * | node size | `shapeSize` — 50 base, 75 portal | `TreeNodeTemplate` assets |
 * | shape sprite | `NonleveledNodeShape` at level 0, `LeveledNodeShape` above | `TreeCreator.UpdateNodeShapeSprite` |
 * | icon | drawn at `NodeIconSize` (32 / 38), tinted `UnlockedIconColor` / `LockedIconColor` | `TreeNodeInfo.GetCurrentIconColor` |
 * | highlighter | `HighlighterShape` at `HighlighterShapeSize` (71 / 100), offset `(0.3, 0)`, tinted by `GetHighlighterColor` | `TreeState.cs:178` |
 * | link | 2-unit-thick quad, straight when `curveAmount == 0`, circular arc otherwise | `UILineRenderer.lineWidth`, `TreeLink.CreateLineRenderer` |
 * | link colour | lit only when **both** ends are unlocked | `TreeCreator.ShouldLinkBeLocked` |
 * | hover | scale x1.08 over 0.2s, `OutBack(1.5)` | `TreeNode.OnPointerEnter` |
 * | level-up | 0.88 -> 1.25 -> 1 (OutElastic), icon punch + 15 deg rotation | `TreeNode.PlayLevelUpAnimation` |
 *
 * The original draws **no level number on a node** — `ManageMySize()` is empty and the
 * prefab has only `NodeShape`, `NodeIcon` and `Highlighter` children. Level lives in the
 * tooltip, so this panel does not invent a badge either.
 */

import {
  TALENT_BOUNDS,
  TALENT_BY_ID,
  TALENT_EDGES,
  TALENT_NODES,
  TALENT_TEXT,
  TREE_TEMPLATES,
} from '../content/talent.js';
import type { TalentCurrency, TalentNode } from '../content/talent.js';
import type { Purses, TalentTree } from '../game/talent.js';

const ART = 'art/tree/';

/** A `Color` from the export as a CSS `rgb()`/`rgba()` string. */
function css(c: readonly number[]): string {
  const [r, g, b, a] = c;
  const to255 = (v: number): number => Math.round(Math.max(0, Math.min(1, v)) * 255);
  return `rgba(${to255(r)},${to255(g)},${to255(b)},${Math.max(0, Math.min(1, a))})`;
}

/**
 * `FunctionsNeeded.DisplayNumberAsNumberSuffix`: divide by ten until below 1000, keep one
 * or two significant decimals, then index a K/M/B… suffix by `ceil(n/3)-1`.
 */
const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
export function readable(value: number): string {
  if (!Number.isFinite(value)) return '--';
  let v = Math.round(value);
  if (v < 10000) return String(v);
  let n = 0;
  while (v >= 1000) {
    v /= 10;
    n++;
  }
  const digits = String(Math.floor(v));
  const dotted = n % 3 === 1 ? `${digits.slice(0, 1)}.${digits.slice(1)}`
    : n % 3 === 2 ? `${digits.slice(0, 2)}.${digits.slice(2)}`
      : digits;
  const suffix = SUFFIX[Math.floor((n + 2) / 3)] ?? '';
  return dotted + suffix;
}

/**
 * `StatInfo.GetValueDescText`: the game's own string for the stat, with `#VALUE#`
 * substituted. Values below 10000 keep `RoundToNearest` decimals, above that they take a
 * K/M/B suffix — that is `MyExtensions.ToReadable`.
 *
 * The sign is prepended here exactly as `LocalizerManager.GetStringAndReplaceValues` does
 * (`StartingSign + number.ToReadable(...)`). Some of the shipped translations already
 * contain their own `+` — the Chinese for `MouseMagazineSizeFlat` is
 * `箭雨最大召唤次数 +#VALUE#` — so the original really does render `++1` there. That is
 * reproduced rather than corrected, because it is what the game shows.
 */
export function statText(node: TalentNode, index: number, value: number): string {
  const gr = node.grants[index];
  if (!gr) return '';
  const table = TALENT_TEXT[gr.locKey] ?? TALENT_TEXT[`${gr.stat}Flat`];
  const template = table?.zh || `${gr.stat} #VALUE#`;
  const abs = Math.abs(value);
  let body: string;
  if (abs >= 10000) body = readable(abs);
  else body = abs.toFixed(Math.max(0, Math.min(3, gr.round)));
  const sign = gr.signed ? (value < 0 ? '-' : '+') : value < 0 ? '-' : '';
  return template.replace(/#VALUE(\d*)#/g, `${sign}${body}`);
}

const CURRENCY_LABEL: Record<TalentCurrency, string> = {
  Gold: '金币',
  ClawCurrency: '爪币',
  ArcherCurrency: '弓币',
  PortalCurrency: '传送门币',
  WarriorCurrency: '战币',
  MageCurrency: '法币',
  BatCurrency: '蝠币',
  MiningRock: '岩石',
  MiningCopper: '铜矿',
  MiningSilver: '银矿',
  MiningGold: '金矿',
  GuardianCurrency: '守护币',
};

export interface TalentCallbacks {
  /** Attempts a purchase; returns true when it went through. */
  onBuy: (node: TalentNode) => boolean;
}

interface NodeView {
  def: TalentNode;
  el: HTMLButtonElement;
  shape: HTMLImageElement;
  icon: HTMLSpanElement;
  iconImg: HTMLImageElement;
  hi: HTMLSpanElement;
}

export class TalentPanel {
  readonly root: HTMLElement;
  private readonly viewport: HTMLElement;
  private readonly world: HTMLElement;
  private readonly linkLayer: SVGSVGElement;
  private readonly nodeLayer: HTMLElement;
  private readonly tip: HTMLElement;
  private readonly head: HTMLElement;
  private readonly views = new Map<string, NodeView>();
  private readonly links: Array<{
    a: string;
    b: string;
    el: SVGPathElement | SVGLineElement;
  }> = [];

  private panX = 0;
  private panY = 0;
  private scale = 1;
  private lastTree: TalentTree | null = null;
  private lastPurses: Purses | null = null;

  constructor(
    parent: HTMLElement,
    private readonly cb: TalentCallbacks,
  ) {
    this.root = document.createElement('div');
    // The original's tree is its own screen, opened from the menu — so it starts closed
    // and covers the game only while it is open.
    this.root.className = 'talent hidden';
    this.root.innerHTML = `
      <div class="talent-head">
        <span class="talent-title">天赋</span>
        <span class="talent-progress"></span>
      </div>
      <div class="talent-viewport">
        <div class="talent-world">
          <svg class="talent-links" xmlns="http://www.w3.org/2000/svg"></svg>
          <div class="talent-nodes"></div>
        </div>
      </div>
      <div class="talent-tip hidden"></div>
    `;
    parent.appendChild(this.root);

    this.head = this.root.querySelector('.talent-progress') as HTMLElement;
    this.viewport = this.root.querySelector('.talent-viewport') as HTMLElement;
    this.world = this.root.querySelector('.talent-world') as HTMLElement;
    this.linkLayer = this.root.querySelector('.talent-links') as SVGSVGElement;
    this.nodeLayer = this.root.querySelector('.talent-nodes') as HTMLElement;
    this.tip = this.root.querySelector('.talent-tip') as HTMLElement;

    this.buildLinks();
    this.buildNodes();
    this.bindPan();

    this.root.dataset.nodes = String(TALENT_NODES.length);
    this.root.dataset.links = String(this.links.length);
    this.world.style.width = `${TALENT_BOUNDS.width}px`;
    this.world.style.height = `${TALENT_BOUNDS.height}px`;
    this.centred = false;
  }

  /** True once the graph has been placed in the middle of the viewport. */
  private centred: boolean;
  /** The scale that centring was computed for, so a resize re-centres. */
  private centredScale = 0;
  /** Revealed-content bounds in world pixels; see `clampPan`. */
  private range = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  /** How many nodes were shown at the last re-centre. */
  private revealedCount = -1;

  /** Graph coordinates -> world-layer pixels. The origin sits inside the padded box. */
  private gx(x: number): number {
    return x - TALENT_BOUNDS.minX;
  }

  private gy(y: number): number {
    return y - TALENT_BOUNDS.minY;
  }

  /**
   * The scene's `TreeNode` prefab: `Highlighter`, `NodeShape`, `NodeIcon` stacked at the
   * same anchored position. Sprites are white-with-alpha, so the tint is applied as a
   * `multiply` blend of the image over a coloured backdrop — exactly Unity's
   * `Image.color` multiply.
   */
  private buildNodes(): void {
    this.nodeLayer.style.width = `${TALENT_BOUNDS.width}px`;
    this.nodeLayer.style.height = `${TALENT_BOUNDS.height}px`;

    for (const def of TALENT_NODES) {
      const btn = document.createElement('button');
      btn.className = 'tn';
      btn.type = 'button';
      btn.dataset.id = def.id;
      // The template decides the shape and the currency, so it is worth having in the DOM
      // for both styling and assertions.
      btn.dataset.tpl = def.tpl;
      btn.dataset.currency = def.costs[0]?.currency ?? '';
      btn.style.left = `${this.gx(def.x)}px`;
      btn.style.top = `${this.gy(def.y)}px`;
      btn.style.width = `${def.shapeSize}px`;
      btn.style.height = `${def.shapeSize}px`;
      btn.innerHTML = `
        <span class="tn-hi"><img alt=""></span>
        <img class="tn-shape" alt="">
        <span class="tn-icon"><img alt=""></span>
      `;
      const hi = btn.querySelector('.tn-hi') as HTMLSpanElement;
      const shape = btn.querySelector('.tn-shape') as HTMLImageElement;
      const icon = btn.querySelector('.tn-icon') as HTMLSpanElement;
      const hiImg = hi.querySelector('img') as HTMLImageElement;
      const iconImg = icon.querySelector('img') as HTMLImageElement;
      hiImg.src = ART + def.highlighter;
      iconImg.src = ART + def.icon;
      icon.style.width = `${def.iconSize}px`;
      icon.style.height = `${def.iconSize}px`;
      // The highlighter is 71/100 units on a 50/75 node, centred, nudged +0.3 on x.
      hi.style.width = `${def.highlighterSize}px`;
      hi.style.height = `${def.highlighterSize}px`;

      btn.addEventListener('pointerdown', (ev) => ev.stopPropagation());
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const bought = this.cb.onBuy(def);
        if (bought && this.lastTree && this.lastPurses) {
          this.refresh(this.lastTree, this.lastPurses);
          this.playLevelUp(def.id);
          this.showTip(def);
        } else if (!bought) {
          this.showTip(def);
        }
      });
      btn.addEventListener('pointerenter', () => this.showTip(def));
      btn.addEventListener('pointerleave', () => this.hideTip());

      this.nodeLayer.appendChild(btn);
      this.views.set(def.id, { def, el: btn, shape, icon, iconImg, hi });
    }
  }

  /**
   * `TreeLink`: a 2-unit quad chain. `curveAmount == 0` is a straight run; anything else
   * is the circular arc through a midpoint pushed `|curve|/10 * halfLength` along the
   * segment normal (`TreeLink.CreateLineRenderer`). 349 of the 365 links are straight.
   */
  private buildLinks(): void {
    this.linkLayer.setAttribute('viewBox', `0 0 ${TALENT_BOUNDS.width} ${TALENT_BOUNDS.height}`);
    this.linkLayer.setAttribute('width', String(TALENT_BOUNDS.width));
    this.linkLayer.setAttribute('height', String(TALENT_BOUNDS.height));

    for (const edge of TALENT_EDGES) {
      const a = TALENT_BY_ID[edge.a];
      const b = TALENT_BY_ID[edge.b];
      if (!a || !b) continue;
      const x1 = this.gx(a.x);
      const y1 = this.gy(a.y);
      const x2 = this.gx(b.x);
      const y2 = this.gy(b.y);

      let el: SVGPathElement | SVGLineElement;
      if (Math.abs(edge.curve) < 0.001) {
        el = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        el.setAttribute('x1', String(x1));
        el.setAttribute('y1', String(y1));
        el.setAttribute('x2', String(x2));
        el.setAttribute('y2', String(y2));
      } else {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const bulge = (Math.abs(edge.curve) / 10) * (len / 2) * (edge.curve < 0 ? 1 : -1);
        const cx = (x1 + x2) / 2 + nx * bulge;
        const cy = (y1 + y2) / 2 + ny * bulge;
        el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        el.setAttribute('d', `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`);
        el.setAttribute('fill', 'none');
      }
      el.setAttribute('stroke-width', '2');
      this.linkLayer.appendChild(el);
      this.links.push({ a: edge.a, b: edge.b, el });
    }
  }

  /** `TreeHorizontalPan` plus vertical drag, since the graph is 480 units tall. */
  private bindPan(): void {
    let dragging = false;
    let moved = 0;
    let startX = 0;
    let startY = 0;
    let originX = 0;
    let originY = 0;
    this.viewport.addEventListener('pointerdown', (ev) => {
      dragging = true;
      moved = 0;
      startX = ev.clientX;
      startY = ev.clientY;
      originX = this.panX;
      originY = this.panY;
      this.viewport.setPointerCapture(ev.pointerId);
      this.hideTip();
    });
    this.viewport.addEventListener('pointermove', (ev) => {
      if (!dragging) return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      moved = Math.max(moved, Math.abs(dx) + Math.abs(dy));
      this.panX = originX + dx;
      this.panY = originY + dy;
      this.clampPan();
      this.applyPan();
    });
    const stop = (ev: PointerEvent): void => {
      dragging = false;
      try {
        this.viewport.releasePointerCapture(ev.pointerId);
      } catch {
        /* the pointer may already be gone */
      }
    };
    this.viewport.addEventListener('pointerup', stop);
    this.viewport.addEventListener('pointercancel', stop);
    this.viewport.addEventListener('wheel', (ev) => {
      const w = ev as WheelEvent;
      this.panX -= w.deltaX;
      this.panY -= w.deltaY;
      this.clampPan();
      this.applyPan();
      w.preventDefault();
    }, { passive: false });
    this.root.dataset.drag = '0';
    this.viewport.addEventListener('pointermove', () => {
      this.root.dataset.drag = moved > 6 ? '1' : '0';
    });
  }

  /**
   * Keeps the SHOWN content inside the viewport. When the content is narrower than the
   * viewport on an axis the two bounds cross over, and the content is centred on that axis
   * instead - which is the single-node start of the tree.
   */
  private clampPan(): void {
    const s = this.scale;
    const vw = this.viewport.clientWidth || 1;
    const vh = this.viewport.clientHeight || 1;
    const clamp = (lo: number, hi: number, v: number): number =>
      (lo > hi ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, v)));
    this.panX = clamp(vw - this.range.maxX * s, -this.range.minX * s, this.panX);
    this.panY = clamp(vh - this.range.maxY * s, -this.range.minY * s, this.panY);
  }

  private applyPan(): void {
    this.world.style.transform =
      `translate(${Math.round(this.panX)}px, ${Math.round(this.panY)}px) scale(${this.scale})`;
  }

  /** Click feedback is `TreeNode.PlayLevelUpAnimation`, retimed for the DOM. */
  private playLevelUp(id: string): void {
    const view = this.views.get(id);
    if (!view) return;
    const tree = this.lastTree;
    const maxed = tree ? tree.isMaxed(view.def) : false;
    view.el.classList.remove('lv');
    view.icon.classList.remove('lv');
    // Force a reflow so the animation restarts on a repeat purchase.
    void view.el.offsetWidth;
    view.el.classList.add('lv');
    view.icon.classList.add('lv');
    view.el.classList.toggle('lv-max', maxed);
  }

  /** Recomputes every node's sprite, tint and every link's colour. */
  refresh(tree: TalentTree, purses: Purses): void {
    this.lastTree = tree;
    this.lastPurses = purses;

    const vh = this.viewport.clientHeight;
    /*
     * While the panel is closed the viewport is `display:none` and measures 0, so there is
     * nothing to lay out yet — the next refresh, once it is open, does the real fit.
     */
    if (!vh) return;
    /*
     * Fit the graph to the viewport HEIGHT, always, with no minimum.
     *
     * The original's tree window is the whole lower panel and the graph fits it in one
     * piece: `TreeHorizontalPan` implements `OnDrag` and `OnScroll` on **x alone** and has
     * no vertical equivalent, so the tree is never scrolled up and down - it fits.
     *
     * The panel used to clamp the scale at 0.88 to keep a 50-unit node above ~44 CSS px.
     * That floor is why the page was truncated: at a 290px viewport it rendered
     * 580 * 0.88 = 510px of graph, of which only the top 290px could be seen and the pan
     * clamp could not reach the rest. The clamp was an invention - `NodeSizeScale` is the
     * original's own knob and it ships at 1.0, which this still honours by never scaling up.
     */
    this.scale = Math.min(1, (vh - 12) / TALENT_BOUNDS.height);
    this.world.style.transformOrigin = '0 0';

    /*
     * The pan range is measured from the SHOWN nodes, not from the whole graph.
     *
     * `TreeHorizontalPan.Recalculate` does exactly that: it walks the node transforms, takes
     * the extent of the ACTIVE ones, and keeps `leftPadding`/`rightPadding` (40) at each end.
     * It matters far more here than it looks. Under `InaccessibleNodeDisplayMode.Hide` the
     * shown set starts as a single node, and a range built from the whole 3734-unit graph
     * would park that node off the left edge - which is exactly what it did.
     */
    const shown = TALENT_NODES.filter((n) => tree.isAccessible(n));
    const pad = 40;
    if (shown.length) {
      this.range = {
        minX: Math.min(...shown.map((n) => this.gx(n.x))) - pad,
        maxX: Math.max(...shown.map((n) => this.gx(n.x) + n.shapeSize)) + pad,
        minY: Math.min(...shown.map((n) => this.gy(n.y))) - pad,
        maxY: Math.max(...shown.map((n) => this.gy(n.y) + n.shapeSize)) + pad,
      };
    }

    /*
     * Re-centre when the layout or the revealed set changes, otherwise leave the player's
     * pan alone. `TreeHorizontalPan.PanToRevealed` is the original's version of this: a
     * purchase that reveals a clipped node pans it into full view.
     */
    if (!this.centred || Math.abs(this.scale - this.centredScale) > 1e-6
      || shown.length !== this.revealedCount) {
      this.centred = true;
      this.centredScale = this.scale;
      this.revealedCount = shown.length;
      const vw = this.viewport.clientWidth || 1;
      this.panX = (vw - (this.range.maxX - this.range.minX) * this.scale) / 2
        - this.range.minX * this.scale;
      this.panY = (vh - (this.range.maxY - this.range.minY) * this.scale) / 2
        - this.range.minY * this.scale;
    }
    this.clampPan();
    this.applyPan();

    for (const def of TALENT_NODES) {
      const view = this.views.get(def.id);
      if (!view) continue;
      const level = tree.level(def.id);
      const maxed = tree.isMaxed(def);
      const accessible = tree.isAccessible(def);
      const affordable = accessible && !maxed && tree.hasFunds(def, purses);

      view.shape.src = ART + (level >= 1 ? def.shapeOn : def.shapeOff);
      const tpl = TREE_TEMPLATES[def.tpl];
      // `TreeState.GetHighlighterColor`, in order.
      const hiColor = maxed || !accessible
        ? css(tpl.defaultColor)
        : affordable ? css(tpl.canBuyColor) : css(tpl.poorColor);
      view.hi.style.backgroundColor = hiColor;
      view.hi.dataset.on = maxed || !accessible ? '0' : '1';

      // `TreeNodeInfo.GetCurrentIconColor(isUnlocked)`, where `isUnlocked` is
      // `TreeState.IsNodeUnlocked` — strictly "this node has been bought at least once",
      // not "this node is reachable". Reachability shows through the highlighter instead.
      view.icon.style.backgroundColor =
        level >= 1 ? css(tpl.unlockedIconColor) : css(tpl.lockedIconColor);

      view.el.classList.toggle('locked', !accessible);
      view.el.classList.toggle('maxed', maxed);
      view.el.classList.toggle('affordable', affordable);
      view.el.classList.toggle('poor', accessible && !maxed && !affordable);
      view.el.dataset.level = String(level);
      /*
       * `TreeCreator.ApplyAccessibilityDisplayRules`, `InaccessibleNodeDisplayMode.Hide`:
       * an unreachable node is not drawn at all. The shipped tree therefore begins as ONE
       * node - the `AlwaysUnlockable` root `Node 1_55cde9fa` - which is why
       * `TreeCreator.UpdateNodeHighlighterColor` raises `ShowHideFirstNodeArrow` for that
       * node while its level is still 0. Drawing all 168 at once was the port's mistake.
       */
      view.el.classList.toggle('unrevealed', !accessible);
    }

    // `TreeCreator.ShouldLinkBeLocked` colours a lit link only when BOTH ends are unlocked;
    // `HideInaccessibleNodesAndConnections` separately draws a link only when both ends are
    // themselves drawn.
    for (const link of this.links) {
      const both = tree.level(link.a) >= 1 && tree.level(link.b) >= 1;
      const a = TALENT_BY_ID[link.a];
      const b = TALENT_BY_ID[link.b];
      const tpl = TREE_TEMPLATES[a.tpl];
      link.el.setAttribute('stroke', both ? css(tpl.linkOnColor) : css(tpl.linkOffColor));
      link.el.classList.toggle('unrevealed', !tree.isAccessible(a) || !tree.isAccessible(b));
    }

    const spent = tree.totalLevels();
    const portal = purses.currencies.PortalCurrency ?? 0;
    this.head.textContent = `已投入 ${spent} 点 · 传送门币 ${readable(portal)}`;
  }

  private showTip(def: TalentNode): void {
    const tree = this.lastTree;
    const purses = this.lastPurses;
    if (!tree || !purses) return;
    const level = tree.level(def.id);
    const maxed = tree.isMaxed(def);
    const accessible = tree.isAccessible(def);

    const rows: string[] = [`<div class="tt-name">${def.name}</div>`];
    rows.push(`<div class="tt-lv">{{LV}}</div>`.replace('{{LV}}', `等级 ${level} / ${def.maxLevel}`));

    if (!maxed) {
      const next = level + 1;
      const grants = tree.grantsAt(def, next);
      const lines = grants
        .map((gr, i) => {
          if (Math.abs(gr.delta) < 1e-9) return '';
          return `<div class="tt-grant">${statText(def, i, gr.delta)}</div>`;
        })
        .filter(Boolean);
      if (lines.length) rows.push(`<div class="tt-next">${lines.join('')}</div>`);
      const costs = tree.costLines(def).map((c) => {
        const have = c.currency === 'Gold' ? purses.gold : (purses.currencies[c.currency] ?? 0);
        const ok = have >= c.amount;
        return `<span class="${ok ? 'ok' : 'no'}">${CURRENCY_LABEL[c.currency]} `
          + `${readable(c.amount)}</span>`;
      });
      rows.push(`<div class="tt-cost">花费：${costs.join('　')}</div>`);
    }
    if (!accessible) rows.push('<div class="tt-locked">需要先点亮相邻节点</div>');
    else if (maxed) rows.push('<div class="tt-locked">已满级</div>');

    this.tip.innerHTML = rows.join('');
    this.tip.classList.remove('hidden');

    const nodeEl = this.views.get(def.id)?.el;
    if (!nodeEl) return;
    const r = nodeEl.getBoundingClientRect();
    const host = this.root.getBoundingClientRect();
    const half = Math.min(150, host.width / 2 - 8);
    const x = Math.max(half, Math.min(host.width - half, r.left - host.left + r.width / 2));
    this.tip.style.left = `${x}px`;
    this.tip.style.bottom = `${host.bottom - r.top + 8}px`;
  }

  private hideTip(): void {
    this.tip.classList.add('hidden');
  }

  setVisible(on: boolean): void {
    this.root.classList.toggle('hidden', !on);
    if (on && this.lastTree && this.lastPurses) this.refresh(this.lastTree, this.lastPurses);
    if (!on) this.hideTip();
  }

  get visible(): boolean {
    return !this.root.classList.contains('hidden');
  }
}
