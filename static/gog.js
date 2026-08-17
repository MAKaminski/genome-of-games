/* Sign-in and newsletter subscription.

   No Supabase SDK: GoTrue and PostgREST are ordinary HTTP, and this site ships
   no runtime dependencies. Google sign-in returns tokens in the URL fragment,
   which never reaches a server. */
(function () {
  var C = window.__GOG || {};
  if (!C.supabaseUrl || !C.supabaseKey) return;

  var STORE = 'gog.session';

  function session() {
    try {
      var s = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (s && s.expires_at && s.expires_at * 1000 < Date.now()) { localStorage.removeItem(STORE); return null; }
      return s;
    } catch (e) { return null; }
  }
  function claims(token) {
    try {
      var p = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(decodeURIComponent(escape(atob(p))));
    } catch (e) { return null; }
  }
  function track(name, props) { if (window.posthog && posthog.capture) posthog.capture(name, props || {}); }

  /* Google hands the session back in the fragment; store it and tidy the URL
     so a shared link never carries someone's access token. */
  function absorbFragment() {
    if (location.hash.indexOf('access_token') === -1) return false;
    var p = new URLSearchParams(location.hash.slice(1));
    var token = p.get('access_token');
    if (!token) return false;
    localStorage.setItem(STORE, JSON.stringify({
      access_token: token,
      refresh_token: p.get('refresh_token'),
      expires_at: Number(p.get('expires_at') || 0)
    }));
    history.replaceState(null, '', location.pathname + location.search);
    track('gog_signed_in');
    return true;
  }

  function signIn() {
    track('gog_signin_started');
    location.href = C.supabaseUrl + '/auth/v1/authorize?provider=google&redirect_to=' +
      encodeURIComponent(C.site + '/newsletter/');
  }
  function signOut() {
    var s = session();
    if (s) {
      fetch(C.supabaseUrl + '/auth/v1/logout', {
        method: 'POST',
        headers: { apikey: C.supabaseKey, authorization: 'Bearer ' + s.access_token }
      }).catch(function () {});
    }
    localStorage.removeItem(STORE);
    if (window.posthog && posthog.reset) posthog.reset();
    location.href = '/newsletter/';
  }

  function subscriber(s, uid) {
    return fetch(C.supabaseUrl + '/rest/v1/gog_subscribers?select=newsletter_status,current_period_end&id=eq.' +
      encodeURIComponent(uid), { headers: { apikey: C.supabaseKey, authorization: 'Bearer ' + s.access_token } })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) { return rows[0] || null; })
      .catch(function () { return null; });
  }

  function post(path) {
    var s = session();
    if (!s) { signIn(); return Promise.reject(); }
    return fetch(path, { method: 'POST', headers: { authorization: 'Bearer ' + s.access_token } })
      .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, body: b }; }); });
  }

  function esc(t) { var d = document.createElement('div'); d.textContent = t == null ? '' : t; return d.innerHTML; }

  function render() {
    var panel = document.getElementById('gog-panel');
    var navLink = document.getElementById('gog-nav');
    var s = session();
    var who = s ? claims(s.access_token) : null;

    if (navLink) navLink.textContent = who ? 'Account' : 'Sign in';
    if (!panel) return;

    if (!who) {
      panel.innerHTML =
        '<button class="gog-btn" id="gog-in">Continue with Google</button>' +
        '<p class="gog-note">Free. You get an email when mechanics are added or an origin is corrected. ' +
        'Unsubscribe in one click; the dataset stays free either way.</p>';
      document.getElementById('gog-in').onclick = signIn;
      return;
    }

    if (who) { if (window.posthog && posthog.identify) posthog.identify(who.sub, { email: who.email }); }

    panel.innerHTML = '<p class="gog-note">Signed in as <b>' + esc(who.email) + '</b> · ' +
      '<a href="#" id="gog-out">Sign out</a></p><div id="gog-status" class="gog-note">Checking your subscription…</div>';
    document.getElementById('gog-out').onclick = function (e) { e.preventDefault(); signOut(); };

    subscriber(s, who.sub).then(function (row) {
      var box = document.getElementById('gog-status');
      if (!box) return;
      var status = row ? row.newsletter_status : 'free';

      if (status === 'active') {
        var until = row.current_period_end
          ? new Date(row.current_period_end).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
          : null;
        box.innerHTML = '<p class="gog-ok">Subscribed to the monthly newsletter' +
          (until ? ' · renews ' + esc(until) : '') + '</p>' +
          '<button class="gog-btn ghost" id="gog-manage">Manage billing</button>';
        document.getElementById('gog-manage').onclick = function () {
          post('/api/portal').then(function (r) { if (r.ok && r.body.url) location.href = r.body.url; });
        };
        return;
      }

      if (status === 'past_due') {
        box.innerHTML = '<p class="gog-warn">Your last payment did not go through.</p>' +
          '<button class="gog-btn" id="gog-manage">Update payment method</button>';
        document.getElementById('gog-manage').onclick = function () {
          post('/api/portal').then(function (r) { if (r.ok && r.body.url) location.href = r.body.url; });
        };
        return;
      }

      box.innerHTML = '<p class="gog-note">You are on free updates.</p>' +
        '<button class="gog-btn" id="gog-sub">Subscribe · $10/month</button>' +
        '<div class="gog-err" id="gog-err"></div>';
      document.getElementById('gog-sub').onclick = function () {
        var btn = this; btn.disabled = true; btn.textContent = 'Opening checkout…';
        track('gog_checkout_started');
        post('/api/checkout').then(function (r) {
          if (r.ok && r.body.url) { location.href = r.body.url; return; }
          document.getElementById('gog-err').textContent = r.body.error || 'Could not start checkout.';
          btn.disabled = false; btn.textContent = 'Subscribe · $10/month';
        }).catch(function () {});
      };
    });
  }

  function start() {
    absorbFragment();
    var q = new URLSearchParams(location.search);
    if (q.get('checkout') === 'success') {
      track('gog_subscribed');
      /* Stripe redirects back before the webhook has necessarily landed, so
         re-read the row shortly after rather than showing a stale status. */
      setTimeout(render, 2500);
    }
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
