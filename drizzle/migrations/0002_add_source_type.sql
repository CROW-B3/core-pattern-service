ALTER TABLE `pattern_result` ADD COLUMN `source_type` text;
CREATE INDEX IF NOT EXISTS `pattern_source_type_idx` ON `pattern_result` (`source_type`);
