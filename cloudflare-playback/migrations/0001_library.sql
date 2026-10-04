CREATE TABLE `progress` (
	`id` text PRIMARY KEY NOT NULL,
	`seconds` integer NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`credentials` text NOT NULL,
	`channel` text NOT NULL,
	`playlist` text NOT NULL,
	`cursor` text,
	`generation` text NOT NULL,
	`complete` integer DEFAULT 0 NOT NULL,
	`synced` text,
	`lock` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `videos` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`thumbnail` text NOT NULL,
	`published` text NOT NULL,
	`duration` integer NOT NULL,
	`privacy` text NOT NULL,
	`definition` text NOT NULL,
	`generation` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `videos_published` ON `videos` (`published`);