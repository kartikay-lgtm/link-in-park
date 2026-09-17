import { boolean, index, integer, jsonb, pgTable, serial, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/* Folders exist only in the console - Linkrunner has no such concept. Any
   depth: a platform (LinkedIn) holds sections (Feed ads, Thought-leader
   posts). Deleting a folder lifts its children and campaigns to its parent. */
export const folders = pgTable('folders', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  parentId: uuid('parent_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/* One row per Linkrunner campaign. The console mirrors Linkrunner rather than
   replacing it: `displayId` is Linkrunner's id and the join key everywhere.
   Latest click/install/sign-up numbers are denormalised here for the list
   view; the full history lives in reporting_snapshots. */
export const campaigns = pgTable('campaigns', {
  displayId: text('display_id').primaryKey(),
  name: text('name').notNull(),
  link: text('link').notNull().default(''),
  deeplink: text('deeplink').notNull().default(''),
  website: text('website').notNull().default(''),              // desktop web redirect
  androidWebRedirect: text('android_web_redirect').notNull().default(''),
  iosWebRedirect: text('ios_web_redirect').notNull().default(''),
  active: boolean('active').notNull().default(true),
  // 'console' = created here, 'import' = pulled in from Linkrunner.
  origin: text('origin').notNull().default('console'),
  lrCreatedAt: timestamp('lr_created_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  // Latest Linkrunner reporting numbers (null = never synced).
  clicks: integer('clicks'),
  installs: integer('installs'),
  signups: integer('signups'),
  statsAt: timestamp('stats_at', { withTimezone: true }),
  notes: text('notes').notNull().default(''),
  // Set when an import no longer finds the campaign in Linkrunner. History is
  // kept; the list hides it unless "All" is selected.
  lrDeletedAt: timestamp('lr_deleted_at', { withTimezone: true }),
  // Where the campaign is filed; null = unfiled. Never touched by imports.
  folderId: uuid('folder_id').references(() => folders.id, { onDelete: 'set null' }),
  // Linkrunner's own numeric id - what its webhooks refer to.
  lrId: integer('lr_id'),
});

/* Every web redirect a campaign has ever had. Changing a redirect closes the
   old row (replacedAt) and opens a new one, so an identifier that lived in
   the wild for three weeks keeps its own numbers after it is replaced. */
export const redirects = pgTable(
  'redirects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignDisplayId: text('campaign_display_id')
      .notNull()
      .references(() => campaigns.displayId, { onDelete: 'cascade' }),
    identifier: text('identifier').notNull(),
    url: text('url').notNull(),
    // Which Linkrunner field it was written to: website | android | ios.
    field: text('field').notNull().default('website'),
    isCurrent: boolean('is_current').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    replacedAt: timestamp('replaced_at', { withTimezone: true }),
  },
  (t) => [
    index('redirects_identifier_idx').on(t.identifier),
    index('redirects_campaign_idx').on(t.campaignDisplayId),
  ],
);

/* Point-in-time copies of the Reporting API numbers, one per campaign per
   sync. This is what turns lifetime totals into a trend. */
export const reportingSnapshots = pgTable(
  'reporting_snapshots',
  {
    id: serial('id').primaryKey(),
    campaignDisplayId: text('campaign_display_id').notNull(),
    clicks: integer('clicks'),
    installs: integer('installs'),
    signups: integer('signups'),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('snapshots_campaign_time_idx').on(t.campaignDisplayId, t.fetchedAt)],
);

/* Cursor for the paged, one-request-per-minute reporting sync. A single row
   keyed 'reporting'. */
export const syncState = pgTable('sync_state', {
  key: text('key').primaryKey(),
  nextPage: integer('next_page').notNull().default(1),
  pages: integer('pages').notNull().default(1),
  lastRequestAt: timestamp('last_request_at', { withTimezone: true }),
  lastCompletedAt: timestamp('last_completed_at', { withTimezone: true }),
  lastError: text('last_error').notNull().default(''),
});

export type Folder = typeof folders.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type Redirect = typeof redirects.$inferSelect;
export type ReportingSnapshot = typeof reportingSnapshots.$inferSelect;
export type SyncState = typeof syncState.$inferSelect;

/* ---- web users (desktop onboarding flow) ------------------------------------
   Raw rows from the Metabase export, keyed by user id, merged upload by
   upload. Kept in the database so nothing depends on local files. */
export const webUsersRaw = pgTable('web_users_raw', {
  id: text('id').primaryKey(),
  data: jsonb('data').$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const webUserUploads = pgTable('web_user_uploads', {
  id: uuid('id').primaryKey().defaultRandom(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  file: text('file').notNull(),
  rows: integer('rows').notNull(),
  added: integer('added').notNull(),
  updated: integer('updated').notNull(),
  content: text('content'),            // the CSV as uploaded, for audit
});

/* ---- users & activity ---------------------------------------------------------
   Every person has their own login. Super admins manage users and read the
   activity log; members create and manage links. */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),          // lower-cased login
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('member'),   // 'admin' | 'member'
  active: boolean('active').notNull().default(true),
  sessionVersion: integer('session_version').notNull().default(1), // bump to log every browser out
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
});

/* One row per thing a person did: link created, redirect changed, folder
   moved, CSV uploaded, login… `details` carries the specifics (link,
   redirect URL, identifier, counts). */
export const activityLog = pgTable(
  'activity_log',
  {
    id: serial('id').primaryKey(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    userId: uuid('user_id'),
    userName: text('user_name').notNull(),
    action: text('action').notNull(),                 // e.g. link.create, redirect.replace, auth.login
    target: text('target'),                           // campaign display id, folder id, email…
    summary: text('summary').notNull(),               // one readable line
    details: jsonb('details').$type<Record<string, unknown>>(),
  },
  (t) => [index('activity_log_at_idx').on(t.at), index('activity_log_user_idx').on(t.userId)],
);

export type User = typeof users.$inferSelect;
export type ActivityEntry = typeof activityLog.$inferSelect;

/* ---- live events from Linkrunner webhooks ------------------------------------
   Installs and sign-ups pushed the moment they happen. Counted on top of the
   last synced numbers until the next sync catches up. */
export const lrEvents = pgTable(
  'lr_events',
  {
    id: serial('id').primaryKey(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    kind: text('kind').notNull(),                  // 'install' | 'signup' | 'test' | 'unknown'
    campaignRef: text('campaign_ref'),             // as sent (id or display id)
    campaignName: text('campaign_name'),
    campaignDisplayId: text('campaign_display_id'),// resolved, when possible
    userName: text('user_name'),
    phone: text('phone'),
    email: text('email'),
    raw: jsonb('raw').$type<Record<string, unknown>>(),
  },
  (t) => [index('lr_events_campaign_idx').on(t.campaignDisplayId, t.at)],
);
export type LrEvent = typeof lrEvents.$inferSelect;
