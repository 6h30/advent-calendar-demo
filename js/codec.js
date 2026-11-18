// Turns a calendar into a short, URL-safe string and back. No server is involved:
// the whole calendar lives inside the link, after the "#", which browsers never send to a server.

const MAX_JSON_BYTES = 200_000; // refuse to inflate anything bigger (guards against "zip bomb" links)

function toBase64Url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_JSON_BYTES) {
      await reader.cancel();
      throw new Error('Calendar is too large');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

export async function encodeCalendar(calendar) {
  const json = new TextEncoder().encode(JSON.stringify(calendar));
  return toBase64Url(await deflate(json));
}

export async function decodeCalendar(text) {
  let bytes;
  try {
    bytes = fromBase64Url(text);
  } catch {
    throw new Error('This link is damaged');
  }
  let json;
  try {
    json = await inflate(bytes);
  } catch (e) {
    if (e instanceof Error && e.message === 'Calendar is too large') throw e;
    throw new Error('This link is damaged');
  }
  try {
    return JSON.parse(new TextDecoder().decode(json));
  } catch {
    throw new Error('This link is damaged');
  }
}
