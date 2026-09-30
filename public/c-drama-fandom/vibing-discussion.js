(() => {
  const section = document.querySelector("[data-discussion-id]");
  if (!section) return;
  const id = section.dataset.discussionId;
  const state = document.getElementById("discussion-state");
  const list = document.getElementById("discussion-responses");
  const form = document.getElementById("discussion-form");
  const status = document.getElementById("discussion-form-status");
  const endpoint = "/api/vibing-discussion";
  const boundary = Number(section.dataset.safeThroughEpisode);
  if (!Number.isInteger(boundary) || boundary < 1) return;
  async function api(url, options) {
    const response = await fetch(url, { credentials: "same-origin", ...options });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Please try again later.");
    return data;
  }
  async function load() {
    try {
      const data = await api(`${endpoint}?discussionId=${encodeURIComponent(id)}`);
      if (data.discussion?.id !== id || data.discussion.safeThroughEpisode !== boundary || !Array.isArray(data.responses)) {
        throw new Error("The discussion boundary is unavailable.");
      }
      list.replaceChildren();
      for (const item of data.responses) {
        if (typeof item.id !== "string" || typeof item.text !== "string") continue;
        const li = document.createElement("li");
        const text = document.createElement("p");
        text.textContent = item.text;
        const report = document.createElement("button");
        report.type = "button";
        report.textContent = "Report this response";
        report.addEventListener("click", async () => {
          report.disabled = true;
          try {
            const result = await api(endpoint, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "report", discussionId: id, safeThroughEpisode: boundary, entryId: item.id }),
            });
            status.textContent = result.message;
          } catch (error) {
            report.disabled = false;
            status.textContent = error.message;
          }
        });
        li.append(text, report);
        list.append(li);
      }
      state.textContent = list.childElementCount ? `${list.childElementCount} approved reader responses.` :
        "Be the first to share a take. There are no approved reader responses yet.";
    } catch {
      list.replaceChildren();
      state.textContent = "Reader responses are temporarily unavailable. Please try again later.";
    }
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    status.textContent = "Sending…";
    try {
      const fields = new FormData(form);
      const result = await api(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit", discussionId: id, safeThroughEpisode: boundary,
          text: fields.get("text"), acceptBoundary: fields.get("acceptBoundary") === "on",
          website: fields.get("website"),
        }),
      });
      form.reset();
      status.textContent = result.message;
    } catch (error) {
      status.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
  void load();
})();