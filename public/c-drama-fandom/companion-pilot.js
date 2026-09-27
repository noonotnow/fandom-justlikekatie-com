(() => {
  const section = document.querySelector('[data-companion-path]');
  if (!section) return;
  const path = section.dataset.companionPath;
  if (!['discover', 'context', 'collect'].includes(path)) return;
  const record = event => {
    try {
      fetch('/.netlify/functions/log-engagement', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, batchKey: 'c-drama-companion-pilot', pilotPath: path }),
        keepalive: true,
      }).catch(() => {});
    } catch { /* Analytics cannot block reading. */ }
  };
  record('companion_path_view');
  // One visible ten-second visit per tab session and path; no visitor identifier
  // leaves the browser. The server excludes known crawlers and signed-in staff.
  const qualifiedKey = `companion-qualified:${path}`;
  if (!sessionStorage.getItem(qualifiedKey)) {
    let visibleMs = 0;
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      visibleMs += 1000;
      if (visibleMs < 10000) return;
      clearInterval(timer);
      sessionStorage.setItem(qualifiedKey, '1');
      record('companion_qualified_view');
    }, 1000);
  }
  section.querySelectorAll('a[data-companion-next]').forEach(link => link.addEventListener('click', () => {
    sessionStorage.setItem('companion-pilot-path', path);
    sessionStorage.setItem('companion-pilot-time', String(Date.now()));
    record('companion_collection_click');
  }));
  const form = section.querySelector('form');
  const status = section.querySelector('[role="status"]');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('button');
    button.disabled = true;
    status.textContent = 'Saving your choice…';
    try {
      const response = await fetch('/.netlify/functions/companion-interest', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'subscribe', email: form.elements.email.value,
          path, consent: form.elements.consent.checked,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Signup is unavailable.');
      status.textContent = result.message;
      form.reset();
      record('companion_interest_click');
    } catch (error) {
      status.textContent = error.message || 'Could not save your choice.';
    } finally { button.disabled = false; }
  });
  const removeForm = document.querySelector('#companion-unsubscribe-form');
  removeForm?.addEventListener('submit', async event => {
    event.preventDefault();
    const button = removeForm.querySelector('button');
    const notice = removeForm.nextElementSibling;
    button.disabled = true;
    try {
      const response = await fetch('/.netlify/functions/companion-interest', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unsubscribe', email: removeForm.elements.email.value }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Removal is unavailable.');
      notice.textContent = result.message;
      removeForm.reset();
    } catch (error) {
      notice.textContent = error.message || 'Could not remove your address.';
    } finally { button.disabled = false; }
  });
})();