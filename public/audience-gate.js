/*
 * Audience measurement gate.
 *
 * Google tracking (GA4 + GTM) is loaded only on the canonical production host
 * AND only after the server-verified session classification resolves to
 * "public". The server decides operator status (FANDOM_ADMIN_EMAILS) and
 * returns it from /api/auth/session; nothing client-supplied can change it.
 *
 * States: pending | public | operator | unknown
 *   pending  - classification in flight; events are buffered, nothing is sent.
 *   public   - anonymous or ordinary signed-in visitor; tracking is allowed.
 *   operator - verified owner/operator; tracking is suppressed.
 *   unknown  - session lookup failed or the page carries a sign-in link;
 *              treated like an operator (suppressed) so a possibly
 *              authenticated operator is never counted. A later successful
 *              classification (session-changed, refresh, logout) can still
 *              move the page to "public" or "operator".
 *
 * This state is measurement suppression only. It is never used for
 * authorization and is never persisted (no browser-storage marker): every
 * page load re-derives it from the server session.
 */
(function (w, d) {
  if (w.__audienceGate) return;

  var GA_ID = 'G-FHZJ1T74TG';
  var GTM_ID = 'GTM-5T5P2C9S';
  var SESSION_URL = '/api/auth/session';
  var TIMEOUT_MS = 8000;
  var MAX_BUFFER = 100;

  var production = w.location.hostname === 'fandom.justlikekatie.com';
  w.__analyticsProductionHost = production;

  var state = production ? 'pending' : 'public';
  var buffer = [];
  var started = false;
  var generation = 0;

  function disableGoogle(disabled) {
    w['ga-disable-' + GA_ID] = disabled;
  }

  function sanitizedLocation() {
    var l = w.location;
    return l.origin + l.pathname + l.search;
  }

  function loadScript(src) {
    var script = d.createElement('script');
    script.async = true;
    script.src = src;
    d.head.appendChild(script);
  }

  function startGoogle() {
    if (started || !production) return;
    started = true;
    w.dataLayer = w.dataLayer || [];
    loadScript('https://www.googletagmanager.com/gtag/js?id=' + GA_ID);
    w.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
    loadScript('https://www.googletagmanager.com/gtm.js?id=' + GTM_ID);
    push(['js', new Date()]);
    push(['config', GA_ID, { page_location: w.__initialAnalyticsLocation || sanitizedLocation() }]);
  }

  function push(args) {
    // gtag.js requires the Arguments object, not an array.
    (function () { w.dataLayer.push(arguments); }).apply(null, args);
  }

  function setState(next) {
    if (!production) return;
    var previous = state;
    state = next;
    if (next === 'public') {
      disableGoogle(false);
      startGoogle();
      var pending = buffer;
      buffer = [];
      for (var i = 0; i < pending.length; i += 1) pending[i]();
    } else if (next !== 'pending') {
      disableGoogle(true);
      buffer = [];
    }
    if (previous !== next && typeof w.dispatchEvent === 'function' && typeof w.CustomEvent === 'function') {
      try { w.dispatchEvent(new w.CustomEvent('audience-gate-change', { detail: { state: next } })); } catch (e) { /* optional */ }
    }
  }

  // Runs fn once tracking is allowed. Buffered while pending, dropped when
  // suppressed. Callers never see the classification.
  function run(fn) {
    if (state === 'public') { fn(); return; }
    if (state === 'pending' && buffer.length < MAX_BUFFER) buffer.push(fn);
  }

  function gtag() {
    var args = arguments;
    run(function () {
      if (!production) return;
      w.dataLayer = w.dataLayer || [];
      w.dataLayer.push(args);
    });
  }
  w.gtag = gtag;

  // `user` is the parsed /api/auth/session "user" value: null/undefined for
  // an anonymous visitor, otherwise an object whose isAdmin is server-derived.
  function classify(user) {
    if (user && typeof user === 'object' && user.isAdmin === true) setState('operator');
    else if (user === null || user === undefined || typeof user === 'object') setState('public');
    else setState('unknown');
  }

  function markUnknown() {
    setState('unknown');
  }

  function refresh(background) {
    if (!production || typeof w.fetch !== 'function') return;
    var current = ++generation;
    var controller = typeof w.AbortController === 'function' ? new w.AbortController() : null;
    var timer = controller ? w.setTimeout(function () { controller.abort(); }, TIMEOUT_MS) : null;
    w.fetch(SESSION_URL, { credentials: 'same-origin', cache: 'no-store', signal: controller ? controller.signal : undefined })
      .then(function (response) {
        var type = response.headers && response.headers.get('content-type');
        if (!response.ok || !type || type.toLowerCase().indexOf('application/json') === -1) throw new Error('session');
        return response.json();
      })
      .then(function (body) {
        if (current !== generation) return;
        if (!body || typeof body !== 'object' || !('user' in body)) throw new Error('session');
        classify(body.user);
      })
      .catch(function () {
        // A transient failure of a background re-check keeps the last verified
        // classification; an initial or explicit check fails closed.
        if (current === generation && !(background === true && (state === 'public' || state === 'operator'))) markUnknown();
      })
      .then(function () { if (timer) w.clearTimeout(timer); });
  }

  w.__audienceGate = {
    state: function () { return state; },
    run: run,
    classify: function (user) { generation += 1; classify(user); },
    unknown: function () { generation += 1; markUnknown(); },
    refresh: function () { refresh(false); },
  };

  if (!production) return;
  disableGoogle(true);
  var path = w.location.pathname.replace(/\/+$/, '').toLowerCase();
  if (path === '/auth/verify' || path === '/zh-cn/auth/verify') {
    // The URL fragment carries a sign-in token and the session cookie does not
    // exist yet. Stay suppressed until the app reports the resulting session.
    state = 'unknown';
  } else {
    refresh(false);
  }
  // Another tab may have signed in/out or switched account while this page was hidden.
  d.addEventListener('visibilitychange', function () {
    if (d.visibilityState === 'visible' && state !== 'pending' && !(state === 'unknown' && path.slice(-12) === '/auth/verify')) refresh(true);
  });
})(window, document);
