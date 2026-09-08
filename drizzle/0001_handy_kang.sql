CREATE TABLE `attendance` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeId` int NOT NULL,
	`action` enum('check_in','check_out') NOT NULL,
	`recordedAt` timestamp NOT NULL DEFAULT (now()),
	`latitude` double,
	`longitude` double,
	`accuracyMeters` double,
	`locationName` varchar(160),
	`note` text,
	CONSTRAINT `attendance_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `employees` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`branch` varchar(160) NOT NULL,
	`phone` varchar(32),
	`active` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `employees_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `work_locations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`latitude` double NOT NULL,
	`longitude` double NOT NULL,
	`radiusMeters` int NOT NULL DEFAULT 150,
	`active` int NOT NULL DEFAULT 1,
	CONSTRAINT `work_locations_id` PRIMARY KEY(`id`)
);
