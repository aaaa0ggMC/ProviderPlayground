import type { ParsedVar, RespTransform, TemplatePart, VarConstraint, VarType } from '../types';

// Only match {identifier} or {identifier:...} — not JSON { } objects
const VAR_RE = /\{([a-zA-Z_]\w*(?::[^}]*)?)\}/g;

const VALID_TYPES: VarType[] = ['string', 'number', 'select', 'textarea', 'bool'];

// Match default(value) at the end of the constraint string.
// (.*?) is lazy so it captures the minimum before :default
const DEF_RE = /(.*?):default\s*\(\s*(.+?)\s*\)$/s;

function unquote(s: string): string {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

export function parseVar(raw: string): ParsedVar | null {
  const parts = raw.split(':');
  if (parts.length < 1) return null;

  const name = parts[0].trim();
  if (!name || !/^[a-zA-Z_]\w*$/.test(name)) return null;

  if (parts.length === 1) {
    return { name, type: 'string', constraint: null, defaultValue: undefined };
  }

  const typeStr = parts[1].trim().toLowerCase();
  const type: VarType = VALID_TYPES.includes(typeStr as VarType)
    ? (typeStr as VarType)
    : 'string';

  let constraint: VarConstraint | null = null;
  let defaultValue: string | undefined;

  if (parts.length >= 3) {
    const rest = parts.slice(2).join(':').trim();
    let constraintStr = rest;

    // Extract default(value) — can appear anywhere in the constraint string
    const m = rest.match(DEF_RE);
    if (m) {
      constraintStr = m[1].trim();
      const rawDefVal = m[2].trim();
      defaultValue = type === 'bool' ? rawDefVal : unquote(rawDefVal);
    }

    if (constraintStr) {
      const c = parseConstraint(constraintStr);
      if (c) constraint = c;
    }
  }

  // auto-detect number type if constraint is numeric
  if (
    constraint &&
    (constraint.kind === 'range' || constraint.kind === 'min' || constraint.kind === 'max')
  ) {
    return { name, type: 'number', constraint, defaultValue };
  }

  // auto-detect select type
  if (constraint?.kind === 'options') {
    return { name, type: 'select', constraint, defaultValue };
  }

  return { name, type, constraint, defaultValue };
}

function parseConstraint(s: string): VarConstraint | null {
  const rangeMatch = s.match(/^range\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)$/);
  if (rangeMatch) {
    return {
      kind: 'range',
      min: parseFloat(rangeMatch[1]),
      max: parseFloat(rangeMatch[2]),
    };
  }

  const minMatch = s.match(/^min\s*\(\s*(-?\d+(?:\.\d+)?)\s*\)$/);
  if (minMatch) return { kind: 'min', val: parseFloat(minMatch[1]) };

  const maxMatch = s.match(/^max\s*\(\s*(-?\d+(?:\.\d+)?)\s*\)$/);
  if (maxMatch) return { kind: 'max', val: parseFloat(maxMatch[1]) };

  const optionsMatch = s.match(/^options\s*\(\s*(.+)\s*\)$/);
  if (optionsMatch) {
    const values = optionsMatch[1]
      .split(',')
      .map((v) => unquote(v.trim()))
      .filter(Boolean);
    if (values.length > 0) return { kind: 'options', values };
  }

  return null;
}

export function parseTemplate(text: string): TemplatePart[] {
  const parts: TemplatePart[] = [];
  let lastIndex = 0;
  const re = new RegExp(VAR_RE.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ kind: 'text', value: text.slice(lastIndex, match.index) });
    }

    const raw = match[1].trim();
    const parsed = parseVar(raw);
    if (parsed) {
      parts.push({ kind: 'var', value: match[0], varInfo: parsed });
    } else {
      parts.push({ kind: 'text', value: match[0] });
    }

    lastIndex = re.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push({ kind: 'text', value: text.slice(lastIndex) });
  }

  return parts;
}

export function extractAllVars(
  templates: string[],
  exclude?: Set<string>,
): ParsedVar[] {
  const seen = new Set<string>();
  const vars: ParsedVar[] = [];
  for (const tpl of templates) {
    for (const part of parseTemplate(tpl)) {
      if (
        part.kind === 'var' &&
        part.varInfo &&
        !seen.has(part.varInfo.name) &&
        !exclude?.has(part.varInfo.name)
      ) {
        seen.add(part.varInfo.name);
        vars.push(part.varInfo);
      }
    }
  }
  return vars;
}

export function interpolate(text: string, values: Record<string, string>): string {
  return text.replace(VAR_RE, (_, key: string) => {
    const name = key.split(':')[0].trim();
    return values[name] ?? `{${key}}`;
  });
}

