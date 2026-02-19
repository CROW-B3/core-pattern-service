import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const patternResult = sqliteTable('pattern_result', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull(),
  period: text('period').notNull(), // 'daily' | 'weekly' | 'monthly' | 'yearly'
  report: text('report').notNull(), // JSON
  generatedAt: integer('generated_at', { mode: 'timestamp' }).notNull(),
});
