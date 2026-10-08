// Keep the old theme behind a circle that grows from the activated toggle.
export function revealTheme(update: () => void, origin?: HTMLElement | null) {
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  if (reduceMotion || !document.startViewTransition) {
    update();
    return null;
  }
  const bounds = origin?.getBoundingClientRect();
  const x = bounds ? bounds.left + bounds.width / 2 : window.innerWidth / 2;
  const y = bounds ? bounds.top + bounds.height / 2 : window.innerHeight / 2;
  const radius = Math.ceil(
    Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    ),
  );
  document.documentElement.dataset.themeReveal = "true";
  const transition = document.startViewTransition(update);
  void transition.ready
    .then(() => {
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${radius}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: 680,
          easing: "cubic-bezier(0.4, 0, 0.2, 1)",
          pseudoElement: "::view-transition-new(root)",
          fill: "both",
        },
      );
    })
    .catch(() => {
      /* A hidden tab or interrupted transition still applies the theme. */
    });
  void transition.finished
    .finally(() => {
      delete document.documentElement.dataset.themeReveal;
    })
    .catch(() => undefined);
  return transition;
}