// --- Response transform utilities ---

const PATH_RE = /\{\.([^}]+)\}/g;

/** Walk a parsed JSON value using a dot/bracket path like ".choices[0].message.content" */
export function resolveJsonPath(root: unknown, path: string): unknown {
  const segments = path.match(/[^.[\]]+|\[(\d+)\]/g);
  if (!segments) return undefined;
  let cur: unknown = root;
  for (const seg of segments) {
    if (cur == null) return undefined;
    if (seg.startsWith('[')) {
      const idx = parseInt(seg.slice(1, -1), 10);
      cur = (cur as unknown[])[idx];
    } else {
      cur = (cur as Record<string, unknown>)[seg];
    }
  }
  return cur;
}

/**
 * Walk a JSON path with array auto-expansion: when a `.key` segment hits an
 * array, the path is mapped over every element (and results flattened).
 * `[n]` still indexes a single element. Returns the resolved value plus a flag
 * telling whether expansion occurred (so callers can distinguish a leaf array
 * value from an array produced by expansion).
 */
function resolveJsonPathExpanded(
  root: unknown,
  path: string,
): { value: unknown; expanded: boolean } {
  const segments = path.match(/[^.[\]]+|\[(\d+)\]/g);
  if (!segments) return { value: undefined, expanded: false };
  let cur: unknown[] = [root];
  let expanded = false;
  for (const seg of segments) {
    const next: unknown[] = [];
    if (seg.startsWith('[')) {
      const idx = parseInt(seg.slice(1, -1), 10);
      for (const v of cur) {
        if (Array.isArray(v)) {
          next.push((v as unknown[])[idx]);
        } else {
          next.push(undefined);
        }
      }
    } else {
      const key = seg;
      for (const v of cur) {
        if (Array.isArray(v)) {
          expanded = true;
          for (const item of v) {
            next.push(item == null ? undefined : (item as Record<string, unknown>)[key]);
          }
        } else if (v != null && typeof v === 'object') {
          next.push((v as Record<string, unknown>)[key]);
        } else {
          next.push(undefined);
        }
      }
    }
    cur = next;
  }
  return expanded ? { value: cur, expanded: true } : { value: cur[0], expanded: false };
}

/**
 * Resolve a `{.path}` expression for a text transform into its replacement
 * string. Arrays produced by auto-expansion are flattened: string elements are
 * concatenated, other values are JSON-stringified and concatenated. A leaf
 * array (no expansion) is JSON-stringified as before.
 */
