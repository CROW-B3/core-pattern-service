import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const patternResult = sqliteTable('pattern_result', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull(),
  period: text('period').notNull(),
  sourceType: text('source_type'),
  report: text('report').notNull(),
  productIds: text('product_ids'),
  generatedAt: integer('generated_at', { mode: 'timestamp' }).notNull(),
});

export const patterns = sqliteTable('patterns', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull(),
  type: text('type').notNull(),
  confidence: real('confidence').default(0.5),
  data: text('data').notNull(),
  detectedAt: integer('detected_at').notNull(),
  createdAt: integer('created_at').notNull(),
});
