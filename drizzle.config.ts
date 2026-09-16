import { defineConfig } from 'drizzle-kit';

/* Used only to generate SQL migrations from lib/db/schema.ts:
     npx drizzle-kit generate
   The app applies them itself at startup (see lib/db/index.ts). */
export default defineConfig({
  dialect: 'postgresql',
  schema: './lib/db/schema.ts',
  out: './drizzle',
});
