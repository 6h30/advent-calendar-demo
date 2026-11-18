import { decodeCalendar, encodeCalendar } from './codec.js';
import {
  DOORS,
  THEMES,
  daysToChristmas,
  emptyCalendar,
  hasContent,
  isOpen,
  openDate,
  safeUrl,
  sanitize,
  youtubeId,
} from './model.js';
import { SAMPLE_MESSAGES } from './sample.js';

const app = document.getElementById('app');
const dialog = document.getElementById('door-dialog');
const toastEl = document.getElementById('toast');

/** One painted icon per door, img/icons/01.webp to 24.webp. */
const iconSrc = (n) => `img/icons/${String(n).padStart(2, '0')}.webp`;
const picture = (src, props = {}) => h('img', { class: 'pic', src, alt: '', draggable: 'false', decoding: 'async', ...props });

/* ---------- small helpers ---------- */

/** Build an element. Text always goes in as text, never as HTML. */
function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, val] of Object.entries(props ?? {})) {
    if (val === false || val == null) continue;
    if (key.startsWith('on')) el.addEventListener(key.slice(2), val);
    else if (key === 'class') el.className = val;
    else if (key === 'value') el.value = val;
    else el.setAttribute(key, val === true ? '' : String(val));
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

let toastTimer;
function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

function store(key, value) {
  try {
    if (value === undefined) return JSON.parse(localStorage.getItem(key) ?? 'null');
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode or blocked storage: the app still works, it just forgets */
  }
  return null;
}

function hash(text) {
  let n = 5381;
  for (let i = 0; i < text.length; i++) n = ((n << 5) + n + text.charCodeAt(i)) | 0;
  return (n >>> 0).toString(36);
}

function today(query) {
  const t = query.get('today');
  if (t && /^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const [y, m, d] = t.split('-').map(Number);
    return new Date(y, m - 1, d, 12);
  }
  return new Date();
}

function shareUrl(code, extra = '') {
  return `${location.href.split('#')[0]}#/v/${code}${extra}`;
}

/* ---------- door tiles ---------- */

/** state is 'locked', 'ready' (open but not looked at yet) or 'opened'. */
function paintDoor(el, n, state, { year, empty = false, label } = {}) {
  el.className = `door ${state === 'ready' ? '' : state}${empty ? ' empty' : ''}`.trim().replace(/\s+/g, ' ');
  const kids = [state === 'opened' ? picture(iconSrc(n), { loading: 'lazy' }) : picture('img/door.webp'), h('span', { class: 'n' }, String(n))];
  if (state === 'locked' && year) kids.push(h('small', {}, new Date(year, 11, n).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })));
  el.replaceChildren(...kids);
  if (label) el.setAttribute('aria-label', label);
}

/* ---------- pages ---------- */

function home() {
  document.body.dataset.theme = 'classic';
  document.title = 'Advent Calendar Maker';
  const example = async () => {
    const cal = emptyCalendar();
    cal.t = 'A Little Calendar for You';
    cal.f = 'A friend';
    cal.d.forEach((d, n) => (d.m = SAMPLE_MESSAGES[n]));
    location.hash = `/v/${await encodeCalendar(cal)}?preview=1`;
  };

  const demo = h('div', { class: 'demo', 'aria-hidden': 'true' });
  const demoStates = ['opened', 'opened', 'ready', 'ready', 'locked', 'locked', 'locked', 'locked'];
  demoStates.forEach((state, i) => {
    const d = h('div');
    paintDoor(d, i + 1, state);
    demo.append(d);
  });

  app.replaceChildren(
    h('main', { class: 'wrap' },
      h('section', { class: 'hero2' },
        h('div', {},
          h('h1', {}, 'Make an advent calendar for someone you love'),
          h('p', {}, 'Write 24 little surprises. Share one link. Each door opens on its own day, from December 1st to Christmas Eve.'),
          h('div', { class: 'row' },
            h('a', { class: 'btn', href: '#/create' }, 'Make my calendar'),
            h('button', { class: 'btn ghost', type: 'button', onclick: example }, 'See an example'),
          ),
          demo,
        ),
        h('img', { class: 'hero-art', src: 'img/hero.webp', width: 900, height: 1350, alt: 'A snowy village street at dusk with a red cottage glowing with warm light' }),
      ),
      h('section', { class: 'features' },
        h('div', { class: 'feature' }, h('img', { class: 'fico', src: iconSrc(21), alt: '' }), h('b', {}, 'Free and private'), 'No account. Your calendar lives inside the link, so we never see it.'),
        h('div', { class: 'feature' }, h('img', { class: 'fico', src: iconSrc(24), alt: '' }), h('b', {}, 'Opens day by day'), 'Doors stay closed until their date. No peeking, even if they try.'),
        h('div', { class: 'feature' }, h('img', { class: 'fico', src: iconSrc(15), alt: '' }), h('b', {}, 'Works everywhere'), 'Send the link by message or email. It opens on any phone or computer.'),
      ),
      h('p', { class: 'foot' }, 'Messages, pictures and videos by link. Nothing is stored on our side.'),
    ),
  );
}

