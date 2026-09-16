/* Files the hand-made campaigns into folders by name. Re-runnable: only
   touches campaigns that are currently unfiled, so anything moved by hand
   stays where it was put.

     npx tsx scripts/autofile.mts           # dry run: prints what would move
     npx tsx scripts/autofile.mts --apply   # moves them (stop `next dev` first) */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
const P = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(P);
const APPLY = process.argv.includes('--apply');

const TEAM = ['kartikay', 'pari', 'gaurika', 'aganya', 'prabhav', 'akshat', 'abhishek', 'rishikesh', 'rishi', 'aj', 'kk', 'tushar', 'saubhik', 'souvik', 'monil', 'krish', 'bigi', 'bigyan', 'sanchit', 'dhwani', 'payal', 'sahitya', 'ritesh', 'megh', 'sandip', 'yash', 'arpit'];
const word = (w: string) => new RegExp(`(^|[^a-z])${w}([^a-z]|$)`, 'i');
const hasTeamName = (n: string) => TEAM.some((t) => word(t).test(n));
const isTL = (n: string) => /(^|[^a-z])(tl|tbpn|credits|thought)([^a-z]|$)/i.test(n);
const isCreative = (n: string) => /(^|[^a-z])(gif|static)([^a-z]|$)/i.test(n);

export type Target = 'Tests' | 'ChatGPT ads' | 'Reddit ads' | 'Meta ads' | 'LinkedIn / Stakeholder shares' | 'LinkedIn / Thought-leader posts (team accounts)' | 'LinkedIn / Feed ads (company account)' | null;

export function classify(name: string): Target {
  const n = name.trim();
  if (/(^|[^a-z])test|test$/i.test(n)) return 'Tests';   // not "Fastest"…
  if (/chatgpt|\bgpt\b/i.test(n)) return 'ChatGPT ads';
  if (/reddit/i.test(n)) return 'Reddit ads';
  if (/\bmeta\b|facebook|\bfb\b|instagram|\binsta\b/i.test(n)) return 'Meta ads';
  if (/\b(ios|android)\b/i.test(n)) return null;                       // attributed later
  if (hasTeamName(n) || isTL(n)) return 'LinkedIn / Thought-leader posts (team accounts)';
  if (/linkedin[\s_-]*post/i.test(n) || /^[A-Z][a-z]+ [A-Z][a-z]+\b.*linkedin/i.test(n)) return 'LinkedIn / Stakeholder shares';
  if (isCreative(n) || /linkedin|\bsm\b|\bfeed\b|sponsored|company|banner|social|\bads?\b/i.test(n)) return 'LinkedIn / Feed ads (company account)';
  return null;
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const lr = await import(P + '/lib/integrations/linkrunner.ts');
  const mine = (await lr.listCampaigns()).filter((c) => !/^(BOSS|CANDIDATE)_REFER_|^Referral - /i.test(c.name));
  const groups = new Map<string, typeof mine>();
  for (const c of mine) { const k = classify(c.name) || '— left unfiled —'; (groups.get(k) || groups.set(k, []).get(k)!).push(c); }
  for (const [k, list] of [...groups.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n${k}: ${list.length}`);
    if (!k.includes('Thought-leader')) console.log('   ' + list.map((c) => c.name.slice(0, 30)).join(' | '));
  }
  if (APPLY) {
    const f = await import(P + '/lib/folders.ts');
    const { getDb, schema } = await import(P + '/lib/db/index.ts');
    const { isNull } = await import('drizzle-orm');
    const db = await getDb();
    const unfiled = new Set((await db.select({ id: schema.campaigns.displayId }).from(schema.campaigns).where(isNull(schema.campaigns.folderId))).map((r) => r.id));
    let folders = await f.listFolders();
    const ensure = async (path: string) => {
      const hit = folders.find((x) => x.path === path);
      if (hit) return hit.id;
      const parts = path.split(' / ');
      const parentId = parts.length > 1 ? await ensure(parts.slice(0, -1).join(' / ')) : null;
      const made = await f.createFolder(parts[parts.length - 1], parentId);
      folders = await f.listFolders();
      return made.id;
    };
    let moved = 0;
    for (const [k, list] of groups) {
      if (k.startsWith('—')) continue;
      const ids = list.map((c) => c.displayId).filter((id) => unfiled.has(id));
      if (!ids.length) continue;
      moved += await f.moveCampaigns(ids, await ensure(k));
    }
    console.log(`\nmoved ${moved} campaigns`);
  }
  process.exit(0);
}
