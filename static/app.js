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
