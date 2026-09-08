CREATE TABLE `daily_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dateKey` varchar(10) NOT NULL,
	`content` text NOT NULL,
	`telegramSentAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `daily_reports_id` PRIMARY KEY(`id`),
	CONSTRAINT `daily_reports_dateKey_unique` UNIQUE(`dateKey`)
);
--> statement-breakpoint
ALTER TABLE `notification_settings` MODIFY COLUMN `summaryTime` varchar(5) NOT NULL DEFAULT '04:00';