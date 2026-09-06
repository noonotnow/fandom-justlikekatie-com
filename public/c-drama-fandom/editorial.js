(() => {
  const sourcePages = new Set([
    "c-drama-fandom-hub",
    "glossary-index",
    "glossary-cp",
    "glossary-cultivation",
    "glossary-jianghu",
    "glossary-xianxia",
    "glossary-wuxia",
    "genre-comparison",
    "historical-costume-guzhuang",
    "duanju-format-comparison",
    "archetypes-index",
    "archetypes-cold-vs-tsundere",
    "archetypes-black-bellied-white-cut-black",
    "archetypes-white-moonlight-cinnabar-mole",
  ]);
  const contentModes = new Set(["fandom-literacy", "genre-guide", "format-guide", "archetype-guide"]);
  const sectionIds = new Set([
    "short-answer",
    "genre-grammar",
    "comparison",
    "field-lens",
    "common-questions",
    "archetype-map",
    "temperament",
    "relationship",
    "power",
    "pattern-test",
    "format-grammar",
    "term-origins",
    "memory-symbol",
    "quick-answer",
    "boundary-check",
    "interactive-tool",
    "watch-application",
    "atlas-continuation",
    "archetype-signals",
    "fandom-usage",
    "symbolic-role",
  ]);
  const topicIds = new Set([
    "wuxia",
    "xianxia",
    "xuanhuan",
    "jianghu",
    "cold-lead",
    "tsundere",
    "black-bellied",
    "puppy-lead",
    "green-flag",
    "domineering-ceo",
    "morally-gray",
    "devoted-second-lead",
    "gentle-scholar",
    "fallen-immortal",
    "historical-drama",
    "costume-drama",
    "guzhuang",
    "duanju",
    "microdrama",
    "vertical-drama",
    "white-cut-black",
    "white-moonlight",
    "cinnabar-mole",
  ]);
  const destinationTypes = new Set(["article", "glossary", "atlas"]);
  const toolActions = new Set([
    "genre-signal-toggle",
    "genre-reset",
    "archetype-filter",
    "pattern-toggle",
    "pattern-reset",
    "grounding-toggle",
    "grounding-reset",
    "format-toggle",
    "format-reset",
    "mask-toggle",
    "mask-reset",
    "symbol-toggle",
    "symbol-reset",
  ]);

  const track = (name, data) => {
    if (typeof window.gtag === "function") {
      window.gtag("event", name, data);
      return;
    }
    if (Array.isArray(window.dataLayer)) {
      window.dataLayer.push(["event", name, data]);
    }
  };

  const sourcePage = sourcePages.has(document.body.dataset.sourcePage)
    ? document.body.dataset.sourcePage
    : "unknown";
  const contentMode = contentModes.has(document.body.dataset.contentMode)
    ? document.body.dataset.contentMode
    : "unknown";
  const baseData = { source_page: sourcePage, content_mode: contentMode };

  track("editorial_article_viewed", baseData);

  const reachedDepths = new Set();
  const recordDepth = () => {
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const percent = scrollable <= 0 ? 100 : Math.round((window.scrollY / scrollable) * 100);
    [25, 50, 75, 100].forEach((depth) => {
      if (percent >= depth && !reachedDepths.has(depth)) {
        reachedDepths.add(depth);
        track("editorial_read_depth_reached", { ...baseData, depth_percent: depth });
      }
    });
  };
  window.addEventListener("scroll", recordDepth, { passive: true });
  recordDepth();

  if ("IntersectionObserver" in window) {
    const seenSections = new Set();
    const sectionObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const sectionId = entry.target.dataset.sectionId;
        if (entry.isIntersecting && sectionIds.has(sectionId) && !seenSections.has(sectionId)) {
          seenSections.add(sectionId);
          track("editorial_section_viewed", { ...baseData, section_id: sectionId });
          sectionObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.45 });
    document.querySelectorAll("[data-section-id]").forEach((section) => sectionObserver.observe(section));
  }

  document.querySelectorAll("[data-topic-interest]").forEach((control) => {
    control.addEventListener("click", () => {
      const topicId = control.dataset.topicInterest;
      const destinationType = control.dataset.destinationType;
      if (!topicIds.has(topicId) || !destinationTypes.has(destinationType)) return;
      track("editorial_topic_interest_clicked", {
        ...baseData,
        topic_id: topicId,
        destination_type: destinationType,
      });
    });
  });

  document.querySelectorAll("[data-tool-action]").forEach((control) => {
    control.addEventListener("click", () => {
      const toolAction = control.dataset.toolAction;
      if (!toolActions.has(toolAction)) return;
      track("editorial_tool_engaged", { ...baseData, tool_action: toolAction });
    });
  });

  document.querySelectorAll("[data-atlas-continuation]").forEach((link) => {
    link.addEventListener("click", () => {
      track("editorial_atlas_continuation_clicked", baseData);
    });
  });
})();
