-- 为统计查询添加优化索引
-- 这些索引将提高商户端数据统计接口的查询性能

-- 为玩家道具分表添加统计查询索引
-- 注意：这些索引需要在每个分表上执行
-- 索引模板，需要替换 {table_name} 为实际的分表名称

-- 1. 为玩家道具表添加复合索引，优化按应用和时间范围统计
-- ALTER TABLE `{player_items_table}` ADD INDEX `idx_stats_app_time` (`app_id`, `obtain_time`, `status`);

-- 2. 为玩家道具表添加复合索引，优化按道具和时间范围统计
-- ALTER TABLE `{player_items_table}` ADD INDEX `idx_stats_item_time` (`item_id`, `obtain_time`, `status`);

-- 3. 为玩家道具表添加复合索引，优化活跃用户统计
-- ALTER TABLE `{player_items_table}` ADD INDEX `idx_stats_player_time` (`player_id`, `obtain_time`);

-- 4. 为流水表添加复合索引，优化按应用和时间范围统计
-- ALTER TABLE `{item_records_table}` ADD INDEX `idx_stats_app_time_type` (`app_id`, `created_at`, `record_type`);

-- 5. 为流水表添加复合索引，优化按道具和时间范围统计
-- ALTER TABLE `{item_records_table}` ADD INDEX `idx_stats_item_time_type` (`item_id`, `created_at`, `record_type`);

-- 6. 为流水表添加复合索引，优化活跃用户统计
-- ALTER TABLE `{item_records_table}` ADD INDEX `idx_stats_player_time` (`player_id`, `created_at`);

-- 为主表添加索引优化

-- 7. 为应用表添加商户ID和状态的复合索引
ALTER TABLE `apps` ADD INDEX `idx_merchant_status` (`merchant_id`, `status`);

-- 8. 为道具模板表添加应用ID和状态的复合索引
ALTER TABLE `item_templates` ADD INDEX `idx_app_status` (`app_id`, `is_active`, `status`);

-- 9. 为分表元数据添加查询优化索引
ALTER TABLE `sharding_metadata` ADD INDEX `idx_app_type_status` (`app_id`, `table_type`, `status`);
ALTER TABLE `sharding_metadata` ADD INDEX `idx_merchant_type_status` (`merchant_id`, `table_type`, `status`);