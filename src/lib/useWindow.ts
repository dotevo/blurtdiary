import { onBeforeUnmount, onMounted, watch, nextTick, type Ref } from 'vue';
import type { ListWindow, WList } from './world';

/**
 * Memory-bounded infinite scroll, view side: watches the scroll position, tells the list which card is on screen (the list drops far-away
 * cards, keeping stubs) and asks it to bring back stubs that come near the viewport. Cards carry `data-k` (the item key).
 * `enabled()` false = do not drop anything (e.g. the feed re-sorted by payout, where screen order differs from list order).
 */
export function useWindow(root: Ref<HTMLElement | null>, list: () => WList, win: () => ListWindow, enabled: () => boolean = () => true): void {
  let timer = 0;
  const tick = (): void => {
    timer = 0;
    const els = [...(root.value?.querySelectorAll<HTMLElement>('[data-k]') ?? [])]; if (!els.length) return;
    const w = win(); const vh = window.innerHeight;
    for (const el of els) { // stubs near the viewport come back
      if (el.dataset.stub !== '1') continue;
      const r = el.getBoundingClientRect();
      if (r.bottom > -vh && r.top < vh * 2) void w.hydrate(el.dataset.k ?? '');
    }
    if (!enabled() || els.length <= 90) return;
    const first = els.find((el) => el.getBoundingClientRect().bottom > 0) ?? els[0];
    const heights: Record<string, number> = {};
    for (const el of els) if (el.dataset.stub !== '1') heights[el.dataset.k ?? ''] = el.offsetHeight;
    w.trim(first.dataset.k ?? '', heights);
  };
  const soon = (): void => { if (!timer) timer = window.setTimeout(tick, 150); };
  onMounted(() => { window.addEventListener('scroll', soon, { passive: true }); window.addEventListener('resize', soon); });
  onBeforeUnmount(() => { window.removeEventListener('scroll', soon); window.removeEventListener('resize', soon); clearTimeout(timer); });
  watch(() => list().items, () => { void nextTick(soon); });
}
