CREATE TABLE IF NOT EXISTS `pattern_result` (
  `id` text PRIMARY KEY NOT NULL,
  `organization_id` text NOT NULL,
  `period` text NOT NULL,
  `report` text NOT NULL,
  `generated_at` integer NOT NULL
);
CREATE INDEX IF NOT EXISTS `pattern_org_idx` ON `pattern_result` (`organization_id`);
CREATE INDEX IF NOT EXISTS `pattern_period_idx` ON `pattern_result` (`period`);
