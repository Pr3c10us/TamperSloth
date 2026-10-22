/** One observer for every [data-reveal] element on the page; returns its cleanup. */
export function observeReveals(): () => void {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
      }
    },
    { rootMargin: "0px 0px -12% 0px" },
  );
  document.querySelectorAll("[data-reveal]").forEach((el) => io.observe(el));
  return () => io.disconnect();
}