function createPage() {
  document.title = 'Make your calendar';
  const saved = store('advent.draft.v1');
  let cal = saved ? sanitize(saved) : emptyCalendar();
  document.body.dataset.theme = cal.th;
  const save = () => store('advent.draft.v1', cal);

  const shareBox = h('div', { class: 'stack' });

  const title = h('input', { type: 'text', id: 'f-title', maxlength: 60, value: cal.t, oninput: (e) => { cal.t = e.target.value; save(); } });
  const from = h('input', { type: 'text', id: 'f-from', maxlength: 40, placeholder: 'e.g. Anna', value: cal.f, oninput: (e) => { cal.f = e.target.value; save(); } });
  const to = h('input', { type: 'text', id: 'f-to', maxlength: 40, placeholder: 'e.g. Ben', value: cal.to, oninput: (e) => { cal.to = e.target.value; save(); } });
  const year = h('input', {
    type: 'number', id: 'f-year', min: 2000, max: 2100, value: cal.y,
    oninput: (e) => { const y = Number(e.target.value); if (Number.isInteger(y)) { cal.y = y; save(); } },
  });

  const chipBox = h('div', { class: 'chips', role: 'group', 'aria-label': 'Theme' });
  const drawChips = () =>
    chipBox.replaceChildren(
      ...THEMES.map((t) =>
        h('button', {
          class: 'chip', type: 'button', 'aria-pressed': String(cal.th === t.id),
          onclick: () => { cal.th = t.id; document.body.dataset.theme = t.id; save(); drawChips(); },
        }, h('span', { class: 'sw', 'data-theme': t.id }), t.label),
      ),
    );
  drawChips();

  /* the side panel: progress and a button per door */
  const progressText = h('p', {}, '');
  const barFill = h('i');
  const mini = h('div', { class: 'mini', role: 'group', 'aria-label': 'Jump to a door' });
  let detailsEls = [];
  let msgEls = [];

  const refreshSide = () => {
    const filled = cal.d.filter(hasContent).length;
    progressText.textContent = `${filled} of ${DOORS} doors filled`;
    barFill.style.setProperty('--p', String(Math.round((filled / DOORS) * 100)));
    [...mini.children].forEach((b, n) => b.classList.toggle('on', hasContent(cal.d[n])));
    detailsEls.forEach((d, n) => d.classList.toggle('filled', hasContent(cal.d[n])));
  };

  const jump = (n) => {
    const d = detailsEls[n];
    if (!d) return;
    d.open = true;
    d.scrollIntoView({ behavior: 'smooth', block: 'center' });
    msgEls[n].focus({ preventScroll: true });
  };

  mini.replaceChildren(
    ...Array.from({ length: DOORS }, (_, n) =>
      h('button', { type: 'button', 'aria-label': `Door ${n + 1}`, onclick: () => jump(n) }, String(n + 1)),
    ),
  );

  const doorsBox = h('div', { class: 'doors-edit' });
  const drawDoors = () => {
    detailsEls = [];
    msgEls = [];
    doorsBox.replaceChildren(
      ...cal.d.map((door, n) => {
        const preview = h('span', { class: 'preview-text' }, door.m);
        const counter = h('div', { class: 'count-note' }, `${door.m.length}/500`);
        const msg = h('textarea', {
          id: `m-${n}`, maxlength: 500, placeholder: 'Write a message, a wish or a little task…', value: door.m,
          oninput: (e) => {
            door.m = e.target.value;
            preview.textContent = door.m;
            counter.textContent = `${door.m.length}/500`;
            save();
            refreshSide();
          },
        });
        const img = h('input', {
          type: 'url', id: `i-${n}`, placeholder: 'https://… link to a picture (optional)', value: door.i,
          oninput: (e) => { door.i = e.target.value; save(); refreshSide(); },
        });
        const link = h('input', {
          type: 'url', id: `l-${n}`, placeholder: 'https://… a link or a YouTube video (optional)', value: door.l,
          oninput: (e) => { door.l = e.target.value; save(); refreshSide(); },
        });
        const details = h('details', { class: 'door-edit' },
          h('summary', {}, h('span', { class: 'num' }, n + 1), preview),
          h('div', { class: 'stack' },
            h('div', {}, h('label', { for: `m-${n}` }, 'Message'), msg, counter),
            h('div', {}, h('label', { for: `i-${n}` }, 'Picture link'), img),
            h('div', {}, h('label', { for: `l-${n}` }, 'Link or video'), link),
          ),
        );
        detailsEls.push(details);
        msgEls.push(msg);
        return details;
      }),
    );
    refreshSide();
  };
  drawDoors();

  const refill = () => {
    title.value = cal.t;
    from.value = cal.f;
    to.value = cal.to;
    year.value = cal.y;
    drawChips();
    drawDoors();
  };

  const fillSamples = () => {
    cal.d.forEach((d, n) => { if (!d.m) d.m = SAMPLE_MESSAGES[n]; });
    save();
    drawDoors();
    toast('Ideas added to the empty doors. Edit them to make them yours.');
  };

  const clearAll = () => {
    if (!confirm('Clear everything and start again?')) return;
    cal = emptyCalendar();
    document.body.dataset.theme = cal.th;
    save();
    shareBox.replaceChildren();
    refill();
  };

  const make = async () => {
    const clean = sanitize(cal);
    if (!clean.d.some(hasContent)) {
      toast('Add at least one message first.');
      return;
    }
    const code = await encodeCalendar(clean);
    const url = shareUrl(code);
    const field = h('input', { type: 'text', readonly: true, value: url, 'aria-label': 'Share link', onfocus: (e) => e.target.select() });
    const filled = clean.d.filter(hasContent).length;
    shareBox.replaceChildren(
      h('div', { class: 'share stack' },
        h('img', { class: 'gifts', src: 'img/gifts.webp', width: 640, height: 640, alt: '' }),
        h('h2', {}, 'Your calendar is ready'),
        h('p', {}, `${filled} of ${DOORS} doors filled. Empty doors stay a surprise.`),
        field,
        h('button', { class: 'btn wide', type: 'button', onclick: async () => {
          try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { field.select(); toast('Press Ctrl+C to copy'); }
        } }, 'Copy link'),
        h('a', { class: 'btn ghost wide', href: shareUrl(code, '?preview=1'), target: '_blank', rel: 'noopener' }, 'Preview with all doors open'),
        url.length > 6000 ? h('p', { class: 'warn' }, 'This link is long. Some chat apps may cut it, so try shorter messages.') : null,
        h('p', { class: 'muted' }, 'Anyone with this link can read the calendar, so share it only with people you trust. Change anything and press the button again for a new link.'),
      ),
    );
    shareBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  app.replaceChildren(
    h('main', { class: 'wrap wide stack' },
      h('a', { href: '#/' }, '← Back'),
      h('h1', {}, 'Make your calendar'),
      h('div', { class: 'create-grid' },
        h('div', { class: 'stack' },
          h('section', { class: 'panel stack' },
            h('div', { class: 'grid2' },
              h('div', {}, h('label', { for: 'f-title' }, 'Title'), title),
              h('div', {}, h('label', { for: 'f-year' }, 'Year'), year),
              h('div', {}, h('label', { for: 'f-from' }, 'From'), from),
              h('div', {}, h('label', { for: 'f-to' }, 'To'), to),
            ),
            h('div', {}, h('label', {}, 'Theme'), chipBox),
          ),
          h('section', { class: 'stack' },
            h('div', { class: 'row' },
              h('h2', {}, 'The 24 doors'),
              h('button', { class: 'btn ghost small', type: 'button', onclick: fillSamples }, 'Fill empty doors with ideas'),
              h('button', { class: 'btn ghost small', type: 'button', onclick: clearAll }, 'Start over'),
            ),
            h('p', { class: 'muted' }, 'Pictures must be links that start with https. Photos from your phone cannot be uploaded yet.'),
            doorsBox,
          ),
        ),
        h('aside', { class: 'side stack' },
          h('div', { class: 'panel' },
            h('h2', {}, 'Your calendar'),
            progressText,
            h('div', { class: 'bar', 'aria-hidden': 'true' }, barFill),
            mini,
            h('button', { class: 'btn wide make', type: 'button', onclick: make }, 'Create my link'),
          ),
          shareBox,
        ),
      ),
      h('div', { class: 'cta' }, h('button', { class: 'btn wide', type: 'button', onclick: make }, 'Create my link')),
    ),
  );
}

function errorPage(message) {
  document.body.dataset.theme = 'classic';
  document.title = 'Advent Calendar Maker';
  app.replaceChildren(
    h('main', { class: 'wrap center stack' },
      h('h1', {}, 'Hmm, that did not work'),
      h('p', { class: 'muted' }, `${message}. Ask the sender to share the link again.`),
      h('div', { class: 'row center' }, h('a', { class: 'btn', href: '#/create' }, 'Make my own calendar')),
    ),
  );
}

function showDoor(cal, n) {
  const door = cal.d[n - 1];
  const yt = youtubeId(door.l);
  const link = safeUrl(door.l);
  const body = [];
  if (door.m) body.push(h('p', {}, door.m));
  if (door.i) {
    body.push(h('img', { src: door.i, alt: '', referrerpolicy: 'no-referrer', loading: 'lazy', onerror: (e) => e.target.remove() }));
  }
  if (yt) {
    body.push(h('iframe', {
      src: `https://www.youtube-nocookie.com/embed/${yt}`, title: 'Video', loading: 'lazy',
      allow: 'encrypted-media; picture-in-picture', referrerpolicy: 'strict-origin-when-cross-origin', allowfullscreen: true,
    }));
  } else if (link) {
    body.push(h('p', {}, h('a', { class: 'btn', href: link, target: '_blank', rel: 'noopener noreferrer' }, `Open ${new URL(link).hostname}`)));
  }
  if (!hasContent(door)) body.push(h('p', {}, 'Nothing in this door yet. Maybe the best surprise is still to come. ✦'));
  body.push(h('button', { class: 'btn ghost', type: 'button', onclick: () => dialog.close() }, 'Close'));
  dialog.replaceChildren(
    h('div', { class: 'dlg-head' },
      h('span', { class: 'ic', 'aria-hidden': 'true' }, h('img', { src: iconSrc(n), alt: '' })),
      h('div', {}, h('h2', {}, `Door ${n}`), h('span', {}, openDate(cal.y, n))),
    ),
    h('div', { class: 'dlg-body' }, ...body),
  );
  dialog.showModal();
}

async function viewCalendar(code, query) {
  let cal;
  try {
    cal = sanitize(await decodeCalendar(code));
  } catch (e) {
    errorPage(e instanceof Error ? e.message : 'This link is damaged');
    return;
  }
  document.body.dataset.theme = cal.th;
  document.title = `${cal.t} – Advent Calendar`;

  const now = today(query);
  const preview = query.get('preview') === '1';
  const key = `advent.opened.${hash(code)}`;
  const opened = new Set(store(key) ?? []);

  const status = (() => {
    if (preview) return 'Preview: every door is open for you. Others see them on their day.';
    const first = new Date(cal.y, 11, 1).getTime();
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (day < first) {
      const n = Math.round((first - day) / 86_400_000);
      return `The first door opens in ${n} day${n === 1 ? '' : 's'}`;
    }
    const left = daysToChristmas(now, cal.y);
    if (now.getFullYear() > cal.y || left === 0) return 'Merry Christmas! 🎄';
    return `${left} day${left === 1 ? '' : 's'} until Christmas`;
  })();

  const board = h('div', { class: 'board' });
  for (let n = 1; n <= DOORS; n++) {
    const open = preview || isOpen(now, cal.y, n);
    const empty = open && !hasContent(cal.d[n - 1]);
    const btn = h('button', { type: 'button' });
    const paint = () => {
      const state = !open ? 'locked' : opened.has(n) ? 'opened' : 'ready';
      paintDoor(btn, n, state, {
        year: cal.y,
        empty,
        label: open ? `Open door ${n}` : `Door ${n}, opens ${openDate(cal.y, n)}`,
      });
    };
    paint();
    btn.addEventListener('click', () => {
      if (!open) {
        toast(`Door ${n} opens on ${openDate(cal.y, n)}`);
        return;
      }
      opened.add(n);
      store(key, [...opened]);
      paint();
      showDoor(cal, n);
    });
    board.append(btn);
  }

  const names = [cal.f && `from ${cal.f}`, cal.to && `for ${cal.to}`].filter(Boolean).join(' ');
  app.replaceChildren(
    h('main', { class: 'wrap' },
      h('header', { class: 'banner' },
        h('div', { class: 'banner-text' },
          h('h1', {}, cal.t),
          names ? h('p', {}, names) : null,
          h('span', { class: 'count' }, status),
        ),
      ),
      board,
      h('p', { class: 'foot' }, 'Made with Advent Calendar Maker · ', h('a', { href: '#/create' }, 'make your own')),
    ),
  );
}

/* ---------- router ---------- */

dialog.addEventListener('click', (e) => {
  if (e.target === dialog) dialog.close();
});

async function render() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  const query = new URLSearchParams(qs);
  if (dialog.open) dialog.close();
  window.scrollTo(0, 0);
  if (path.startsWith('/v/')) await viewCalendar(path.slice(3), query);
  else if (path === '/create') createPage();
  else home();
}

window.addEventListener('hashchange', render);
render();
