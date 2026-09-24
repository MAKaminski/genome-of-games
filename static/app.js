/* Header search + small progressive enhancements. No dependencies. */
(function () {
  var q = document.getElementById('sq'), res = document.getElementById('sres');
  if (!q) return;
  var IDX = null, loading = false;

  // Fetch once. Any in-flight request re-renders against whatever is in the box
  // when it lands, so focusing before typing can never swallow the first query.
  function load() {
    if (IDX || loading) return;
    loading = true;
    fetch('/search-index.json').then(function (r) { return r.json(); })
      .then(function (j) {
        IDX = j; loading = false;
        var v = q.value.trim();
        if (v.length > 1 && document.activeElement === q) render(v);
      })
      .catch(function () { loading = false; });
  }
  var TY = { F: 'Mechanic', T: 'Game', C: 'Studio' };

  function render(v) {
    if (!IDX) return;
    var lv = v.toLowerCase();
    var hits = [];
    for (var i = 0; i < IDX.length && hits.length < 400; i++) {
      var p = IDX[i].n.toLowerCase().indexOf(lv);
      if (p > -1) hits.push([p, IDX[i]]);
    }
    hits.sort(function (a, b) {
      if (a[0] !== b[0]) return a[0] - b[0];
      if (a[1].t !== b[1].t) return a[1].t === 'F' ? -1 : b[1].t === 'F' ? 1 : 0;
      return (a[1].y || 9999) - (b[1].y || 9999);
    });
    hits = hits.slice(0, 30);
    res.innerHTML = hits.length ? hits.map(function (h) {
      var n = h[1];
      return '<a href="' + n.u + '"><span class="ty">' + TY[n.t] + '</span><span>' +
        n.n.replace(/[&<>]/g, '') + '</span><span class="yr">' + (n.y || '') + '</span></a>';
    }).join('') : '<a style="color:var(--dim2)">No match for “' + v.replace(/[&<>]/g, '') + '”</a>';
    res.style.display = 'block';
  }

  q.addEventListener('input', function () {
    var v = q.value.trim();
    if (v.length < 2) { res.style.display = 'none'; return; }
    load();
    if (IDX) render(v);
  });
  q.addEventListener('focus', load);
  q.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { res.style.display = 'none'; q.blur(); }
    if (e.key === 'Enter') { var a = res.querySelector('a[href]'); if (a) location.href = a.getAttribute('href'); }
  });
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.srch')) res.style.display = 'none';
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && document.activeElement !== q) { e.preventDefault(); q.focus(); }
  });
})();

/* Product analytics. Names the handful of things a reader can do here that
   matter — leave for a source we link to, search, copy an MCP snippet, read to
   the end, respond to the follow panel — so PostHog can show which pages and
   sources lead to a sign-in. The stub in <head> queues every capture until the
   library lands, so nothing here waits on it. Separate IIFE: it must run even
   when the search box is missing. */
(function () {
  function capture(name, props) { if (window.posthog && posthog.capture) posthog.capture(name, props || {}); }
  var seg = location.pathname.split('/')[1] || 'home';
  var PAGE = { feature: 'mechanic', features: 'mechanics-index', game: 'game', games: 'games-index',
    studio: 'studio', studios: 'studios-index', era: 'era', eras: 'eras-index', graph: 'graph',
    mcp: 'mcp', newsletter: 'newsletter', methodology: 'methodology', home: 'home' }[seg] || seg;
  var base = { page_type: PAGE, path: location.pathname };
  var GITHUB = (window.__GOG && window.__GOG.github) || 'https://github.com/MAKaminski/genome-of-games';

  /* Every outbound link carries data-out; the follow panel carries data-cta;
     the MCP page's copy buttons carry data-copy. One delegated listener. */
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a,button');
    if (!a) return;
    if (a.hasAttribute('data-out')) {
      capture('outbound_click', Object.assign({}, base, {
        target: a.getAttribute('data-out'), entity: a.getAttribute('data-entity'),
        verified: !a.hasAttribute('data-search'), href: a.href
      }));
    } else if (a.hasAttribute('data-cta')) {
      capture('cta_click', Object.assign({}, base, { placement: a.getAttribute('data-cta') }));
    } else if (a.hasAttribute('data-copy')) {
      var pre = a.closest('.snip') && a.closest('.snip').querySelector('pre');
      capture('mcp_snippet_copied', Object.assign({}, base, { snippet: pre ? pre.innerText.trim().split('\n')[0].slice(0, 60) : '' }));
    } else if (a.href && a.href.indexOf(GITHUB) === 0) {
      capture('repo_click', Object.assign({}, base, { href: a.href }));
    } else if (a.closest('#sres')) {
      capture('search_result_click', Object.assign({}, base, { href: a.getAttribute('href') }));
    }
  }, true);

  /* Search: one event per settled query, not one per keystroke. */
  var q = document.getElementById('sq'), res = document.getElementById('sres'), timer = null, last = '';
  if (q && res) q.addEventListener('input', function () {
    clearTimeout(timer);
    timer = setTimeout(function () {
      var v = q.value.trim();
      if (v.length < 2 || v === last) return;
      last = v;
      capture('search_used', Object.assign({}, base, { query_length: v.length, results: res.querySelectorAll('a[href]').length }));
    }, 900);
  });

  /* Engaged read: 60% of the page or 45 seconds, whichever comes first, once. */
  var engaged = false;
  function engage(how) {
    if (engaged) return; engaged = true;
    capture('engaged_read', Object.assign({}, base, { via: how }));
  }
  var dwell = setTimeout(function () { engage('time'); }, 45000);
  window.addEventListener('scroll', function () {
    var h = document.documentElement;
    if ((h.scrollTop + h.clientHeight) / h.scrollHeight >= 0.6) { clearTimeout(dwell); engage('scroll'); }
  }, { passive: true });

  /* Follow panel impressions, so click-through can be a rate, not a count. */
  var boxes = document.querySelectorAll('[data-cta-box]');
  if (boxes.length && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        capture('cta_viewed', Object.assign({}, base, { placement: en.target.getAttribute('data-cta-box') }));
        io.unobserve(en.target);
      });
    }, { threshold: 0.5 });
    boxes.forEach(function (b) { io.observe(b); });
  }
})();
