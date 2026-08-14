import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './db/schema.ts',
  // Must be this path for Netlify to apply migrations automatically at deploy.
  out: 'netlify/database/migrations',
});
