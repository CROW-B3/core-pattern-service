import process from 'node:process';
import { drizzleD1Config } from '@deox/drizzle-d1-utils';

export default drizzleD1Config(
  {
    out: './drizzle/migrations',
    schema: './src/db/schema.ts',
  },
  {
    accountId: process.env.CLOUDFLARE_D1_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_D1_API_TOKEN,
    databaseId: '9d9eea51-36a5-442d-ac99-b59d2878709c',
    binding: 'DB',
    remote: process.env.REMOTE === 'true' || process.env.REMOTE === '1',
  }
);
