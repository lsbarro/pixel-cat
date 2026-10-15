// The home page's "More cats" gallery and the endless wall past it. Scrolling past the gallery opens a
// full-screen wall whose first rows sit exactly over the gallery's, so the page seems to go on forever; the
// wall adds random cats as it nears its end. The page's background fades to the wall's green on the way in.
import { avatarSvg, catForSeed } from '../lib/pixel-cat/index.ts';
import { catTile, mix, svgDataUrl, type CatTile } from '../lib/page.ts';

/** Within this many px of the seam between the page and the wall, scrolling eases, to 70% at the seam. */
const SLOW_ZONE = 250;
/** Scroll speed at the seam itself, as a share of full speed. */
const SLOW_FLOOR = 0.7;
/** The wall's chrome and dock appear once it is scrolled this many px past the seam. */
const CHROME_DEPTH = 600;
const GALLERY_ROWS = 5;
/** Cats waiting in the wall below the gallery's, and how many rows it adds when its end comes near. */
const WALL_EXTRA = 160;
const APPEND_ROWS = 8;
/** The wall adds rows once its end is this close. */
const APPEND_MARGIN = 900;
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

export function initCats({ onPick, currentAvatarUrl }: CatsOptions): void {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const root = document.documentElement;
  const scroller = document.scrollingElement!;
  const pageParts = document.querySelectorAll<HTMLElement>('body > header, body > main');
  const cats = $('cats');
  const head = $('cats-head');
  const heading = $('cats-title');
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

  let mode: 'page' | 'wall' = 'page';
  /** The gallery's cats, then the extras: the wall's first rows are the gallery's, in the same order. */
  let wallSeeds: bigint[] = [];
  let extra = randomSeeds(WALL_EXTRA);
  let wallDrawn = 0;
  let drawing = false;
  /** The wall's scrollTop at which it lines up exactly with the page scrolled to its end. */
  let seam = 0;

  function wallTile(seed: bigint, index: number): HTMLElement {
    const tile = tileFor(seed);
    const button = Object.assign(document.createElement('button'), { type: 'button', className: 'tile' });
    button.dataset.seed = seed.toString();
    button.dataset.index = String(index);
    button.style.setProperty('--disc', tile.discHex);
    button.setAttribute('aria-label', `${catNumber(index)}, ${tile.label}`);
    button.append(Object.assign(new Image(64, 64), { src: tile.spriteUrl, alt: '' }));
    return button;
  }

  /** Draws any wall seeds not yet on the wall, a frame's budget at a time. */
  function drawWall(): void {
    count.textContent = `${wallSeeds.length.toLocaleString('en-US')} cats`;
    if (drawing) return;
    drawing = true;
    const step = () => {
      const start = performance.now();
      const made = document.createDocumentFragment();
      while (wallDrawn < wallSeeds.length && performance.now() - start < FRAME_BUDGET_MS) {
        made.append(wallTile(wallSeeds[wallDrawn], wallDrawn));
        wallDrawn++;
      }
      wallGrid.append(made);
      if (wallDrawn < wallSeeds.length) requestAnimationFrame(step);
      else drawing = false;
    };
    requestAnimationFrame(step);
  }

  function rebuildWall(): void {
    wallSeeds = shown.concat(extra);
    wallDrawn = 0;
    wallGrid.replaceChildren();
    drawWall();
  }

  /** Puts the wall's grid exactly over the gallery's; returns the gallery's place in the viewport. */
  function alignWall(): DOMRect {
    const rect = gallery.getBoundingClientRect();
    wallGrid.style.marginLeft = `${rect.left}px`;
    wallGrid.style.width = `${rect.width}px`;
    return rect;
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
  }

  /** Opens the wall over the page, which is scrolled to its end, `leftover` px past the seam. */
  function enterWall(leftover: number): void {
    const rect = alignWall();
    mode = 'wall';
    // A gallery taller than the viewport starts above it; the wall then starts scrolled by that much.
    wallSpacer.style.height = `${Math.max(0, rect.top)}px`;
    seam = Math.max(0, -rect.top);
    // The page shows through the wall beside its grid; the scroll handler's fade restores it on the way out.
    document.body.style.backgroundColor = WALL_COLOR;
    resetDock();
    setChrome(false);
    setOpen(true);
    wallScroll.scrollTop = seam + Math.max(0, leftover);
  }

  /** Closes the wall onto the page's end, `leftover` px (≤ 0) back up from it, or onto the top of the page. */
  function exitWall(leftover: number, toTop: boolean): void {
    mode = 'page';
    setChrome(false);
    setOpen(false);
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

  /** Scroll speed near the seam: full speed `SLOW_ZONE` px away, 70% at the seam, on a smoothstep curve. */
  const damp = (distance: number) => {
    const t = clamp01(distance / SLOW_ZONE);
    return SLOW_FLOOR + (1 - SLOW_FLOOR) * t * t * (3 - 2 * t);
  };

  function onWheel(event: WheelEvent): void {
    if (event.ctrlKey) return;
    const dy = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * innerHeight : event.deltaY;
    if (!dy) return;
    if (mode === 'page') {
      const remaining = scroller.scrollHeight - scroller.scrollTop - innerHeight;
      if (dy < 0 || remaining > SLOW_ZONE) return;
      event.preventDefault();
      const step = dy * damp(remaining);
      if (step >= remaining - 0.5) {
        scroller.scrollTop = scroller.scrollHeight;
        enterWall(step - Math.max(0, remaining));
      } else {
        scroller.scrollTop += step;
      }
    } else {
      const distance = wallScroll.scrollTop - seam;
      if (distance > SLOW_ZONE) return;
      event.preventDefault();
      const step = dy * damp(distance);
      if (distance + step < 0) exitWall(distance + step, false);
      else wallScroll.scrollTop += step;
    }
  }

  let touchY = 0;
  function onTouchMove(event: TouchEvent): void {
    const y = event.touches[0].clientY;
    const dy = touchY - y;
    touchY = y;
    if (mode === 'page') {
      const remaining = scroller.scrollHeight - scroller.scrollTop - innerHeight;
      if (dy > 0 && remaining <= 1) {
        event.preventDefault();
        enterWall(dy);
      }
    } else if (dy < 0 && wallScroll.scrollTop <= seam) {
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
    if (measured !== cols) {
      cols = measured;
      shown = gallerySeeds.slice(0, cols * GALLERY_ROWS);
      drawGallery();
      if (mode === 'page') rebuildWall();
    }
    if (mode === 'wall') alignWall();
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
    const tile = tileFor(seed);
    dockImg.src = svgDataUrl(avatarSvg(catForSeed(seed), tile.discHex, { xmlns: true }));
    dockTitle.textContent = catNumber(Number(button.dataset.index));
    dockSub.textContent = tile.label;
  };
  wallGrid.addEventListener('mouseover', showInDock);
  wallGrid.addEventListener('focusin', showInDock);

  wallScroll.addEventListener(
    'scroll',
    () => {
      setChrome(wallScroll.scrollTop - seam > CHROME_DEPTH);
      const nearEnd = wallScroll.scrollTop + wallScroll.clientHeight > wallScroll.scrollHeight - APPEND_MARGIN;
      if (nearEnd && !drawing) {
        const more = randomSeeds(cols * APPEND_ROWS);
        extra = extra.concat(more);
        wallSeeds = wallSeeds.concat(more);
        drawWall();
      }
    },
    { passive: true },
  );

  $('wall-back').addEventListener('click', backToPage);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && mode === 'wall') backToPage();
  });

  addEventListener('wheel', onWheel, { passive: false });
  addEventListener('touchstart', (event) => (touchY = event.touches[0].clientY), { passive: true });
  addEventListener('touchmove', onTouchMove, { passive: false });
  addEventListener('resize', () => mode === 'wall' && alignWall());
  addEventListener('scroll', queueFade, { passive: true });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    readCanvas();
    fade();
  });
  readCanvas();
  fade();
}