function resolveTextPath(json: unknown, path: string): string {
  const { value, expanded } = resolveJsonPathExpanded(json, path);
  if (value === undefined || value === null) return `{.${path}}`;
  if (expanded && Array.isArray(value)) {
    const items = value.filter((v) => v !== undefined && v !== null);
    if (items.length === 0) return `{.${path}}`;
    if (items.every((v) => typeof v === 'string')) return items.join('');
    return items
      .map((v) => (typeof v === 'string' ? v : JSON.stringify(v)))
      .join('');
  }
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

export interface TransformResult {
  kind: 'text' | 'img' | 'audio' | 'video';
  label: string;
  value: string;
  images?: string[];
  audioSrc?: string;
  audioType?: string;
  videoSrc?: string;
  videoType?: string;
  children?: TransformResult[];
}

function detectAudioMime(b64: string): string {
  const head = b64.slice(0, 20);
  if (head.startsWith('SUQz') || head.startsWith('//u')) return 'audio/mpeg';
  if (head.startsWith('UklGR')) return 'audio/wav';
  if (head.startsWith('T2dnUw')) return 'audio/ogg';
  if (head.startsWith('ZkxhQw')) return 'audio/flac';
  return 'audio/mpeg';
}

/** Convert a Blob to a data: URL string */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Guess audio MIME from file extension in a URL */
function audioMimeFromExt(url: string): string {
  const m = url.match(/\.([a-z0-9]+)(?:\?|$)/i);
  switch (m?.[1]?.toLowerCase()) {
    case 'mp3': case 'mpeg': return 'audio/mpeg';
    case 'wav': return 'audio/wav';
    case 'ogg': case 'oga': return 'audio/ogg';
    case 'flac': return 'audio/flac';
    case 'aac': return 'audio/aac';
    case 'wma': return 'audio/x-ms-wma';
    case 'm4a': return 'audio/mp4';
    case 'webm': return 'audio/webm';
    default: return '';
  }
}

/** Guess video MIME from file extension in a URL */
function videoMimeFromExt(url: string): string {
  const m = url.match(/\.([a-z0-9]+)(?:\?|$)/i);
  switch (m?.[1]?.toLowerCase()) {
    case 'mp4': case 'm4v': return 'video/mp4';
    case 'webm': return 'video/webm';
    case 'ogg': case 'ogv': return 'video/ogg';
    case 'mov': case 'qt': return 'video/quicktime';
    case 'avi': return 'video/x-msvideo';
    case 'mkv': return 'video/x-matroska';
    case 'm3u8': return 'application/x-mpegURL';
    default: return '';
  }
}

/** Convert hex string to Uint8Array, handling large inputs */
function hexToBytes(hex: string): Uint8Array {
  // Strip any whitespace/non-hex chars
  const clean = hex.replace(/[^0-9a-fA-F]/g, '');
  const len = Math.floor(clean.length / 2);
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Convert Uint8Array to base64 using chunked String.fromCharCode to avoid stack overflow */
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000; // 32k chunks
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, i + CHUNK);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

/** Apply all response transforms to raw body text */
export async function applyTransforms(
  rawBody: string,
  transforms: RespTransform[],
): Promise<TransformResult[]> {
  if (!rawBody || transforms.length === 0) return [];

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return [];
  }

  return Promise.all(transforms.map(async (t) => {
    if (t.type === 'text' && t.format) {
      const text = t.format.replace(PATH_RE, (_, path: string) =>
        resolveTextPath(json, path.trim()),
      );
      return { kind: 'text', label: t.label, value: text };
    }
    if (t.type === 'img' && t.entry) {
      const val = resolveJsonPath(json, t.entry.trim());
      if (Array.isArray(val)) {
        const urls = val.filter((v): v is string => typeof v === 'string');
        return { kind: 'img', label: t.label, value: urls[0] ?? '', images: urls };
      }
      if (typeof val === 'string') {
        return { kind: 'img', label: t.label, value: val, images: [val] };
      }
    }
    if (t.type === 'audio-url' && t.entry) {
      const val = resolveJsonPath(json, t.entry.trim());
      if (typeof val === 'string' && (val.startsWith('http://') || val.startsWith('https://'))) {
        try {
          const resp = await fetch(val);
          const blob = await resp.blob();
          const rawDataUrl = await blobToDataUrl(blob);
          // Detect actual MIME from magic bytes (server Content-Type may be wrong)
          const idx = rawDataUrl.indexOf(',');
          const b64 = idx >= 0 ? rawDataUrl.slice(idx + 1) : '';
          const detected = detectAudioMime(b64);
          const mime = t.audioMime || detected || blob.type || audioMimeFromExt(val) || 'audio/mpeg';
          const dataUrl = `data:${mime};base64,${b64}`;
          return { kind: 'audio', label: t.label, value: val, audioSrc: dataUrl, audioType: mime };
        } catch {
          return { kind: 'text', label: t.label, value: `Failed to fetch: ${val}` };
        }
      }
    }
    if (t.type === 'video-url' && t.entry) {
      const val = resolveJsonPath(json, t.entry.trim());
      if (typeof val === 'string' && (val.startsWith('http://') || val.startsWith('https://'))) {
        try {
          const resp = await fetch(val);
          const blob = await resp.blob();
          const rawDataUrl = await blobToDataUrl(blob);
          const idx = rawDataUrl.indexOf(',');
          const b64 = idx >= 0 ? rawDataUrl.slice(idx + 1) : '';
          const mime = t.audioMime || blob.type || videoMimeFromExt(val) || 'video/mp4';
          const dataUrl = `data:${mime};base64,${b64}`;
          return { kind: 'video', label: t.label, value: val, videoSrc: dataUrl, videoType: mime };
        } catch {
          return { kind: 'text', label: t.label, value: `Failed to fetch: ${val}` };
        }
      }
    }
    if (t.type === 'audio' && t.entry) {
      const val = resolveJsonPath(json, t.entry.trim());
      if (typeof val === 'string' && val) {
        // Already a data URL
        if (val.startsWith('data:')) {
          const mime = t.audioMime || val.slice(5, val.indexOf(';'));
          return { kind: 'audio', label: t.label, value: val, audioSrc: val, audioType: mime };
        }
        // Decode based on encoding
        const enc = t.encoding || 'base64';
        let b64: string;
        if (enc === 'hex8') {
          try {
            const bytes = hexToBytes(val);
            b64 = bytesToBase64(bytes);
          } catch {
            b64 = val;
          }
        } else {
          b64 = val;
        }
        const mime = t.audioMime || detectAudioMime(b64);
        return {
          kind: 'audio',
          label: t.label,
          value: val.slice(0, 40) + '\u2026',
          audioSrc: `data:${mime};base64,${b64}`,
          audioType: mime,
        };
      }
    }
    return { kind: 'text', label: t.label, value: '' };
  }));
}
