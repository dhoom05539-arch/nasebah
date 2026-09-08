ALTER TABLE `employees` ADD `telegramChatId` varchar(64);--> statement-breakpoint
ALTER TABLE `employees` ADD `telegramPendingAction` enum('check_in','check_out');--> statement-breakpoint
ALTER TABLE `employees` ADD CONSTRAINT `employees_telegramChatId_unique` UNIQUE(`telegramChatId`);