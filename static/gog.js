/* Sign-in and newsletter subscription.

   No SDKs and no database: /api/magic emails a signed one-time link,
   /api/session turns it into a thirty-day session token, and the other
   functions read the reader's subscription straight from Stripe. This file
   keeps the token in localStorage and paints the panel on /newsletter/. */
(function () {
  var C = window.__GOG || {};
  if (!C.site) return;

  var STORE = 'gog.session';
  var notice = null;

  function session() {
    try {
      var s = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (s && s.exp && s.exp * 1000 < Date.now()) { localStorage.removeItem(STORE); return null; }
      return s && s.token && s.email ? s : null;
    } catch (e) { return null; }
  }
  function track(name, props) { if (window.posthog && posthog.capture) posthog.capture(name, props || {}); }
  function esc(t) { var d = document.createElement('div'); d.textContent = t == null ? '' : t; return d.innerHTML; }

  function api(path, method, body) {
    var s = session();
    var headers = { 'content-type': 'application/json' };
    if (s) headers.authorization = 'Bearer ' + s.token;
    return fetch(path, { method: method || 'GET', headers: headers, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, status: r.status, body: b }; }); });
  }

  /* The emailed link lands here with ?token=. Exchange it for a session before
     the panel first paints, and drop the token from the address bar so a
     shared or bookmarked URL never carries it. */
  function absorbToken() {
    var q = new URLSearchParams(location.search);
    var token = q.get('token');
    if (!token) return Promise.resolve(false);
    q.delete('token');
    history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q.toString() : ''));
    return api('/api/session/', 'POST', { token: token }).then(function (r) {
      if (!r.ok || !r.body.session) {
        notice = { kind: 'err', text: r.body && r.body.error || 'That link has expired. Request a new one.' };
        track('gog_magic_failed');
        return false;
      }
      localStorage.setItem(STORE, JSON.stringify({ token: r.body.session, email: r.body.email, exp: r.body.exp }));
      track('gog_signed_in', { method: 'email' });
      if (window.posthog && posthog.identify) posthog.identify(r.body.email, { email: r.body.email });
      return true;
    }).catch(function () {
      notice = { kind: 'err', text: 'Could not complete sign-in. Request a new link.' };
      return false;
    });
  }

  function requestMagicLink(email, panel, btn) {
    track('gog_signin_started', { method: 'email' });
    btn.disabled = true; btn.textContent = 'Sending…';
    api('/api/magic/', 'POST', { email: email }).then(function (r) {
      if (r.ok) {
        track('gog_magic_sent');
        panel.innerHTML = '<p class="gog-ok">Link sent</p><p class="gog-note">Check <b>' + esc(email) +
          '</b> for a sign-in link. It expires in an hour.</p>';
        return;
      }
      document.getElementById('gog-err').textContent = r.body.error || 'Could not send the link.';
      btn.disabled = false; btn.textContent = 'Email me a sign-in link';
    }).catch(function () {
      document.getElementById('gog-err').textContent = 'Could not send the link.';
      btn.disabled = false; btn.textContent = 'Email me a sign-in link';
    });
  }

  function signOut() {
    localStorage.removeItem(STORE);
    if (window.posthog && posthog.reset) posthog.reset();
    location.href = '/newsletter/';
  }

  function render() {
    var panel = document.getElementById('gog-panel');
    var navLink = document.getElementById('gog-nav');
    var s = session();

    if (navLink) navLink.textContent = s ? 'Account' : 'Sign in';
    if (!panel) return;

    if (!s) {
      panel.innerHTML =
        '<form id="gog-magic" class="gog-form" novalidate>' +
        '<input type="email" name="email" id="gog-email" placeholder="you@example.com" autocomplete="email" required aria-label="Email address">' +
        '<button class="gog-btn" type="submit" id="gog-send">Email me a sign-in link</button></form>' +
        '<div class="gog-err" id="gog-err">' + (notice && notice.kind === 'err' ? esc(notice.text) : '') + '</div>' +
        '<p class="gog-note">Free. You get an email when mechanics are added or an origin is corrected. ' +
        'Unsubscribe in one click; the dataset stays free either way.</p>';
      notice = null;
      document.getElementById('gog-magic').onsubmit = function (e) {
        e.preventDefault();
        var input = document.getElementById('gog-email');
        var email = input.value.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
          document.getElementById('gog-err').textContent = 'Enter an email address.';
          input.focus(); return;
        }
        requestMagicLink(email, panel, document.getElementById('gog-send'));
      };
      return;
    }

    if (window.posthog && posthog.identify) posthog.identify(s.email, { email: s.email });

    panel.innerHTML = '<p class="gog-note">Signed in as <b>' + esc(s.email) + '</b> · ' +
      '<a href="#" id="gog-out">Sign out</a></p><div id="gog-status" class="gog-note">Checking your subscription…</div>';
    document.getElementById('gog-out').onclick = function (e) { e.preventDefault(); signOut(); };

    api('/api/status/').then(function (r) {
      var box = document.getElementById('gog-status');
      if (!box) return;
      if (r.status === 401) { localStorage.removeItem(STORE); render(); return; }
      var status = r.ok ? r.body.status : 'free';

      if (status === 'active') {
        var until = r.body.current_period_end
          ? new Date(r.body.current_period_end).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
          : null;
        box.innerHTML = '<p class="gog-ok">Subscribed to the monthly newsletter' +
          (until ? ' · renews ' + esc(until) : '') + '</p>' +
          '<button class="gog-btn ghost" id="gog-manage">Manage billing</button>';
        document.getElementById('gog-manage').onclick = function () {
          api('/api/portal/', 'POST').then(function (r) { if (r.ok && r.body.url) location.href = r.body.url; });
        };
        return;
      }

      if (status === 'past_due') {
        box.innerHTML = '<p class="gog-warn">Your last payment did not go through.</p>' +
          '<button class="gog-btn" id="gog-manage">Update payment method</button>';
        document.getElementById('gog-manage').onclick = function () {
          api('/api/portal/', 'POST').then(function (r) { if (r.ok && r.body.url) location.href = r.body.url; });
        };
        return;
      }

      box.innerHTML = '<p class="gog-note">You are on free updates.</p>' +
        '<button class="gog-btn" id="gog-sub">Subscribe · $10/month</button>' +
        '<div class="gog-err" id="gog-err"></div>';
      document.getElementById('gog-sub').onclick = function () {
        var btn = this; btn.disabled = true; btn.textContent = 'Opening checkout…';
        track('gog_checkout_started');
        api('/api/checkout/', 'POST').then(function (r) {
          if (r.ok && r.body.url) { location.href = r.body.url; return; }
          document.getElementById('gog-err').textContent = r.body.error || 'Could not start checkout.';
          btn.disabled = false; btn.textContent = 'Subscribe · $10/month';
        }).catch(function () {});
      };
    }).catch(function () {});
  }

  function start() {
    var q = new URLSearchParams(location.search);
    if (q.get('checkout') === 'success') {
      track('gog_subscribed');
      /* Stripe redirects back a moment before the subscription is queryable;
         re-read shortly after rather than showing a stale status. */
      setTimeout(render, 2500);
    }
    absorbToken().then(render);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();

/* Copy buttons on the MCP page. Separate IIFE so it runs even when the auth
   block above bails out for want of window.__GOG. */
(function () {
  function wire() {
    document.querySelectorAll('[data-copy]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var pre = btn.closest('.snip').querySelector('pre');
        var text = pre ? pre.innerText : '';
        var done = function () {
          var was = btn.textContent;
          btn.textContent = 'Copied';
          btn.setAttribute('data-done', '1');
          setTimeout(function () { btn.textContent = was; btn.removeAttribute('data-done'); }, 1600);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, function () { fallback(text, done); });
        } else fallback(text, done);
      });
    });
  }
  /* Non-secure origins and older Safari have no clipboard API. */
  function fallback(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { /* leave it selected to copy by hand */ }
    document.body.removeChild(ta);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
