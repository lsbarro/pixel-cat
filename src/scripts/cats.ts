// The home page's "More cats" gallery and the endless wall past it. Scrolling past the gallery opens a
// full-screen wall whose first rows sit exactly over the gallery's, so the page seems to go on forever; the
// wall adds random cats as it nears its end. The page's background fades to the wall's green on the way in.
import { avatarSvg, catForSeed } from '../lib/pixel-cat/index.ts';
import { catTile, mix, svgDataUrl, type CatTile } from '../lib/page.ts';

/** The wall's chrome and dock appear once it is scrolled this many px past the seam. */
const CHROME_DEPTH = 600;
/** A scroll this many ms after a wheel event is the wheel's doing. */
const WHEEL_SCROLL_MS = 250;
const GALLERY_ROWS = 5;
/** Cats waiting in the wall below the gallery's, and how many rows it adds at a time as the scroll nears its end. */
const WALL_EXTRA = 160;
const APPEND_ROWS = 8;
/** The wall's grid holds the rows within this many screens of the viewport (ADR 0002). */
const WINDOW_ABOVE = 1;
const WINDOW_BELOW = 3;
/** Tiles for the rows this many screens out are made ahead of the scroll, in idle time. */
const PREP_ABOVE = 2;
const PREP_BELOW = 8;
const WALL_COLOR = '#0b2e22';
/** Tiles are made in batches of about this many ms per frame, so a slow phone keeps scrolling. */
const FRAME_BUDGET_MS = 8;

