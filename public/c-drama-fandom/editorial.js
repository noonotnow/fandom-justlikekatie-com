(() => {
  const track = (name, data) => {
    if (typeof window.gtag === "function") {
      window.gtag("event", name, data);
      return;
    }
    if (Array.isArray(window.dataLayer)) {
      window.dataLayer.push(["event", name, data]);
    }
  };

  document.querySelectorAll("[data-atlas-continuation]").forEach((link) => {
    link.addEventListener("click", () => {
      track("editorial_atlas_continuation_clicked", {
        source_page: document.body.dataset.sourcePage || "unknown",
        content_mode: document.body.dataset.contentMode || "unknown",
      });
    });
  });
})();
