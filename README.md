# Link-in Park

A front end for Linkrunner. Create campaign links, attach a tracked web
redirection in one click, edit existing links, and see every link's numbers in
one place: clicks / installs / sign-ups from Linkrunner, landings from Google
Analytics, and acquired users from Metabase.

Linkrunner stays the system of record. This console only talks to it through
its API and mirrors what it sees.

## How tracking fits together

```
New link → Linkrunner campaign (Display ID left blank, as in the dashboard)
         → optional web redirect: https://tal.club/boss-login?utm_campaign=<id>
                                                                                   ^ 5-char identifier, unique per link
Per campaign:   clicks / installs / sign-ups   ← Linkrunner Reporting API
Per identifier: landings / visitors            ← GA4 (utm_campaign = session campaign)
                users, and who they are        ← Metabase question #577 "Webflow Users"
```

Replacing a redirect keeps the old identifier in history with its own numbers.
"Import from Linkrunner" pulls in every campaign already in the account and
reads identifiers out of their existing redirect URLs.

Clicking a campaign in the list opens it as a pop-up over the list (an
intercepted route - `app/@modal/(.)campaigns/[displayId]`); the same view is
the full page at `/campaigns/<id>`. It shows the numbers, a sign-ups-per-day
chart built from Linkrunner's user records (`GET /attributed-users`, complete
history), a clicks/installs/sign-ups chart built from the console's own
snapshots (starts the day the console first synced), the people who signed up
(name, phone, email, times), the redirect history, and notes.

## Web users (desktop onboarding flow)

Desktop clickers do not install the app; they onboard on the website and are
recorded in the Metabase question "Webflow Users" with the `utm_campaign`
they arrived with. The **Web users** tab shows them by utm_campaign, ties
each value back to a Linkrunner campaign when knowable (by campaign name, or
by a redirect identifier no other campaign shares), and lists the people.
Source: daily CSV exports of the question, merged by user id into
`data/webflow-users.store.json` via the **Upload CSV** button (each export
only covers a 7-10 day window, so uploads accumulate rather than replace;
raw files are kept in `data/uploads/`). Once `METABASE_API_KEY` is set the
question is queried directly - same columns, same code (`lib/webusers.ts`).
The table's `utm_campaign` is the first touch and `utm_campaign_2` (a
Postgres array) lists every later step - QR, web-mobile flow, WATI - which
the tab shows as "Where they went next".

## Campaign kinds

Linkrunner holds three populations under one roof, so the list separates
them (`lib/classify.ts`): **My campaigns** (hand-made or created here),
**Referral links** (`Referral - <person>`, minted by the referral-link site)
and **App referrals** (`BOSS_REFER_*` / `CANDIDATE_REFER_*`, created by the
app for every user's share link). "Everything" shows all. Patterns are
overridable with `SYSTEM_CAMPAIGN_PATTERNS` and `REFERRAL_CAMPAIGN_PATTERNS`.

## Folders

Campaigns can be filed into folders of any depth (a platform such as LinkedIn
holding sections such as Feed ads). Folders exist only in the console's
database - Linkrunner has no such concept - so imports never move anything.
Selecting a folder scopes the table and the totals to it, including its
sections; the overview table at the top rolls up each section. Move campaigns
by ticking rows and using "Move to", or from the folder selector in a
campaign's pop-up. "New link in <folder>" files a new link straight there.
Deleting a folder lifts its campaigns and sections to its parent.
`scripts/autofile.mts` files unfiled hand-made campaigns by name rules (team
names / TL / TBPN → Thought-leader posts; `<Name> LinkedIn Post` → Stakeholder
shares; LinkedIn/SM/ads keywords → Feed ads; test → Tests; Reddit/Meta/ChatGPT
by keyword). Dry run by default; `--apply` moves, and never touches campaigns
already filed by hand.

## Running it

```
npm install
cp .env.example .env.local     # then fill in the keys
npm run dev                    # http://localhost:3000
```

With no `DATABASE_URL` the app uses an embedded Postgres in `./.data` - nothing
to install. Migrations in `./drizzle` apply themselves on first use.

## Settings (`.env.local`)

| Variable | What it is |
|---|---|
| `LINKRUNNER_API_KEY` | Linkrunner → Settings → Data APIs |
| `REDIRECT_BASE_URL` | Default landing page (`https://tal.club/boss-login`) |
| `REDIRECT_PARAM` | Query parameter carrying the identifier (`utm_campaign`) |
| `REDIRECT_EXTRA_PARAMS` | Fixed extras on every redirect (empty by default) |
| `METABASE_URL`, `METABASE_API_KEY` | Metabase → Admin → Authentication → API Keys |
| `METABASE_CARD_ID` | Saved question listing landing-page users (577) |
| `METABASE_IDENTIFIER_COLUMN` | Its column holding the utm_campaign value |
| `GA4_PROPERTY_ID` | GA4 → Admin → Property details |
| `GA4_SERVICE_ACCOUNT_JSON` | Service-account key file, as one line |
| `DATABASE_URL` | Hosted Postgres (Supabase transaction pooler). Empty = embedded |
| `APP_PASSWORD` | Sign-in password. **Set before hosting.** |
| `SYNC_SECRET` | Lets a scheduler call `/api/sync/reporting` |

The **Setup** page in the app tests each connection and lists the Metabase
question's columns.

## Linkrunner facts the code depends on

- Auth header is `linkrunner-key`. Write surface: `POST /create-campaign`,
  `PATCH /campaigns/:id` (needs `name` every time), `DELETE /campaigns/:id`.
- Create returns `display_id`; links are `https://link.tal.club/?c=<display_id>`.
- `website` (the dashboard's Desktop URL) is settable via PATCH - verified
  2026-09-14. It was silently ignored for two weeks in Aug 2026, so the app
  reads the campaign back after every PATCH and refuses to record a redirect
  Linkrunner did not keep.
- **Reporting API: one request per minute per key, 100 rows per page.** The
  refresh walks one page per call and keeps a cursor, so it can be driven by
  the button (auto-continues) or by any scheduler hitting
  `/api/sync/reporting?secret=…` every minute.
- Numbers arrive as display strings (`"3,201"`); sign-ups key is `"sign-ups"`.
- The key's budget is shared with anything else using it. The old referral
  sheet sync (`link-generator/google-apps-script`) polls the same endpoint.

## Hosting (when ready)

Vercel + Supabase. Set every variable above in Vercel's environment settings,
`DATABASE_URL` to Supabase's transaction-pooler string, and `APP_PASSWORD`.
Point a scheduler (cron-job.org, Supabase cron) at `/api/sync/reporting`.

## Layout

```
app/                pages + server actions (app/actions.ts)
lib/campaigns.ts    the operations: create, attach redirect, import, sync
lib/integrations/   linkrunner.ts · metabase.ts · ga4.ts
lib/db/             schema + client (PGlite locally, Postgres hosted)
drizzle/            SQL migrations (npx drizzle-kit generate after schema edits)
```
