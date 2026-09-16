/* Which kind of campaign is this? Linkrunner holds three very different
   populations under one roof, and the list should not mix them by default:

     marketing   - made by hand (or here): posts, ads, banners
     referral    - "Referral - <person>": minted by the referral-link website
     app         - BOSS_REFER_* / CANDIDATE_REFER_*: created by the app itself
                   for every user's share link

   Classification is by name pattern, overridable with SYSTEM_CAMPAIGN_PATTERNS
   (app) and REFERRAL_CAMPAIGN_PATTERNS, each a `|`-separated list of regexes. */

import { env } from './env';

export type CampaignKind = 'marketing' | 'referral' | 'app';

function compile(list: string, fallback: RegExp): RegExp {
  if (!list.trim()) return fallback;
  try { return new RegExp(list.split('|').map((s) => s.trim()).filter(Boolean).map((s) => `(?:${s})`).join('|'), 'i'); }
  catch { return fallback; }
}

const APP = compile(env.systemCampaignPatterns, /^(BOSS|CANDIDATE)_REFER_/i);
const REFERRAL = compile(env.referralCampaignPatterns, /^Referral - /i);

export function campaignKind(name: string, origin: string): CampaignKind {
  if (origin === 'console') return 'marketing';
  if (APP.test(name)) return 'app';
  if (REFERRAL.test(name)) return 'referral';
  return 'marketing';
}
