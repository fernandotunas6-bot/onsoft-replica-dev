/**
 * Idle-time preloading helpers so images and icon glyphs are already warm
 * before the user touches them — no visual or colour change, only speed.
 */

const warmed = new Set<string>();

function onIdle(fn: () => void) {
  if (typeof window === "undefined") return;
  const ric = (
    window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    }
  ).requestIdleCallback;
  if (ric) ric(fn, { timeout: 1200 });
  else window.setTimeout(fn, 200);
}

/** Decode images ahead of time (cached by URL, safe to call repeatedly). */
export function prefetchImages(urls: (string | undefined | null)[]) {
  onIdle(() => {
    for (const url of urls) {
      if (!url || warmed.has(url)) continue;
      warmed.add(url);
      const img = new Image();
      img.decoding = "async";
      img.loading = "eager";
      img.src = url;
    }
  });
}

/** Add <link rel="preload" as="image"> for above-the-fold media. */
export function preloadImage(url: string, priority = false) {
  if (typeof document === "undefined" || warmed.has(url)) return;
  warmed.add(url);
  const link = document.createElement("link");
  link.rel = "preload";
  link.as = "image";
  link.href = url;
  if (priority) link.setAttribute("fetchpriority", "high");
  document.head.appendChild(link);
}
