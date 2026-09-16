/* Types and pure helpers for web users - no Node imports, so client
   components can use them. The loaders live in lib/webusers.ts. */

export type WebUser = {
  id: string;
  name: string;
  linkedinUrl: string;
  role: string;
  company: string;
  utmCampaign: string;          // as recorded (LAST touch); '' when missing
  utmFirst: string;             // FIRST touch, once the table stores it; '' otherwise
  journey: string[];            // later steps after the first touch (utm_campaign_2), in order
  source: string;               // what the person is credited to: first touch if known, else last
  secondTouch: boolean;         // the recorded utm is a later step that overwrote the source
  phone: string;
  email: string;
  createdAt: string | null;     // ISO
  createdDay: string;           // YYYY-MM-DD (IST)
  candidateCompleted: boolean;
  candidateStatus: string;
  bossStatus: string;           // '' when not a boss
  bossCompleted: boolean;
  hasApp: boolean;              // has_tal_hire_app
  registeredTo: string[];
  lastActiveAt: string | null;
};

export const norm = (v: string) => v.trim().toLowerCase();

/* Matching key: case, spaces and punctuation ignored, so "KK-Google-TL",
   "kk_google_tl" and "KK Google TL" are the same thing. */
export const matchKey = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '');

/* Does the table carry the first touch yet? */
export function hasFirstTouch(users: WebUser[]): boolean {
  return users.some((u) => u.utmFirst);
}

/* source (normalised) → users. The source is the first touch once the table
   stores it, otherwise the recorded utm_campaign. */
export function groupByUtm(users: WebUser[]): Map<string, WebUser[]> {
  const m = new Map<string, WebUser[]>();
  for (const u of users) {
    const k = norm(u.source);
    const l = m.get(k) || [];
    l.push(u);
    m.set(k, l);
  }
  return m;
}

/* Postgres array literals as Metabase exports them: {} · {a,b} · {"x y","z"}. */
export function parsePgArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  const s = String(v ?? '').trim();
  if (!s || s === '{}') return [];
  const body = s.startsWith('{') && s.endsWith('}') ? s.slice(1, -1) : s;
  const out: string[] = [];
  let cur = '', quoted = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quoted) {
      if (ch === '\\' && i + 1 < body.length) { cur += body[++i]; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  if (cur.trim() || out.length) out.push(cur.trim());
  return out.filter((x) => x && x.toUpperCase() !== 'NULL');
}
