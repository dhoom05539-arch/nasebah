CREATE TABLE `dashboard_credentials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`username` varchar(320) NOT NULL,
	`passwordHash` varchar(200) NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `dashboard_credentials_id` PRIMARY KEY(`id`),
	CONSTRAINT `dashboard_credentials_username_unique` UNIQUE(`username`)
);
