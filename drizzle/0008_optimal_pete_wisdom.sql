ALTER TABLE `users` ADD `latitude` double;--> statement-breakpoint
ALTER TABLE `users` ADD `longitude` double;--> statement-breakpoint
ALTER TABLE `users` ADD `radiusMeters` int DEFAULT 150;