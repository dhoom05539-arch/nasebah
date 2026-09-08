CREATE TABLE `notification_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`graceMinutes` int NOT NULL DEFAULT 20,
	`summaryTime` varchar(5) NOT NULL DEFAULT '18:00',
	`summaryCronTaskUid` varchar(65),
	`lastSummaryDate` varchar(10),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notification_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `employees` ADD `lastAbsenceAlertDate` varchar(10);