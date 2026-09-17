/* Central place for every setting the console reads from the environment.

   Nothing here is required to boot: each integration reports whether it is
   configured, and the UI degrades to "not connected" rather than crashing.
   Secrets are read on the server only - never import this file from a client
   component. */

function str(name: string): string {
  return (process.env[name] || '').trim();
}

export const env = {
  // --- Linkrunner -----------------------------------------------------------
  linkrunnerKey: str('LINKRUNNER_API_KEY'),

  // --- Redirect URL defaults ------------------------------------------------
  // Where web visitors land. Editable per campaign in the UI.
  redirectBaseUrl: str('REDIRECT_BASE_URL') || 'https://tal.club/boss-login',
  // The query parameter that carries the identifier.
  redirectParam: str('REDIRECT_PARAM') || 'utm_campaign',
  // Extra fixed parameters appended to every generated redirect, as a query
  // string fragment (e.g. utm_source=linkrunner). Empty by default: the
  // redirect is just <base>?utm_campaign=<identifier>.
  redirectExtraParams: str('REDIRECT_EXTRA_PARAMS'),

  // --- Campaign kinds (see lib/classify.ts) ---------------------------------
  systemCampaignPatterns: str('SYSTEM_CAMPAIGN_PATTERNS'),
  referralCampaignPatterns: str('REFERRAL_CAMPAIGN_PATTERNS'),

  // --- Web users (desktop onboarding flow) -----------------------------------
  // CSV export of the Metabase question, used until Metabase is connected.
  webflowCsvPath: str('WEBFLOW_CSV_PATH'),
  // utm_campaign values written by a LATER step (the QR / app-download flow)
  // that overwrite the original source. Regexes, | separated.
  secondTouchPatterns: str('SECOND_TOUCH_PATTERNS'),

  // --- Metabase -------------------------------------------------------------
  metabaseUrl: str('METABASE_URL').replace(/\/+$/, ''),
  metabaseKey: str('METABASE_API_KEY'),
  metabaseCardId: Number(str('METABASE_CARD_ID') || '577'),
  // Column in that saved question holding the identifier (utm_campaign value).
  metabaseIdentifierColumn: str('METABASE_IDENTIFIER_COLUMN') || 'utm_campaign',

  // --- Google Analytics 4 ---------------------------------------------------
  ga4PropertyId: str('GA4_PROPERTY_ID'),
  // The service-account JSON, pasted as a single line.
  ga4ServiceAccountJson: str('GA4_SERVICE_ACCOUNT_JSON'),

  // --- Database / auth ------------------------------------------------------
  databaseUrl: str('DATABASE_URL'),
  // Where the embedded database lives when DATABASE_URL is unset.
  dataDir: str('DATA_DIR'),
  appPassword: str('APP_PASSWORD'),   // bootstrap: the first super admin's password
  adminEmail: str('ADMIN_EMAIL') || 'kartikay@grapevine.in',
  adminName: str('ADMIN_NAME') || 'Kartikay',
  sessionSecret: str('SESSION_SECRET'),
  // Shared secret for the cron/sync endpoint.
  syncSecret: str('SYNC_SECRET'),
  // Background refresh inside a long-running server (local / one-box host).
  // Set AUTO_SYNC=0 to turn it off. Never runs on Vercel (serverless).
  autoSync: str('AUTO_SYNC') !== '0' && !process.env.VERCEL,
};

export const configured = {
  linkrunner: Boolean(env.linkrunnerKey),
  metabase: Boolean(env.metabaseUrl && env.metabaseKey && env.metabaseCardId),
  ga4: Boolean(env.ga4PropertyId && env.ga4ServiceAccountJson),
  hostedDb: Boolean(env.databaseUrl),
  auth: Boolean(env.appPassword),
};
