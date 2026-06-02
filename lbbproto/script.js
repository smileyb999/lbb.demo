/* ============================================================
   LITTLE BIT BAKERY — behavior
   ONE rAF loop drives Lenis AND every scroll-linked animation
   (read the eased scroll position straight off Lenis, never the
   scroll event). Per frame: all READS first, then all WRITES, so
   we never thrash layout. Section offsets are cached (recomputed
   on resize), not measured every frame. Discrete reveals use
   IntersectionObserver so they fire reliably regardless of scroll
   speed/mechanism. Concept by benji.
   ============================================================ */
(function () {
  'use strict';

  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var DESKTOP = function () { return window.matchMedia('(min-width:861px)').matches; };

  /* ---------- refresh always returns to the TOP (so the boot animation reveals
       the hero with the user at the top, never dropped mid-page). Disable the
       browser's scroll restoration and force 0 before Lenis reads the position. ---------- */
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);
  window.addEventListener('load', function () { window.scrollTo(0, 0); if (lenis) lenis.scrollTo(0, { immediate: true }); });
  window.addEventListener('pageshow', function (e) { if (e.persisted) { window.scrollTo(0, 0); if (lenis) lenis.scrollTo(0, { immediate: true }); } });

  /* ---------- Lenis ---------- */
  var lenis = null;
  if (!REDUCED && typeof Lenis !== 'undefined') {
    lenis = new Lenis({ lerp: 0.14, wheelMultiplier: 1, smoothWheel: true, smoothTouch: false });
    window.lenis = lenis;
  }

  /* ---------- BOOT / LOAD ANIMATION (follows Choreography1/2) ---------- */
  (function () {
    var boot = document.getElementById('boot');
    if (!boot) return;
    if (REDUCED) { if (boot.parentNode) boot.parentNode.removeChild(boot); postBootChromeNudge(); return; } // skip — hero shown directly
    document.documentElement.style.overflow = 'hidden';
    if (lenis) lenis.stop();
    requestAnimationFrame(function () { requestAnimationFrame(function () { boot.classList.add('go'); }); }); // converge
    function postBootChromeNudge(){
      if (window.scrollY > 0) return;
      requestAnimationFrame(function(){
        requestAnimationFrame(function(){
          window.scrollBy(0, 1);
          requestAnimationFrame(function(){
            window.scrollBy(0, -1);
            if (lenis) lenis.scrollTo(0, { immediate: true });
          });
        });
      });
    }
    var SETTLE = 1150, HOLD = 600, OPEN = 900;
    setTimeout(function () { boot.classList.add('open'); }, SETTLE + HOLD);          // panels open
    setTimeout(function () {
      if (boot.parentNode) boot.parentNode.removeChild(boot);
      document.documentElement.style.overflow = '';
      if (lenis) lenis.start();
      postBootChromeNudge();
    }, SETTLE + HOLD + OPEN);
  })();

  /* ---------- scroll-linked registry: read(y) -> data, then write(data,y) ---------- */
  var readers = [], writers = [];
  function onScroll(read, write) { readers.push(read); writers.push(write); }

  var lastY = null;
  function frame(time) {
    if (lenis) lenis.raf(time);
    var y = lenis ? lenis.animatedScroll : (window.scrollY || window.pageYOffset || 0);
    if (y !== lastY) {
      lastY = y;
      var data = new Array(readers.length);
      // isolate each handler so one bad frame can't freeze the whole scroll loop
      for (var i = 0; i < readers.length; i++) { try { data[i] = readers[i](y); } catch (e) { data[i] = null; } }
      for (var j = 0; j < writers.length; j++) { try { writers[j](data[j], y); } catch (e) { } }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  // native fallback if Lenis is absent (reduced motion): still pump the loop on scroll
  if (!lenis) window.addEventListener('scroll', function () { lastY = null; }, { passive: true });

  /* ---------- cached layout metrics (recompute on resize / font load) ---------- */
  var M = {};
  function absTop(el) { var r = el.getBoundingClientRect(); return r.top + (window.scrollY || window.pageYOffset || 0); }
  function measure() {
    M.vh = window.innerHeight;
    var hsec = document.getElementById('hsec'); if (hsec) { M.hsecTop = absTop(hsec); M.hsecH = hsec.offsetHeight; }
    var appr = document.getElementById('appreciation'); if (appr) { M.apprTop = absTop(appr); M.apprH = appr.offsetHeight; }
    var about = document.getElementById('about'); if (about) { M.aboutTop = absTop(about); M.aboutH = about.offsetHeight; }
    var cakes = document.getElementById('cakes'); if (cakes) { M.cakesTop = absTop(cakes); M.cakesH = cakes.offsetHeight; }
    var footer = document.querySelector('.footer'); if (footer) { M.footerTop = absTop(footer); }
    if (lenis) lenis.resize(); // keep Lenis's scroll limit in sync with layout changes
    lastY = null; // force handlers to re-run with fresh metrics
  }
  var measureScheduled = false;
  function scheduleMeasure() { if (measureScheduled) return; measureScheduled = true; requestAnimationFrame(function () { measureScheduled = false; measure(); }); }
  window.addEventListener('resize', scheduleMeasure, { passive: true });

  /* ---------- nav-tab transitions + anchor links ----------
       Hero nav tabs: Menu & About play the curtain transition (panels close,
       jump to the section behind them, panels open). Contact is INERT this round.
       Every other in-page anchor (footer links, etc.) scrolls via Lenis. */
  var navTabs = [].slice.call(document.querySelectorAll('.hero .nav .tabs a'));

  var curtain = (function () {
    var el = document.getElementById('navcurtain');
    var busy = false;
    function go(id) {
      var target = document.getElementById(id);
      if (!target) return;
      if (REDUCED || !el) { if (lenis) lenis.scrollTo(target, { offset: 0 }); else target.scrollIntoView(); return; }
      if (busy) return; busy = true;
      el.classList.add('run');
      requestAnimationFrame(function () { el.classList.add('closed'); });        // panels meet
      setTimeout(function () {                                                   // fully closed: jump behind them
        if (lenis) lenis.scrollTo(target, { immediate: true, offset: 0 }); else target.scrollIntoView();
        requestAnimationFrame(function () { el.classList.remove('closed'); });   // open at the section top
        setTimeout(function () { el.classList.remove('run'); busy = false; }, 560);
      }, 540);
    }
    return { go: go };
  })();

  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var href = a.getAttribute('href');
      if (!href || href === '#') { e.preventDefault(); return; }
      var id = href.slice(1);
      if (navTabs.indexOf(a) !== -1) {                 // hero nav tabs handled specially
        e.preventDefault();
        if (id === 'visit') return;                    // Contact: inert (no scroll, no nav) this round
        if (id === 'menu' || id === 'about') curtain.go(id);
        return;
      }
      var el = id === 'top' ? document.body : document.getElementById(id);
      if (!el) return;
      if (lenis) { e.preventDefault(); lenis.scrollTo(id === 'top' ? 0 : el, { offset: 0 }); }
    });
  });

  /* ============================================================
     1 · HERO — countdown to next Saturday 8:00 AM
     ============================================================ */
  (function () {
    function next8() {
      var now = new Date(), d = new Date(now);
      d.setHours(8, 0, 0, 0);
      var day = d.getDay(), add = (6 - day + 7) % 7;
      if (add === 0 && now > d) add = 7;
      d.setDate(d.getDate() + add);
      return d;
    }
    function tick() {
      var el = document.getElementById('cd'); if (!el) return;
      var diff = next8() - new Date();
      if (diff <= 0) { el.textContent = 'On the porch now'; return; }
      var dd = Math.floor(diff / 86400000), hh = Math.floor(diff / 3600000) % 24, mm = Math.floor(diff / 60000) % 60;
      el.textContent = dd + 'D : ' + hh + 'H : ' + mm + 'M';
    }
    tick(); setInterval(tick, 60000);
  })();

  /* ============================================================
     2 · HOW SATURDAY WORKS — pinned horizontal scroll
     ============================================================ */
  (function () {
    var hsec = document.getElementById('hsec');
    var track = document.getElementById('track');
    var fill = document.getElementById('fill');
    var plabel = document.getElementById('plabel');
    if (!hsec || !track) return;
    var PANELS = 5, travel = (PANELS * 120) - 100, lastStep = 0;
    onScroll(
      function (y) {
        if (M.hsecH == null) return null;
        return Math.min(Math.max((y - M.hsecTop) / (M.hsecH - M.vh), 0), 1);
      },
      function (p) {
        if (p == null) return;
        track.style.transform = 'translate3d(-' + (p * travel) + 'vw,0,0)';
        fill.style.width = (p * 100) + '%';
        var step = Math.min(PANELS, Math.floor(p * PANELS) + 1);
        if (step !== lastStep) { plabel.textContent = 'Step ' + step + ' of ' + PANELS; lastStep = step; }
      }
    );
  })();

  /* ============================================================
     1.5 · APPRECIATION — pin + light up words one at a time on scroll
     ============================================================ */
  (function () {
    var appr = document.getElementById('appreciation');
    if (!appr) return;
    var lines = [].slice.call(appr.querySelectorAll('.appr-line'));
    var words = [];
    lines.forEach(function (line) {
      var parts = line.textContent.trim().split(/\s+/);
      line.textContent = '';
      parts.forEach(function (p, i) {
        var s = document.createElement('span');
        s.className = 'w'; s.textContent = p;
        line.appendChild(s);
        if (i < parts.length - 1) line.appendChild(document.createTextNode(' '));
        words.push(s);
      });
    });
    if (REDUCED) { words.forEach(function (w) { w.classList.add('lit'); }); return; }
    var litCount = -1;
    onScroll(
      function (y) {
        if (M.apprTop == null) return null;
        var dist = M.apprH - M.vh;
        return dist <= 0 ? 1 : Math.max(0, Math.min(1, (y - M.apprTop) / dist));
      },
      function (prog) {
        if (prog == null) return;
        var target = Math.round(Math.min(1, prog / 0.85) * words.length); // all lit by 85% of the pin
        if (target === litCount) return;
        litCount = target;
        for (var i = 0; i < words.length; i++) words[i].classList.toggle('lit', i < target);
      }
    );
  })();

  /* ============================================================
     3 · MENU — blank, then header, then groups one by one, seal last.
        IntersectionObserver = reveals fire when each element is
        actually in view (visible), independent of scroll speed.
     ============================================================ */
  (function () {
    var menu = document.getElementById('menu');
    if (!menu) return;
    var head = menu.querySelector('.m-head');
    var seal = menu.querySelector('.seal-wrap');
    var groups = [].slice.call(menu.querySelectorAll('.group'))
      .sort(function (a, b) { return (+a.dataset.reveal || 0) - (+b.dataset.reveal || 0); });

    if (REDUCED) { // everything visible, no motion (CSS also covers this)
      if (head) head.classList.add('in');
      groups.forEach(function (g) { g.classList.add('in'); });
      if (seal) seal.classList.add('in');
      return;
    }

    if (head) {
      var hIO = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { head.classList.add('in'); hIO.disconnect(); } });
      }, { threshold: 0.4 });
      hIO.observe(head);
    }

    var lastGroup = groups[groups.length - 1];
    var gIO = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          gIO.unobserve(e.target);
          if (e.target === lastGroup && seal) setTimeout(function () { seal.classList.add('in'); }, 320); // seal last
        }
      });
    }, { threshold: 0.25, rootMargin: '0px 0px -18% 0px' });
    groups.forEach(function (g) { gIO.observe(g); });
  })();

  /* ---------- Sticky "hold" tops for the two cover-reveals (Menu, then About).
       Each pins so the next section can rise up and fully cover it. ---------- */
  (function () {
    var pinned = [document.getElementById('menu'), document.getElementById('about')].filter(Boolean);
    function setTops() {
      pinned.forEach(function (el) {
        el.style.top = REDUCED ? '' : (window.innerHeight - el.offsetHeight) + 'px';
      });
    }
    setTops();
    window.addEventListener('resize', setTops, { passive: true });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { setTops(); scheduleMeasure(); });
  })();

  /* ============================================================
     4 · ABOUT — settle in, photo parallax (rAF loop), crew one-by-one
     ============================================================ */
  (function () {
    var about = document.getElementById('about');
    if (!about) return;

    var aboutIO = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { about.classList.add('in'); aboutIO.disconnect(); } });
    }, { threshold: 0.12 });
    aboutIO.observe(about);
    // (A3) the About photo scrolls normally with the page — no parallax transform.

    var crew = document.getElementById('crew');
    if (crew) {
      var members = [].slice.call(document.querySelectorAll('.about .member'));
      var cio = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); cio.unobserve(e.target); } });
      }, { threshold: .35, rootMargin: '0px 0px -8% 0px' });
      members.forEach(function (m) { cio.observe(m); });
    }
  })();

  /* ============================================================
     5 · GALLERY — ticker, polaroid reveal, cursor parallax
     ============================================================ */
  (function () {
    var trackEl = document.getElementById('tickerTrack');
    var field = document.getElementById('field');
    var gal = document.getElementById('gal');
    if (!gal) return;

    if (trackEl) {
      var phrases = ['Fresh every Saturday', 'See you on the porch', 'Baked a little bit at a time'];
      var sun = '<span class="sun"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.1 5.1l1.7 1.7M17.2 17.2l1.7 1.7M18.9 5.1l-1.7 1.7M6.8 17.2l-1.7 1.7" stroke-linecap="round"/></svg></span>';
      var unit = '';
      phrases.forEach(function (p) { unit += '<span>' + p + '</span>' + sun; });
      // Tile so that ONE half of the track (the -50% animation travel) is wider
      // than the viewport, with an even number of sets so -50% lands on a clean
      // set boundary. That guarantees a seamless loop with no blank gap on wide
      // screens (the old fixed 2x duplication left empty space once vw > one set).
      function buildTicker() {
        trackEl.innerHTML = unit;
        var setW = trackEl.getBoundingClientRect().width;
        var vw = (document.querySelector('.ticker') || document.documentElement).getBoundingClientRect().width || window.innerWidth;
        if (!setW) { trackEl.innerHTML = unit + unit; return; }
        var halfSets = Math.max(1, Math.ceil(vw / setW) + 1);
        var html = ''; for (var r = 0; r < halfSets * 2; r++) html += unit;
        trackEl.innerHTML = html;
        // keep a steady ~40px/sec regardless of how wide it tiled
        trackEl.style.animationDuration = Math.max(18, Math.round((setW * halfSets) / 40)) + 's';
      }
      buildTicker();
      var tkTimer;
      window.addEventListener('resize', function () { clearTimeout(tkTimer); tkTimer = setTimeout(buildTicker, 200); }, { passive: true });
    }

    var pols = [].slice.call(document.querySelectorAll('.gal .pol'));
    var isMobile = function () { return window.matchMedia('(max-width:860px)').matches; };

    if (REDUCED) {
      pols.forEach(function (p) { p.style.opacity = 1; if (!isMobile()) p.style.transform = 'rotate(' + p.dataset.rot + 'deg)'; p.dataset.ready = '1'; });
      return;
    }

    pols.forEach(function (p) {
      if (!isMobile()) { p.style.transition = 'opacity .7s ease-out, transform .7s cubic-bezier(.2,.8,.25,1)'; p.style.transform = 'translateY(34px) rotate(' + p.dataset.rot + 'deg)'; }
    });

    // Each polaroid animates in as IT scrolls into view (scroll-progression,
    // like the crew cards) — not all at once when the container first appears.
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        var p = e.target;
        p.style.opacity = 1; if (!isMobile()) p.style.transform = 'rotate(' + p.dataset.rot + 'deg)';
        setTimeout(function () { p.style.transition = 'opacity .7s ease-out, box-shadow .35s ease'; p.dataset.ready = '1'; }, 720);
        io.unobserve(p);
      });
    }, { threshold: .35, rootMargin: '0px 0px -8% 0px' });
    pols.forEach(function (p) { io.observe(p); });

    var geo = [];
    function gmeasure() { var fr = field.getBoundingClientRect(), cx = fr.left + fr.width / 2; geo = pols.map(function (p) { var r = p.getBoundingClientRect(); return { hSign: ((r.left + r.width / 2) - cx) < 0 ? -1 : 1, h: 14, v: 12 }; }); }
    gmeasure(); window.addEventListener('resize', gmeasure, { passive: true });

    var tx = 0, ty = 0, cxv = 0, cyv = 0, mraf = null, inView = false, hoverDirty = false;
    function onMove(e) {
      if (isMobile() || !inView) return;
      var r = gal.getBoundingClientRect();
      tx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width / 2)));
      ty = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (r.height / 2)));
      if (!mraf) mraf = requestAnimationFrame(mtick);
    }
    function mtick() {
      cxv += (tx - cxv) * 0.08; cyv += (ty - cyv) * 0.08;
      pols.forEach(function (p, i) {
        if (p.dataset.ready !== '1') return;
        var g = geo[i] || { hSign: 1, h: 14, v: 12 }, sc = p.dataset.hover === '1' ? ' scale(1.045)' : '';
        p.style.transform = 'translate(' + ((-cxv) * g.h * g.hSign) + 'px,' + (cyv * g.v) + 'px) rotate(' + p.dataset.rot + 'deg)' + sc;
      });
      if (Math.abs(tx - cxv) > 0.001 || Math.abs(ty - cyv) > 0.001 || hoverDirty) { hoverDirty = false; mraf = requestAnimationFrame(mtick); } else { mraf = null; }
    }
    window.addEventListener('mousemove', onMove, { passive: true });
    var viewIO = new IntersectionObserver(function (es) { es.forEach(function (e) { inView = e.isIntersecting; if (!inView) { tx = 0; ty = 0; if (!mraf) mraf = requestAnimationFrame(mtick); } }); }, { threshold: 0 });
    viewIO.observe(gal);
    pols.forEach(function (p) {
      p.addEventListener('mouseenter', function () { if (isMobile()) return; p.dataset.hover = '1'; hoverDirty = true; if (!mraf) mraf = requestAnimationFrame(mtick); });
      p.addEventListener('mouseleave', function () { p.dataset.hover = ''; hoverDirty = true; if (!mraf) mraf = requestAnimationFrame(mtick); });
    });
  })();

  /* ============================================================
     6 · A LITTLE LOVE LATELY — count-ups + softened review carousel
     ============================================================ */
  (function () {
    var nums = [].slice.call(document.querySelectorAll('.love .num'));
    function countUp(el) {
      var to = +el.dataset.to, val = el.querySelector('.val'); if (!val) return;
      var t0 = null;
      function step(ts) { if (!t0) t0 = ts; var p = Math.min((ts - t0) / 1400, 1), e = 1 - Math.pow(1 - p, 3); val.textContent = Math.round(to * e); if (p < 1) requestAnimationFrame(step); }
      requestAnimationFrame(step);
    }
    if (REDUCED) { nums.forEach(function (n) { var v = n.querySelector('.val'); if (v) v.textContent = n.dataset.to; }); }
    else if (nums.length) {
      // Fire BOTH counters together the moment the stats scroll into view. Observe
      // the .feature container (the .stats wrapper is zero-height — its tabs are
      // absolutely positioned — so observing it directly was unreliable). A single
      // fired-once guard means it never re-triggers and never fires early on load.
      nums.forEach(function (n) { var v = n.querySelector('.val'); if (v) v.textContent = '0'; }); // guaranteed 0 start
      var statsAnchor = document.querySelector('.love .feature') || nums[0];
      var fired = false;
      function runCounts() { if (fired) return; fired = true; nums.forEach(countUp); if (sIO) sIO.disconnect(); }
      var sIO = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting && e.intersectionRatio > 0) runCounts(); });
      }, { threshold: [0.25, 0.5] });
      sIO.observe(statsAnchor);
    }

    // reviews: hold, fade OUT to empty, beat, fade IN next (softer, slower)
    var reviewsEl = document.getElementById('reviews');
    var dotsEl = document.getElementById('reviewDots');
    if (reviewsEl) {
      var revs = [].slice.call(reviewsEl.querySelectorAll('.review'));
      var dots = [];
      if (dotsEl && revs.length) revs.forEach(function (_, i) {
        var d = document.createElement('button');
        d.className = 'rev-dot'; d.type = 'button'; d.setAttribute('aria-label', 'Show review ' + (i + 1));
        d.addEventListener('click', function () { jump(i); });
        dotsEl.appendChild(d); dots.push(d);
      });

      var idx = 0, t1 = null, t2 = null;
      var HOLD = 5500; // review holds fully visible
      function setDots() { dots.forEach(function (d, i) { d.classList.toggle('active', i === idx); }); }
      function show(i) { revs.forEach(function (r, k) { r.classList.toggle('active', k === i); }); setDots(); }
      function cycle() {
        if (REDUCED || revs.length < 2) return;
        clearTimeout(t1); clearTimeout(t2);
        t1 = setTimeout(function () {              // fade current OUT (.8s)
          revs[idx].classList.remove('active');
          t2 = setTimeout(function () {            // ...hold blank ~0.5s, then fade next IN
            idx = (idx + 1) % revs.length; show(idx);
            cycle();
          }, 1300);                                // .8s fade-out + ~.5s blank
        }, HOLD);
      }
      function jump(i) { idx = i; show(idx); cycle(); }
      if (revs.length) { show(0); cycle(); }
    }
  })();

  /* ============================================================
     6.5 · PRESS LOGOS — reveal one-by-one on scroll into view.
        Kelly Clarkson is last in the DOM, so it animates in last.
     ============================================================ */
  (function () {
    var row = document.getElementById('plRow');
    if (!row) return;
    var logos = [].slice.call(row.querySelectorAll('.pl-item'));
    if (!logos.length) return;
    if (REDUCED) { logos.forEach(function (l) { l.classList.add('in'); }); return; }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) {
          logos.forEach(function (l, i) { setTimeout(function () { l.classList.add('in'); }, i * 170); });
          io.disconnect();
        }
      });
    }, { threshold: 0.4 });
    io.observe(row);
  })();

  /* ============================================================
     6.6 · CUSTOM CAKES — subtle depth parallax. Each photo drifts
        vertically within its (overflow-clipped) frame at a slightly
        different rate than the page. Reduced motion = static (CSS).
     ============================================================ */
  (function () {
    if (REDUCED) return;                 // CSS base transform stays = static framing
    var sec = document.getElementById('cakes');
    var top = document.getElementById('cakeTop');
    var tall = document.getElementById('cakeTall');
    if (!sec || (!top && !tall)) return;
    var items = [];
    if (top) items.push({ el: top, base: 'translate3d(0,', tail: '%,0) scale(1.12)', amp: 5 });     // amp < scale-overflow so the frame edge never shows
    if (tall) items.push({ el: tall, base: 'translate3d(0,', tail: '%,0) scale(1.05)', amp: 2.3 });  // gentle so the flowers stay uncut
    var lastP = null;
    onScroll(
      function (y) {
        if (M.cakesTop == null || M.vh == null) return null;
        var topInView = M.cakesTop - y;                            // section top vs viewport — CACHED metrics, no per-frame layout read
        if (topInView > M.vh || topInView + M.cakesH < 0) return null;   // off-screen → skip the writes entirely
        return ((M.vh / 2) - (topInView + M.cakesH / 2)) / M.vh;   // ~ -1 entering → +1 leaving
      },
      function (prog) {
        if (prog == null) return;
        var p = Math.max(-1, Math.min(1, prog));
        if (lastP !== null && Math.abs(p - lastP) < 0.0008) return; // skip imperceptible updates
        lastP = p;
        items.forEach(function (it) { it.el.style.transform = it.base + (p * it.amp).toFixed(2) + it.tail; });
      }
    );
  })();

  /* ============================================================
     7 · VISIT — FAQ accordion (opening one auto-closes the rest)
     ============================================================ */
  (function () {
    var qs = [].slice.call(document.querySelectorAll('.visit .faq-q'));
    qs.forEach(function (q) {
      q.addEventListener('click', function () {
        var wasOpen = q.getAttribute('aria-expanded') === 'true';
        qs.forEach(function (o) { o.setAttribute('aria-expanded', 'false'); o.nextElementSibling.style.maxHeight = '0px'; });
        if (!wasOpen) { q.setAttribute('aria-expanded', 'true'); var a = q.nextElementSibling; a.style.maxHeight = a.scrollHeight + 'px'; }
      });
    });
  })();

  /* ============================================================
     8 · FOOTER — Crumblr two-curtain close (rAF loop)
     ============================================================ */
  (function () {
    var footer = document.querySelector('.footer');
    if (!footer) return;
    var top = footer.querySelector('.curtain-top');
    var bot = footer.querySelector('.curtain-bottom');
    var inner = footer.querySelector('.f-inner');
    if (REDUCED || !top || !bot) {
      if (top) top.style.transform = 'translate3d(0,0,0)';
      if (bot) bot.style.transform = 'translate3d(0,0,0)';
      if (inner) inner.style.opacity = 1;
      return;
    }
    onScroll(
      function (y) { if (M.footerTop == null) return null; var ft = M.footerTop - y; return Math.max(0, Math.min(1, (M.vh - ft) / M.vh)); },
      function (p) {
        if (p == null) return;
        var cp = Math.min(1, p / 0.95);  // panels travel as the footer enters, MEET right as it fills the viewport
        top.style.transform = 'translate3d(0,' + (-100 + cp * 100) + '%,0)';
        bot.style.transform = 'translate3d(0,' + (100 - cp * 100) + '%,0)';
        if (inner) inner.style.opacity = 0.06 + 0.94 * Math.max(0, Math.min(1, (p - 0.3) / 0.6));
      }
    );
  })();

  /* ============================================================
     CUSTOM RING CURSOR — hero only, pointer devices, after boot
     ============================================================ */
  (function () {
    if (REDUCED) return;
    if (!window.matchMedia('(hover:hover) and (pointer:fine)').matches) return; // pointer devices only
    var cursor = document.getElementById('cursor');
    var hero = document.getElementById('top');
    if (!cursor || !hero) return;
    var inHero = false, x = 0, y = 0, raf = null;
    function render() { cursor.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)'; raf = null; }
    window.addEventListener('mousemove', function (e) {
      x = e.clientX; y = e.clientY;
      if (inHero && !raf) raf = requestAnimationFrame(render);
      if (inHero && !cursor.classList.contains('on')) { cursor.classList.add('on'); document.body.classList.add('hero-cursor'); }
    }, { passive: true });
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        inHero = e.isIntersecting && e.intersectionRatio >= 0.5;
        if (!inHero) { cursor.classList.remove('on'); document.body.classList.remove('hero-cursor'); }
      });
    }, { threshold: [0, 0.5, 1] });
    io.observe(hero);
  })();

  /* ---------- initial measure (after layout settles) ---------- */
  measure();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleMeasure);
  window.addEventListener('load', scheduleMeasure);

})();
