// Runs before first paint: flags JS support and skips the opening mark on repeat visits.
(function (d) {
  var h = d.documentElement;
  h.classList.remove('no-js'); h.classList.add('js');
  try {
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || sessionStorage.getItem('cc-intro')) h.classList.add('intro-seen');
    else sessionStorage.setItem('cc-intro', '1');
  } catch (e) { h.classList.add('intro-seen'); }
})(document);