export interface CatsOptions {
  /** Load a picked cat into the generator. */
  onPick(seed: bigint): void;
  /** The generator's cat on its disc, for the wall's dock before a cat is hovered. */
  currentAvatarUrl(): string;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const randomSeeds = (count: number): bigint[] => Array.from(crypto.getRandomValues(new BigUint64Array(count)));
const catNumber = (index: number) => `No. ${String(index + 1).padStart(4, '0')}`;
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Runs `job` in idle time, or a frame's budget at a time when `urgent()` or where idle callbacks are missing,
 * until it returns false. The job stops early once `busy()` is true.
 */
function inSlices(job: (busy: () => boolean) => boolean, urgent: () => boolean): void {
  const run = (end: number) => job(() => performance.now() > end) && next();
  const next = () => {
    if (urgent() || !('requestIdleCallback' in window)) {
      requestAnimationFrame(() => run(performance.now() + FRAME_BUDGET_MS));
    } else {
      requestIdleCallback((idle) => run(performance.now() + Math.min(idle.timeRemaining(), FRAME_BUDGET_MS)));
    }
  };
  next();
}

export function initCats({ onPick, currentAvatarUrl }: CatsOptions): void {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const root = document.documentElement;
  const scroller = document.scrollingElement!;
  const pageParts = document.querySelectorAll<HTMLElement>('body > header, body > main');
  const cats = $('cats');
  const head = $('cats-head');
  const heading = $('cats-title');
  const links = head.querySelector<HTMLElement>('.site-links')!;
  const gallery = $('gallery');
  const wall = $('wall');
  const wallScroll = $('wall-scroll');
  const wallSpacer = $('wall-spacer');
  const wallGrid = $('wall-grid');
  const chrome = $('wall-chrome');
  const count = $('wall-count');
  const dockImg = $<HTMLImageElement>('dock-img');
  const dockTitle = $('dock-title');
  const dockSub = $('dock-sub');

  root.classList.add('js');

  /** The gallery's cats, made once; the wall's first rows are the same cats. */
  const tiles = new Map<bigint, CatTile>();
  const tileFor = (seed: bigint): CatTile => {
    let tile = tiles.get(seed);
    if (!tile) tiles.set(seed, (tile = catTile(seed)));
    return tile;
  };

  // MARK: Gallery

  const gallerySeeds = randomSeeds(48 * GALLERY_ROWS);
  let shown: bigint[] = [];
  let cols = 0;
  let galleryJob = 0;

  function galleryTile(seed: bigint): HTMLElement {
    const tile = tileFor(seed);
    const link = Object.assign(document.createElement('a'), { className: 'tile', href: `?seed=${seed}`, title: tile.label });
    link.dataset.seed = seed.toString();
    link.style.setProperty('--disc', tile.discHex);
    link.append(Object.assign(new Image(64, 64), { src: tile.spriteUrl, alt: tile.label }));
    return link;
  }

  /** Redraws the gallery with `cols × GALLERY_ROWS` cats, swapping them in only once all are made. */
  function drawGallery(): void {
    const job = ++galleryJob;
    const made = document.createDocumentFragment();
    let i = 0;
    const step = () => {
      if (job !== galleryJob) return;
      const start = performance.now();
      while (i < shown.length && performance.now() - start < FRAME_BUDGET_MS) made.append(galleryTile(shown[i++]));
      if (i < shown.length) requestAnimationFrame(step);
      else gallery.replaceChildren(made);
    };
    requestAnimationFrame(step);
  }

  // MARK: Wall

  // The wall is a window onto its cats (ADR 0002): its grid holds whole rows [first, last) near the viewport,
  // and padding of exactly the rows it leaves out keeps its height. Tile `index` is cat `wallSeeds[index]`, in
  // row `index / wallCols`, at `row × pitch` below the grid's top. The grid's top never moves, so neither does
  // the seam at `scrollTop` 0.
  let mode: 'page' | 'wall' = 'page';
  /** The gallery's cats, then the extras: the wall's first rows are the gallery's, in the same order. */
  let wallSeeds: bigint[] = [];
  /** Whether the wall still starts with the gallery's cats; a column change while it's open can break that. */
  const wallFitsGallery = () => shown.every((seed, i) => wallSeeds[i] === seed);
  let extra = randomSeeds(WALL_EXTRA);
  /** The wall grid's columns and row height in px, read from its tracks. */
  let wallCols = 1;
  let pitch = 0;
  /** The grid's top in the wall's scroll coordinates: the gallery's top when the wall last opened. */
  let gridTop = 0;
  let first = 0;
  let last = 0;
  /** Tiles made, by index: those in the grid, and those made ahead for it. */
  const made = new Map<number, HTMLElement>();
  const tileData = new WeakMap<Element, CatTile>();
  let filling = false;
  let preparing = false;

  // The open wall covers the heading's links, and the page under it is inert, so the wall carries a copy of
  // them pinned over the originals. The copy is inside the wall's scroller, so a wheel gesture that starts
  // over it still scrolls the wall (see "Scrolling across the seam").
  const linksCopy = links.cloneNode(true) as HTMLElement;
  linksCopy.classList.add('wall-links');
  const wallHead = Object.assign(document.createElement('div'), { className: 'wall-head' });
  wallHead.append(linksCopy);
  wallScroll.prepend(wallHead);
  // Takes focus from a tile scrolled out of the grid (see setRows), without joining the tab order.
  wallScroll.tabIndex = -1;
  /** How far the wall scrolls before its grid reaches the links' top; 0 while they are off screen. */
  let linksDepth = 0;

  /** The wall's tile `index`, made once and kept while it's near the viewport. Its sprite loads before it's shown. */
  function wallTile(index: number): HTMLElement {
    let button = made.get(index);
    if (button) return button;
    const seed = wallSeeds[index];
    // The gallery's cats are already made; the rest aren't kept past their tiles.
    const tile = tiles.get(seed) ?? catTile(seed);
    button = Object.assign(document.createElement('button'), { type: 'button', className: 'tile' });
    button.dataset.seed = seed.toString();
    button.dataset.index = String(index);
    button.style.setProperty('--disc', tile.discHex);
    button.setAttribute('aria-label', `${catNumber(index)}, ${tile.label}`);
    button.append(Object.assign(new Image(64, 64), { src: tile.spriteUrl, alt: '' }));
    tileData.set(button, tile);
    made.set(index, button);
    return button;
  }

  function rowsOf(from: number, to: number): DocumentFragment {
    const rows = document.createDocumentFragment();
    for (let i = from * wallCols; i < to * wallCols; i++) rows.append(wallTile(i));
    return rows;
  }

  /** Puts rows [from, to) in the grid, keeping the ones already there, and pads it to its full height. */
  function setRows(from: number, to: number): void {
    if (from === first && to === last) return;
    // A tile leaving with keyboard focus hands it to the wall, which keeps scrolling from the keyboard.
    const focused = wallGrid.contains(document.activeElement) ? (document.activeElement as HTMLElement) : null;
    const focusedRow = focused ? Math.floor(Number(focused.dataset.index) / wallCols) : -1;
    if (focused && (focusedRow < from || focusedRow >= to)) wallScroll.focus({ preventScroll: true });
    if (to <= first || from >= last || first === last) {
      wallGrid.replaceChildren(rowsOf(from, to));
    } else {
      for (let i = first * wallCols; i < from * wallCols; i++) made.get(i)!.remove();
      for (let i = to * wallCols; i < last * wallCols; i++) made.get(i)!.remove();
      if (from < first) wallGrid.prepend(rowsOf(from, first));
      if (to > last) wallGrid.append(rowsOf(last, to));
    }
    first = from;
    last = to;
    padWall();
  }

  function padWall(): void {
    wallGrid.style.paddingTop = `${first * pitch}px`;
    wallGrid.style.paddingBottom = `${(Math.ceil(wallSeeds.length / wallCols) - last) * pitch}px`;
  }

  /** Reads the wall grid's columns and row height; a tile is square, so a row is as tall as a column is wide. */
  function measureWall(): void {
    const tracks = getComputedStyle(wallGrid).gridTemplateColumns.split(' ').filter(Boolean);
    wallCols = tracks.length || 1;
    pitch = parseFloat(tracks[0]) || 0;
  }

  /** The rows the viewport shows, and how many rows make a screen. The wall gets cats for every row made ahead. */
  function inView(): { top: number; bottom: number; screen: number } {
    const y = wallScroll.scrollTop - gridTop;
    const height = wallScroll.clientHeight;
    const top = Math.max(0, Math.floor(y / pitch));
    const bottom = Math.max(top + 1, Math.ceil((y + height) / pitch));
    const screen = Math.ceil(height / pitch);
    growWall(bottom + PREP_BELOW * screen + 1);
    return { top, bottom, screen };
  }

  /** Adds cats until the wall has whole rows to `rows`. */
  function growWall(rows: number): void {
    const missing = rows * wallCols - wallSeeds.length;
    if (missing <= 0) return;
    const step = wallCols * APPEND_ROWS;
    const more = randomSeeds(Math.ceil(missing / step) * step);
    extra = extra.concat(more);
    wallSeeds = wallSeeds.concat(more);
    count.textContent = `${wallSeeds.length.toLocaleString('en-US')} cats`;
    padWall();
  }

  /**
   * Keeps the grid's rows on the viewport. While the wall is open the rows in view are put in at once, made
   * now if they weren't made ahead; the rest of the window follows a frame at a time, and more tiles are made
   * in idle time.
   */
  function updateWall(): void {
    if (!pitch) return;
    const { top, bottom, screen } = inView();
    if (mode === 'wall') {
      if (bottom <= first || top >= last) setRows(top, bottom);
      else {
        const from = Math.max(top - (WINDOW_ABOVE + 1) * screen, Math.min(first, top));
        setRows(from, Math.min(bottom + (WINDOW_BELOW + 1) * screen, Math.max(last, bottom)));
      }
    }
    if (!filling) {
      filling = true;
      inSlices(fillWall, () => mode === 'wall');
    }
    if (!preparing) {
      preparing = true;
      inSlices(prepareWall, () => false);
    }
  }

  /** Grows the grid's rows to the window, nearest first, and drops those well outside it. */
  function fillWall(busy: () => boolean): boolean {
    const { top, bottom, screen } = inView();
    const from = Math.max(0, top - WINDOW_ABOVE * screen);
    const to = bottom + WINDOW_BELOW * screen;
    if (last <= from || first >= to || first === last) setRows(top, top + 1);
    else setRows(Math.max(first, from - screen), Math.min(last, to + screen));
    while (!busy() && (last < to || first > from)) {
      if (last < to) setRows(first, last + 1);
      else setRows(first - 1, last);
    }
    forgetFar(top, bottom, screen);
    return (filling = last < to || first > from);
  }

  /** The tiles to make ahead of the scroll, as [from, to) indices. */
  function prepZone(top: number, bottom: number, screen: number): [number, number] {
    return [Math.max(0, top - PREP_ABOVE * screen) * wallCols, (bottom + PREP_BELOW * screen) * wallCols];
  }

  /** Forgets tiles out of the grid and a screen past those made ahead: memory stays flat however far the wall goes. */
  function forgetFar(top: number, bottom: number, screen: number): void {
    const [from, to] = prepZone(top, bottom, screen);
    const slack = screen * wallCols;
    for (const [index, tile] of made) {
      if ((index < from - slack || index >= to + slack) && !tile.isConnected) made.delete(index);
    }
  }

  /** Makes the tiles for the rows past the window, below first. */
  function prepareWall(busy: () => boolean): boolean {
    const { top, bottom, screen } = inView();
    const [from, to] = prepZone(top, bottom, screen);
    forgetFar(top, bottom, screen);
    for (let i = last * wallCols; i < to; i++) {
      if (busy()) return true;
      wallTile(i);
    }
    for (let i = first * wallCols - 1; i >= from; i--) {
      if (busy()) return true;
      wallTile(i);
    }
    return (preparing = false);
  }

  /** Starts the wall over from the gallery's cats, at its top. */
  function rebuildWall(): void {
    measureWall();
    wallSeeds = shown.concat(extra);
    count.textContent = `${wallSeeds.length.toLocaleString('en-US')} cats`;
    made.clear();
    first = last = 0;
    wallGrid.replaceChildren();
    padWall();
    updateWall();
  }

  /**
   * After the wall's columns or row height change, lays its rows out again around the cat at the viewport's
   * top, so the numbers run on and the same cats stay in view. At the seam, it stays at the seam.
   */
  function relayoutWall(): void {
    const [oldCols, oldPitch] = [wallCols, pitch];
    measureWall();
    if (wallCols === oldCols && pitch === oldPitch) return;
    const focused = wallGrid.contains(document.activeElement) ? (document.activeElement as HTMLElement) : null;
    const y = wallScroll.scrollTop - gridTop;
    first = last = 0;
    wallGrid.replaceChildren();
    padWall();
    if (oldPitch && y > 0 && wallScroll.scrollTop >= 1) {
      const row = y / oldPitch;
      wallScroll.scrollTop = gridTop + (Math.floor((Math.floor(row) * oldCols) / wallCols) + (row % 1)) * pitch;
    }
    updateWall();
    if (focused?.isConnected) focused.focus({ preventScroll: true });
  }

  /** Puts the wall's grid exactly over the gallery's; returns the gallery's place in the viewport. */
  function alignWall(): DOMRect {
    const rect = gallery.getBoundingClientRect();
    wallGrid.style.marginLeft = `${rect.left}px`;
    wallGrid.style.width = `${rect.width}px`;
    const at = links.getBoundingClientRect();
    Object.assign(linksCopy.style, { left: `${at.left}px`, top: `${at.top}px`, width: `${at.width}px` });
    linksDepth = at.bottom > 0 ? rect.top - at.top : 0;
    coverLinks();
    return rect;
  }

  /** Once the wall's grid covers the copied links, keyboard focus skips them. */
  function coverLinks(): void {
    linksCopy.inert = wallScroll.scrollTop >= linksDepth;
  }

  function setChrome(shownNow: boolean): void {
    chrome.classList.toggle('is-shown', shownNow);
  }

  function resetDock(): void {
    dockImg.src = currentAvatarUrl();
    dockTitle.textContent = 'Endless cats';
    dockSub.textContent = 'Pick a cat to open it in the generator';
  }

  function setOpen(open: boolean): void {
    wall.classList.toggle('is-open', open);
    wall.inert = !open;
    if (open) wall.removeAttribute('aria-hidden');
    else wall.setAttribute('aria-hidden', 'true');
    for (const part of pageParts) part.inert = open;
    links.style.visibility = open ? 'hidden' : '';
  }

  /** Opens the wall over the page, which is scrolled to its end, `leftover` px past the seam. */
  function enterWall(leftover: number): void {
    const rect = alignWall();
    mode = 'wall';
    // The seam is the wall's top. A gallery taller than the viewport starts above it, and so does the wall's
    // grid, out of the wall's reach: its rows up there are the page's to show.
    wallSpacer.style.height = `${Math.max(0, rect.top)}px`;
    wallGrid.style.marginTop = `${Math.min(0, rect.top)}px`;
    gridTop = rect.top;
    // The page shows through the wall beside its grid; the scroll handler's fade restores it on the way out.
    document.body.style.backgroundColor = WALL_COLOR;
    linksCopy.style.opacity = head.style.opacity;
    resetDock();
    setChrome(false);
    setOpen(true);
    wallScroll.scrollTop = Math.max(0, leftover);
    coverLinks();
    // The rows in view go in now, before the wall is first drawn; they were normally made while it was shut.
    updateWall();
  }

  /** Closes the wall onto the page's end, `leftover` px (≤ 0) back up from it, or onto the top of the page. */
  function exitWall(leftover: number, toTop: boolean): void {
    mode = 'page';
    setChrome(false);
    setOpen(false);
    // The wall opens at its top next time; its rows there are made again while the page is up.
    wallScroll.scrollTop = 0;
    // A column change while the wall was open left it the old gallery's cats; shut, it starts over from the
    // new gallery's so its first rows sit over the same cats again (ADR 0001).
    if (wallFitsGallery()) updateWall();
    else rebuildWall();
    if (toTop) {
      window.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' });
    } else {
      scroller.scrollTop = scroller.scrollHeight;
      scroller.scrollTop += leftover;
    }
  }

  function pick(seed: bigint): void {
    if (mode === 'wall') exitWall(0, true);
    else window.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' });
    onPick(seed);
  }

  function backToPage(): void {
    exitWall(0, false);
    heading.focus({ preventScroll: true });
  }

  // MARK: Scrolling across the seam

  /** How far the page is from its end, in px. */
  const pageLeft = () => scroller.scrollHeight - scroller.scrollTop - innerHeight;

  // The browser keeps a wheel gesture, momentum and all, on the scroller it picked for the gesture's first
  // event, and neither the page nor the wall can scroll or stretch past the seam (`overscroll-behavior:
  // none`). So a gesture that reaches the seam stops dead there, and the wall swaps in or out underneath it:
  // the next gesture starts on the other side and scrolls it natively. A gesture that starts at the seam
  // headed the other way swaps on its first event, the only one the browser lets the page cancel; held back
  // until the swap is on screen, the gesture then starts on the right side too.
  let wheelAt = -Infinity;
  let wheelDown = false;
  let holds = 0;

  /** Cancels what wheel events the page may cancel until the frame after this one. */
  function hold(): void {
    holds++;
    requestAnimationFrame(() => requestAnimationFrame(() => holds--));
  }

  /** Swaps the wall in or out if the wheel heads across the seam from where it is. */
  function swapAtSeam(): void {
    if (mode === 'page' && wheelDown && pageLeft() < 1) {
      enterWall(0);
      hold();
    } else if (mode === 'wall' && !wheelDown && wallScroll.scrollTop < 1) {
      exitWall(0, false);
      hold();
    }
  }

  function onWheel(event: WheelEvent): void {
    if (event.ctrlKey || !event.deltaY) return;
    wheelAt = performance.now();
    wheelDown = event.deltaY > 0;
    swapAtSeam();
    if (holds && event.cancelable) event.preventDefault();
  }

  /** A wheel's scroll reaching the seam swaps too, should no wheel event follow it there. */
  function onScrollToSeam(): void {
    if (performance.now() - wheelAt < WHEEL_SCROLL_MS) swapAtSeam();
  }

  let touchY = 0;
  function onTouchMove(event: TouchEvent): void {
    const y = event.touches[0].clientY;
    const dy = touchY - y;
    touchY = y;
    if (mode === 'page') {
      if (dy > 0 && pageLeft() <= 1) {
        event.preventDefault();
        enterWall(dy);
      }
    } else if (dy < 0 && wallScroll.scrollTop <= 0) {
      event.preventDefault();
      exitWall(dy, false);
    }
  }

  // MARK: Background fade

  let canvasColor = '';
  const readCanvas = () => (canvasColor = getComputedStyle(root).getPropertyValue('--color-canvas').trim());
  let fadeQueued = false;

  /** The page fades into the wall's green as the gallery arrives; the gallery's heading fades out as it leaves. */
  function fade(): void {
    fadeQueued = false;
    const top = cats.getBoundingClientRect().top;
    const arrived = clamp01((innerHeight * 0.9 - top) / (innerHeight * 0.5));
    document.body.style.backgroundColor = mix(WALL_COLOR, arrived, canvasColor);
    const rect = head.getBoundingClientRect();
    const leaving = clamp01((rect.bottom - 24) / (rect.height * 0.8));
    head.style.opacity = String(Math.min(clamp01((arrived - 0.35) / 0.5), leaving));
  }

  function queueFade(): void {
    if (fadeQueued) return;
    fadeQueued = true;
    requestAnimationFrame(fade);
  }

  // MARK: Wiring

  new ResizeObserver(() => {
    const measured = getComputedStyle(gallery).gridTemplateColumns.split(' ').filter(Boolean).length || 1;
    const changed = measured !== cols;
    if (changed) {
      cols = measured;
      shown = gallerySeeds.slice(0, cols * GALLERY_ROWS);
      drawGallery();
    }
    // The shut wall keeps the gallery's width too, so its rows are laid out as they'll open.
    alignWall();
    if (changed && mode === 'page') rebuildWall();
    else relayoutWall();
  }).observe(gallery);

  gallery.addEventListener('click', (event) => {
    const link = (event.target as Element).closest<HTMLElement>('a[data-seed]');
    // A modified click opens the cat's link in a new tab, as a link should.
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    pick(BigInt(link.dataset.seed!));
  });

  wallGrid.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLElement>('button[data-seed]');
    if (button) pick(BigInt(button.dataset.seed!));
  });

  const showInDock = (event: Event) => {
    const button = (event.target as Element).closest<HTMLElement>('button[data-seed]');
    if (!button) return;
    const seed = BigInt(button.dataset.seed!);
    const tile = tileData.get(button)!;
    dockImg.src = svgDataUrl(avatarSvg(catForSeed(seed), tile.discHex, { xmlns: true }));
    dockTitle.textContent = catNumber(Number(button.dataset.index));
    dockSub.textContent = tile.label;
  };
  wallGrid.addEventListener('mouseover', showInDock);
  wallGrid.addEventListener('focusin', showInDock);

  wallScroll.addEventListener(
    'scroll',
    () => {
      setChrome(wallScroll.scrollTop > CHROME_DEPTH);
      coverLinks();
      updateWall();
    },
    { passive: true },
  );
  wallScroll.addEventListener('scroll', onScrollToSeam, { passive: true });

  $('wall-back').addEventListener('click', backToPage);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && mode === 'wall') backToPage();
  });

  addEventListener('wheel', onWheel, { passive: false });
  addEventListener('touchstart', (event) => (touchY = event.touches[0].clientY), { passive: true });
  addEventListener('touchmove', onTouchMove, { passive: false });
  addEventListener('resize', () => mode === 'wall' && alignWall());
  addEventListener('scroll', queueFade, { passive: true });
  addEventListener('scroll', onScrollToSeam, { passive: true });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    readCanvas();
    fade();
  });
  readCanvas();
  fade();
}
