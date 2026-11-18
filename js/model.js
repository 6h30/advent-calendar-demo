// What a calendar is, how it is cleaned up, and which doors are open on a given day.

export const DOORS = 24;
export const THEMES = [
  { id: 'classic', label: 'Classic' },
  { id: 'forest', label: 'Forest' },
  { id: 'midnight', label: 'Midnight' },
  { id: 'candy', label: 'Candy' },
];

const LIMITS = { title: 60, name: 40, message: 500, url: 600 };

export function defaultYear(now = new Date()) {
  // After Christmas, people are making next year's calendar.
  return now.getMonth() === 11 && now.getDate() > 24 ? now.getFullYear() + 1 : now.getFullYear();
}

export function emptyCalendar(now = new Date()) {
  return {
    v: 1,
    t: 'My Advent Calendar',
    f: '',
    to: '',
    th: 'classic',
    y: defaultYear(now),
    d: Array.from({ length: DOORS }, () => ({ m: '', i: '', l: '' })),
  };
}

function text(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/** Only https links are allowed. Anything else becomes an empty string. */
export function safeUrl(value) {
  const s = text(value, LIMITS.url);
  if (!s) return '';
  try {
    const u = new URL(s);
    return u.protocol === 'https:' ? u.href : '';
  } catch {
    return '';
  }
}

/** Returns the 11-character video id if the link is a YouTube video, else null. */
export function youtubeId(value) {
  const s = safeUrl(value);
  if (!s) return null;
  const u = new URL(s);
  const host = u.hostname.replace(/^www\./, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.slice(1);
  else if (host === 'youtube.com' || host === 'm.youtube.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else if (u.pathname.startsWith('/shorts/')) id = u.pathname.split('/')[2] ?? null;
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

/** Takes anything that came out of a link or a form and returns a calendar that is safe to show. */
export function sanitize(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('This link is damaged');
  const doors = Array.isArray(raw.d) ? raw.d : [];
  const year = Number.isInteger(raw.y) && raw.y >= 2000 && raw.y <= 2100 ? raw.y : defaultYear();
  const theme = THEMES.some((t) => t.id === raw.th) ? raw.th : 'classic';
  return {
    v: 1,
    t: text(raw.t, LIMITS.title) || 'Advent Calendar',
    f: text(raw.f, LIMITS.name),
    to: text(raw.to, LIMITS.name),
    th: theme,
    y: year,
    d: Array.from({ length: DOORS }, (_, n) => {
      const door = doors[n] && typeof doors[n] === 'object' ? doors[n] : {};
      return { m: text(door.m, LIMITS.message), i: safeUrl(door.i), l: safeUrl(door.l) };
    }),
  };
}

/** Door numbers are 1 to 24. A door opens at midnight (viewer's local time) on that day of December. */
export function isOpen(now, year, door) {
  return now.getTime() >= new Date(year, 11, door).getTime();
}

export function daysToChristmas(now, year) {
  const christmas = new Date(year, 11, 25).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.max(0, Math.round((christmas - today) / 86_400_000));
}

export function openDate(year, door) {
  return new Date(year, 11, door).toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
}

export function hasContent(door) {
  return Boolean(door.m || door.i || door.l);
}
