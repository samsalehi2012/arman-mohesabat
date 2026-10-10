/*!
 * dc-lite — runtime سبک برای پروتوتایپ آکادمی آرمان محاسبات
 * قالب صفحه را از <template id="dc-tpl"> می‌خواند، منطق را از #dc-logic اجرا می‌کند
 * و با هر تغییر وضعیت فقط بخش‌های تغییرکرده‌ی DOM را به‌روز می‌کند.
 */
(function () {
  'use strict';

  var WHOLE = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/;
  var HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;

  /* ---------- toast ---------- */
  var toastEl = null, toastTimer = null;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'proto-toast';
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2600);
  }
  window.protoToast = toast;

  /* ---------- PWA ---------- */
  var deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredPrompt = e; });
  window.dcInstall = function () {
    var standalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
    var ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (standalone || navigator.standalone) { toast('اپ روی همین دستگاه نصب شده است.'); return; }
    if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt = null; return; }
    if (ios) { toast('در سافاری: دکمه اشتراک‌گذاری ← Add to Home Screen'); return; }
    toast('از منوی مرورگر گزینه «نصب برنامه» یا «Add to Home screen» را بزنید.');
  };
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }

  /* ---------- template engine ---------- */
  function lookup(path, scope) {
    path = path.trim();
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (path === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(path)) return parseFloat(path);
    if (/^(['"]).*\1$/.test(path)) return path.slice(1, -1);
    var parts = path.split('.');
    var v = scope[parts[0]];
    for (var i = 1; i < parts.length; i++) {
      if (v === null || v === undefined) return undefined;
      v = v[parts[i]];
    }
    return v;
  }
  function interp(str, scope) {
    if (str.indexOf('{{') < 0) return str;
    return str.replace(HOLE, function (_, p) {
      var v = lookup(p, scope);
      return v === null || v === undefined ? '' : String(v);
    });
  }
  function child(scope, name, value, index) {
    var s = Object.create(scope);
    s[name] = value;
    s.$index = index;
    return s;
  }
  function renderInto(src, scope, out) {
    var nodes = src.childNodes;
    for (var i = 0; i < nodes.length; i++) renderNode(nodes[i], scope, out);
  }
  function renderNode(n, scope, out) {
    if (n.nodeType === 3) { out.appendChild(document.createTextNode(interp(n.data, scope))); return; }
    if (n.nodeType !== 1) return;
    if (n.localName === 'template' && n.getAttribute('data-sc')) {
      var kind = n.getAttribute('data-sc');
      if (kind === 'if') {
        var cond = n.getAttribute('value') || '';
        var m = cond.match(WHOLE);
        if (m ? lookup(m[1], scope) : cond) renderInto(n.content, scope, out);
      } else if (kind === 'for') {
        var lm = (n.getAttribute('list') || '').match(WHOLE);
        var list = lm ? lookup(lm[1], scope) : null;
        var as = n.getAttribute('as') || 'item';
        if (list && list.length) for (var k = 0; k < list.length; k++) renderInto(n.content, child(scope, as, list[k], k), out);
      }
      return;
    }
    var el = document.createElementNS(n.namespaceURI, n.localName);
    var attrs = n.attributes;
    for (var i = 0; i < attrs.length; i++) {
      var name = attrs[i].name, val = attrs[i].value;
      if (name.indexOf('hint-') === 0) continue;
      var whole = val.match(WHOLE);
      if (/^on[a-z]+$/.test(name) && whole) {
        var fn = lookup(whole[1], scope);
        if (typeof fn === 'function') (el.__ev || (el.__ev = {}))[name.slice(2)] = fn;
        continue;
      }
      var v = whole ? lookup(whole[1], scope) : interp(val, scope);
      if (v === undefined || v === null || v === false) continue;
      if (v === true) v = '';
      el.setAttribute(name, String(v));
      if (whole && name === 'value') el.__ctrl = String(v);
    }
    if (n.localName === 'template') { el.innerHTML = n.innerHTML; out.appendChild(el); return; }
    renderInto(n, scope, el);
    if (el.__ctrl !== undefined && 'value' in el) el.value = el.__ctrl;
    out.appendChild(el);
  }

  /* ---------- DOM morph (keeps focus, scroll and running animations) ---------- */
  function sameKind(a, b) {
    return a.nodeType === b.nodeType && a.nodeName === b.nodeName && (a.nodeType !== 1 || a.namespaceURI === b.namespaceURI);
  }
  function skipAttr(tag, name) {
    if (tag === 'DETAILS' && name === 'open') return true;
    if ((tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') && (name === 'value' || name === 'checked')) return true;
    return false;
  }
  function morphEl(a, b) {
    var tag = a.nodeName, i;
    for (i = a.attributes.length - 1; i >= 0; i--) {
      var nm = a.attributes[i].name;
      if (!b.hasAttribute(nm) && !skipAttr(tag, nm)) a.removeAttribute(nm);
    }
    for (i = 0; i < b.attributes.length; i++) {
      var at = b.attributes[i];
      if (skipAttr(tag, at.name)) continue;
      if (a.getAttribute(at.name) !== at.value) a.setAttribute(at.name, at.value);
    }
    a.__ev = b.__ev;
    a.__ctrl = b.__ctrl;
    if (b.__ctrl !== undefined && a.value !== b.__ctrl && document.activeElement !== a) a.value = b.__ctrl;
    if (tag !== 'TEXTAREA') morphChildren(a, b);
  }
  function morphChildren(from, to) {
    var a = Array.prototype.slice.call(from.childNodes);
    var b = Array.prototype.slice.call(to.childNodes);
    for (var i = 0; i < b.length; i++) {
      var na = a[i], nb = b[i];
      if (!na) { from.appendChild(nb); continue; }
      if (!sameKind(na, nb)) { from.replaceChild(nb, na); continue; }
      if (na.nodeType === 3) { if (na.data !== nb.data) na.data = nb.data; continue; }
      if (na.nodeType === 1) morphEl(na, nb);
    }
    for (var j = b.length; j < a.length; j++) if (a[j].parentNode === from) from.removeChild(a[j]);
  }

  /* ---------- component ---------- */
  var root, tpl, inst, pending = false;
  function render() {
    pending = false;
    var vals;
    try { vals = inst.renderVals() || {}; } catch (err) { console.error('[dc-lite] renderVals', err); return; }
    var scratch = document.createElement('div');
    renderInto(tpl.content, vals, scratch);
    morphChildren(root, scratch);
  }
  function schedule() {
    if (pending) return;
    pending = true;
    Promise.resolve().then(render);
  }
  class DCLogic {
    constructor(props) { this.props = props || {}; this.state = {}; }
    setState(p, cb) {
      var next = typeof p === 'function' ? p(this.state, this.props) : p;
      this.state = Object.assign({}, this.state, next);
      schedule();
      if (cb) Promise.resolve().then(cb);
    }
    forceUpdate() { schedule(); }
  }

  /* ---------- events ---------- */
  function fallbackClick(e) {
    if (!root || !root.contains(e.target)) return;
    var a = e.target.closest ? e.target.closest('a') : null;
    if (a && a.getAttribute('href') === '#') { e.preventDefault(); toast('این بخش در نسخه نهایی فعال می‌شود.'); return; }
    var btn = e.target.closest ? e.target.closest('button') : null;
    if (!btn || btn.disabled) return;
    var label = (btn.getAttribute('aria-label') || btn.textContent || '').trim();
    if (/پخش/.test(label)) toast('در نسخه نهایی، ویدیو با پلیر آپارات همین‌جا پخش می‌شود.');
    else if (/دانلود/.test(label)) toast('در نسخه نهایی فایل دانلود می‌شود.');
    else toast('این دکمه در نسخه نمایشی فقط ظاهر را نشان می‌دهد.');
  }
  ['click', 'change', 'input'].forEach(function (type) {
    document.addEventListener(type, function (e) {
      var n = e.target;
      while (n && n !== document) {
        if (n.__ev && n.__ev[type]) { n.__ev[type](e); return; }
        n = n.parentNode;
      }
      if (type === 'click') fallbackClick(e);
    });
  });

  /* ---------- prototype navigator ---------- */
  var PAGES = [
    ['سایت — دانشجو', [['index.html', 'صفحه اصلی'], ['course.html', 'صفحه دوره و خرید'], ['checkout.html', 'ورود و پرداخت'], ['player.html', 'تماشای دوره و پیشرفت'], ['dashboard.html', 'پنل دانشجو']]],
    ['اپ موبایل (PWA)', [['app-home.html', 'خانه'], ['app-course.html', 'صفحه دوره'], ['app-checkout.html', 'ورود و پرداخت'], ['app-player.html', 'تماشای دوره'], ['app-learning.html', 'یادگیری من'], ['app-profile.html', 'پروفایل']]],
    ['پنل مدیریت — وب', [['admin.html', 'پیشخوان'], ['admin-students.html', 'دانشجویان'], ['admin-courses.html', 'دوره‌ها و درس‌ها'], ['admin-orders.html', 'سفارش‌ها و پرداخت‌ها'], ['admin-coupons.html', 'کدهای تخفیف'], ['admin-qa.html', 'پرسش و پاسخ'], ['admin-certificates.html', 'گواهی‌ها'], ['admin-settings.html', 'تنظیمات سایت']]],
    ['پنل مدیریت — اپ', [['app-admin.html', 'پیشخوان'], ['app-admin-students.html', 'دانشجویان'], ['app-admin-courses.html', 'افزودن درس'], ['app-admin-more.html', 'بیشتر']]]
  ];
  function buildNav() {
    if (document.body.getAttribute('data-proto-nav') === 'off') return;
    var here = (location.pathname.split('/').pop() || 'index.html');
    var wrap = document.createElement('div');
    wrap.className = 'proto-nav';
    var html = '<button type="button" class="proto-nav-btn" aria-expanded="false" aria-controls="proto-nav-panel">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1.5"></rect><rect x="13" y="4" width="7" height="7" rx="1.5"></rect><rect x="4" y="13" width="7" height="7" rx="1.5"></rect><rect x="13" y="13" width="7" height="7" rx="1.5"></rect></svg>' +
      '<span>همه صفحه‌ها</span></button>' +
      '<div class="proto-nav-panel" id="proto-nav-panel" role="dialog" aria-label="فهرست صفحه‌های پروتوتایپ" hidden>' +
      '<div class="proto-nav-head"><b>نسخه نمایشی آکادمی آرمان محاسبات</b><span>داده‌ها نمونه هستند</span></div>';
    PAGES.forEach(function (g) {
      html += '<div class="proto-nav-group"><span class="proto-nav-gt">' + g[0] + '</span>';
      g[1].forEach(function (p) {
        html += '<a href="' + p[0] + '"' + (p[0] === here ? ' aria-current="page"' : '') + '>' + p[1] + '</a>';
      });
      html += '</div>';
    });
    html += '</div>';
    wrap.innerHTML = html;
    document.body.appendChild(wrap);
    var btn = wrap.querySelector('.proto-nav-btn');
    var panel = wrap.querySelector('.proto-nav-panel');
    function set(open) { panel.hidden = !open; btn.setAttribute('aria-expanded', open ? 'true' : 'false'); }
    btn.addEventListener('click', function (e) { e.stopPropagation(); set(panel.hidden); });
    document.addEventListener('click', function (e) { if (!wrap.contains(e.target)) set(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') set(false); });
  }

  /* ---------- boot ---------- */
  function boot() {
    root = document.getElementById('dc-root');
    tpl = document.getElementById('dc-tpl');
    var logic = document.getElementById('dc-logic');
    if (!root || !tpl || !logic) return;
    var Component;
    try {
      Component = new Function('DCLogic', logic.textContent + '\n;return Component;')(DCLogic);
      inst = new Component({});
    } catch (err) { console.error('[dc-lite] logic', err); return; }
    render();
    if (typeof inst.componentDidMount === 'function') inst.componentDidMount();
    buildNav();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
