// Locale copy and card content live in each page; interaction behavior lives here.
(() => {
  const copy = JSON.parse(document.querySelector("#decoder-locale").textContent);
  const { publicUrl } = copy;
  const search = document.querySelector("#trope-search");
  const filterButtons = [...document.querySelectorAll(".decoder-filter")];
  const cards = [...document.querySelectorAll(".trope-card")];
  const count = document.querySelector("#trope-count");
  const empty = document.querySelector("#trope-empty");
  const shareButton = document.querySelector("#share-decoder");
  const shareStatus = document.querySelector("#share-status");
  const languageLinks = [...document.querySelectorAll("[data-language-link]")];
  const cardById = new Map(cards.map(card => [card.id, card]));
  const validFilters = new Set(["all", "love", "realm", "signs"]);

  const trackEvent = (name, data) => {
    try {
      if (typeof window.gtag === "function") {
        window.gtag("event", name, data);
        return;
      }
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push(["event", name, data]);
    } catch {
      // Analytics must never interfere with decoder interactions.
    }
  };

  let lastFilterSignature = "";
  let activeFilter = "all";
  const readContext = () => {
    const hash = window.location.hash.slice(1);
    if (cardById.has(hash)) return { filter: "all", cardId: hash };
    if (!hash.startsWith("context?")) return { filter: "all", cardId: "" };
    const params = new URLSearchParams(hash.slice("context?".length));
    const requestedFilter = params.get("filter");
    const requestedCard = params.get("card");
    return {
      filter: validFilters.has(requestedFilter) ? requestedFilter : "all",
      cardId: cardById.has(requestedCard) ? requestedCard : "",
    };
  };
  const initialContext = readContext();
  activeFilter = initialContext.filter;

  const syncLanguageLinks = () => {
    const queryPresent = Boolean(search.value.trim());
    const cardId = initialContext.cardId && !cardById.get(initialContext.cardId).hidden
      ? initialContext.cardId
      : cards.find(card => !card.hidden)?.id || "";
    const context = new URLSearchParams();
    if (activeFilter !== "all" || queryPresent) context.set("filter", activeFilter);
    if ((activeFilter !== "all" || queryPresent || initialContext.cardId) && cardId) {
      context.set("card", cardId);
    }
    const serializedContext = context.toString();
    const fragment = serializedContext ? `#context?${serializedContext}` : "";
    languageLinks.forEach(link => {
      link.href = `${link.dataset.languagePath}${fragment}`;
    });
  };

  const applyFilters = (shouldTrack = true) => {
    const query = search.value.trim().toLowerCase();
    let visible = 0;
    cards.forEach((card) => {
      const matchesSearch = !query || `${card.textContent} ${card.dataset.search}`.toLowerCase().includes(query);
      const matchesCategory = activeFilter === "all" || card.dataset.category === activeFilter;
      const matches = matchesSearch && matchesCategory;
      card.hidden = !matches;
      if (matches) visible += 1;
    });
    count.textContent = copy.count.replace("{visible}", visible).replace("{total}", cards.length);
    empty.hidden = visible !== 0;
    syncLanguageLinks();
    if (initialContext.cardId) {
      const contextCard = cardById.get(initialContext.cardId);
      if (contextCard && !contextCard.hidden && window.location.hash.startsWith("#context?")) {
        contextCard.scrollIntoView({ block: "start" });
      }
    }
    const filterSignature = `${activeFilter}:${query ? "present" : "empty"}:${visible}`;
    if (shouldTrack && filterSignature !== lastFilterSignature) {
      lastFilterSignature = filterSignature;
      trackEvent("trope_filter_used", {
        category: activeFilter,
        query_present: Boolean(query),
        result_count: visible
      });
    }
  };

  filterButtons.forEach(button => {
    const isActive = button.dataset.filter === activeFilter;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
  applyFilters(false);
  search.addEventListener("input", applyFilters);

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.filter;
      filterButtons.forEach((candidate) => {
        const isActive = candidate === button;
        candidate.classList.toggle("is-active", isActive);
        candidate.setAttribute("aria-pressed", String(isActive));
      });
      applyFilters();
    });
  });

  const announce = (message) => {
    shareStatus.textContent = message;
  };

  const copyUrl = async () => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(publicUrl);
      return true;
    }
    const textarea = document.createElement("textarea");
    textarea.value = publicUrl;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    try {
      textarea.select();
      return document.execCommand("copy");
    } finally {
      textarea.remove();
    }
  };

  shareButton.addEventListener("click", async () => {
    shareButton.disabled = true;
    const method = typeof navigator.share === "function" ? "native" : "copy";
    try {
      if (method === "native") {
        await navigator.share({
          title: copy.title,
          text: copy.text,
          url: publicUrl
        });
        trackEvent("decoder_share_succeeded", { method: "native" });
        announce(copy.nativeSuccess);
      } else if (await copyUrl()) {
        trackEvent("decoder_share_succeeded", { method: "copy" });
        announce(copy.copySuccess);
      } else {
        trackEvent("decoder_share_failed", { method: "copy" });
        announce(copy.manualCopy.replace("{url}", publicUrl));
      }
    } catch (error) {
      if (method === "native" && error?.name === "AbortError") {
        trackEvent("decoder_share_cancelled", { method: "native" });
        announce(copy.cancelled);
      } else {
        trackEvent("decoder_share_failed", { method });
        announce(copy.failed);
      }
    } finally {
      shareButton.disabled = false;
    }
  });
})();
