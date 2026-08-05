CREATE TABLE `approvals` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`tenantId` bigint unsigned NOT NULL,
	`kind` varchar(60) NOT NULL,
	`title` varchar(255) NOT NULL,
	`payload` json NOT NULL,
	`payloadHash` varchar(80) NOT NULL,
	`destination` varchar(255) NOT NULL,
	`policyDecisionId` bigint unsigned,
	`requestedBy` varchar(120) NOT NULL,
	`requestedByUserId` bigint unsigned,
	`autonomyLevel` varchar(2) NOT NULL,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`decidedBy` bigint unsigned,
	`decidedAt` timestamp,
	`reason` text,
	`usedAt` timestamp,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `approvals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`seq` int NOT NULL,
	`tenantId` bigint unsigned NOT NULL,
	`actorId` bigint unsigned,
	`actorRole` varchar(60),
	`action` varchar(120) NOT NULL,
	`subjectType` varchar(60) NOT NULL,
	`subjectId` varchar(80) NOT NULL,
	`payloadHash` varchar(80) NOT NULL,
	`policyDecisionId` bigint unsigned,
	`modelVersion` varchar(60),
	`promptVersion` varchar(60),
	`prevHash` varchar(80) NOT NULL,
	`hash` varchar(80) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_log_id` PRIMARY KEY(`id`),
	CONSTRAINT `audit_tenant_seq` UNIQUE(`tenantId`,`seq`)
);
--> statement-breakpoint
CREATE TABLE `campaign_messages` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`tenantId` bigint unsigned NOT NULL,
	`campaignId` bigint unsigned NOT NULL,
	`contactId` bigint unsigned NOT NULL,
	`channel` enum('email','sms','voice','dm') NOT NULL,
	`body` text NOT NULL,
	`status` enum('draft','queued','sent','blocked','failed') NOT NULL DEFAULT 'draft',
	`idempotencyKey` varchar(120) NOT NULL,
	`policyDecisionId` bigint unsigned,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`sentAt` timestamp,
	CONSTRAINT `campaign_messages_id` PRIMARY KEY(`id`),
	CONSTRAINT `campaign_messages_idem` UNIQUE(`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`tenantId` bigint unsigned NOT NULL,
	`name` varchar(255) NOT NULL,
	`audience` json,
	`contentFamily` varchar(120),
	`budgetCapCents` int,
	`frequencyCapPerWeek` int,
	`schedule` json,
	`channels` json,
	`autonomyLevel` varchar(2) NOT NULL DEFAULT 'A2',
	`status` enum('draft','pending_approval','approved','active','paused','completed') NOT NULL DEFAULT 'draft',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `campaigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `comparables` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`tenantId` bigint unsigned NOT NULL,
	`dossierId` bigint unsigned NOT NULL,
	`address` varchar(255) NOT NULL,
	`soldPrice` int NOT NULL,
	`soldDate` timestamp NOT NULL,
	`beds` int,
	`baths` int,
	`sqft` int,
	`distanceKm` varchar(20),
	`relevanceScore` int,
	`selected` boolean NOT NULL DEFAULT true,
	`exclusionReason` varchar(255),
	`selectionReasoning` text,
	`adjustments` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `comparables_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `consent_records` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`tenantId` bigint unsigned NOT NULL,
	`contactId` bigint unsigned NOT NULL,
	`channel` enum('email','sms','voice','dm') NOT NULL,
	`basis` enum('express','implied','none') NOT NULL,
	`evidenceText` text,
	`source` varchar(255),
	`purpose` varchar(255),
	`capturedAt` timestamp NOT NULL,
	`expiresAt` timestamp,
	`status` enum('active','expired','withdrawn') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `consent_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`tenantId` bigint unsigned NOT NULL,
	`firstName` varchar(120) NOT NULL,
	`lastName` varchar(120) NOT NULL,
	`preferredName` varchar(160),
	`email` varchar(320),
	`phone` varchar(40),
	`language` varchar(8) NOT NULL DEFAULT 'en',
	`kind` enum('seller','buyer_lead','srp','other') NOT NULL DEFAULT 'seller',
	`leadSource` varchar(120),
	`relationshipToProperty` varchar(120),
	`motivation` text,
	`timing` varchar(120),
	`occupancy` varchar(120),
	`renovations` json,
	`commPrefs` json,
	`mortgageContextNote` text,
	`isSrp` boolean NOT NULL DEFAULT false,
	`onInternalDnc` boolean NOT NULL DEFAULT false,
	`dncRequestedAt` timestamp,
	`onDncl` boolean NOT NULL DEFAULT false,
	`dnclScrubbedAt` timestamp,
	`timezone` varchar(64),
	`province` varchar(2),
	`leadScore` int,
	`leadScoreReasons` json,
	`stage` enum('new_lead','qualified','consultation_booked','dossier_ready','strategy_proposed','approved','live_listing','offer_review','under_contract','closed') NOT NULL DEFAULT 'new_lead',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contacts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`tenantId` bigint unsigned NOT NULL,
	`contactId` bigint unsigned NOT NULL,
	`channel` enum('email','sms','voice','dm') NOT NULL,
	`status` enum('open','needs_review','escalated','closed') NOT NULL DEFAULT 'open',
	`assignedTo` bigint unsigned,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `conversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `dossiers` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`tenantId` bigint unsigned NOT NULL,
	`propertyId` bigint unsigned NOT NULL,
	`profile` json,
	`timeline` json,
	`marketContext` json,
	`contradictions` json,
	`missingInfo` json,
	`agentQuestions` json,
	`status` enum('draft','ready','stale') NOT NULL DEFAULT 'draft',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `dossiers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `evidence` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`tenantId` bigint unsigned NOT NULL,
	`subjectType` varchar(60) NOT NULL,
	`subjectId` bigint unsigned NOT NULL,
	`kind` enum('verified','third_party','estimate','generated','assumption') NOT NULL,
	`statement` text NOT NULL,
	`sourceName` varchar(255),
	`sourceRef` varchar(255),
	`pageRef` varchar(80),
	`freshness` timestamp,
	`confidence` int,
	`lineage` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `evidence_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `integrations` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`kind` varchar(60) NOT NULL,
	`status` enum('mock','sandbox','connected','degraded','not_connected') NOT NULL,
	`truthfulNote` text NOT NULL,
	`config` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `integrations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`userId` bigint unsigned NOT NULL,
	`tenantId` bigint unsigned NOT NULL,
	`role` enum('solo_registrant','team_member','brokerage_admin','broker_of_record','marketing_coordinator','transaction_coordinator','privacy_admin','fintrac_officer','seller') NOT NULL,
	`isDefault` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `memberships_id` PRIMARY KEY(`id`),
	CONSTRAINT `memberships_user_tenant` UNIQUE(`userId`,`tenantId`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`tenantId` bigint unsigned NOT NULL,
	`conversationId` bigint unsigned NOT NULL,
	`direction` enum('inbound','outbound') NOT NULL,
	`body` text NOT NULL,
	`groundedEvidenceIds` json,
	`aiDisclosed` boolean NOT NULL DEFAULT false,
	`isAiDraft` boolean NOT NULL DEFAULT false,
	`escalation` json,
	`status` enum('received','draft','sent','blocked') NOT NULL DEFAULT 'received',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `model_calls` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`tenantId` bigint unsigned,
	`provider` varchar(80) NOT NULL,
	`model` varchar(120) NOT NULL,
	`promptVersion` varchar(60) NOT NULL,
	`tokensIn` int NOT NULL DEFAULT 0,
	`tokensOut` int NOT NULL DEFAULT 0,
	`costCents` int NOT NULL DEFAULT 0,
	`sensitivity` varchar(40) NOT NULL DEFAULT 'standard',
	`piiRedacted` boolean NOT NULL DEFAULT false,
	`durationMs` int NOT NULL DEFAULT 0,
	`status` varchar(40) NOT NULL DEFAULT 'ok',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `model_calls_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `offer_comparisons` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`tenantId` bigint unsigned NOT NULL,
	`propertyId` bigint unsigned NOT NULL,
	`offerIds` json NOT NULL,
	`summary` json,
	`generatedBy` varchar(120),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `offer_comparisons_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `offer_terms` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`tenantId` bigint unsigned NOT NULL,
	`offerId` bigint unsigned NOT NULL,
	`field` varchar(80) NOT NULL,
	`value` text,
	`sourcePage` int,
	`sourceSection` varchar(40),
	`confidence` int,
	`flag` varchar(60),
	`flagNote` text,
	`verifiedBy` bigint unsigned,
	`verifiedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `offer_terms_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `offers` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`tenantId` bigint unsigned NOT NULL,
	`propertyId` bigint unsigned NOT NULL,
	`buyerLabel` varchar(255) NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`documentText` text,
	`receivedAt` timestamp NOT NULL,
	`irrevocableUntil` timestamp,
	`extractionConfidence` int,
	`status` enum('received','extracted','under_review','decided') NOT NULL DEFAULT 'received',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `offers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `outbox` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`tenantId` bigint unsigned NOT NULL,
	`idempotencyKey` varchar(160) NOT NULL,
	`action` varchar(120) NOT NULL,
	`payload` json NOT NULL,
	`status` enum('pending','sent','failed','blocked') NOT NULL DEFAULT 'pending',
	`attempts` int NOT NULL DEFAULT 0,
	`policyDecisionId` bigint unsigned,
	`lastError` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`sentAt` timestamp,
	CONSTRAINT `outbox_id` PRIMARY KEY(`id`),
	CONSTRAINT `outbox_tenant_idem` UNIQUE(`tenantId`,`action`,`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `policy_decisions` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`tenantId` bigint unsigned NOT NULL,
	`ruleIds` json NOT NULL,
	`action` varchar(120) NOT NULL,
	`actor` varchar(160) NOT NULL,
	`verdict` enum('allow','block','escalate') NOT NULL,
	`reasons` json NOT NULL,
	`idempotencyKey` varchar(160),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `policy_decisions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `policy_packs` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`jurisdiction` varchar(8) NOT NULL,
	`version` varchar(32) NOT NULL,
	`effectiveDate` timestamp NOT NULL,
	`reviewDate` timestamp,
	`owner` varchar(255) NOT NULL,
	`status` enum('production','fixture_not_production','draft') NOT NULL DEFAULT 'draft',
	`disclaimer` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `policy_packs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `policy_rules` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`tenantId` bigint unsigned,
	`packId` bigint unsigned NOT NULL,
	`ruleId` varchar(40) NOT NULL,
	`sourceName` varchar(255) NOT NULL,
	`sourceUrl` varchar(500) NOT NULL,
	`jurisdiction` varchar(8) NOT NULL,
	`effectiveDate` varchar(20),
	`reviewDate` varchar(20),
	`owner` varchar(255) NOT NULL,
	`requirement` text NOT NULL,
	`control` json NOT NULL,
	`testScenarios` json NOT NULL,
	`escalationPath` varchar(255) NOT NULL,
	`confidence` varchar(20),
	`verifyNote` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `policy_rules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `properties` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`tenantId` bigint unsigned NOT NULL,
	`ownerContactId` bigint unsigned,
	`addressLine1` varchar(255) NOT NULL,
	`addressLine2` varchar(255),
	`city` varchar(120) NOT NULL,
	`province` varchar(2) NOT NULL,
	`postalCode` varchar(12) NOT NULL,
	`propertyType` varchar(80),
	`beds` int,
	`baths` int,
	`sqft` int,
	`lotDescription` varchar(120),
	`yearBuilt` int,
	`ownershipConfirmed` boolean NOT NULL DEFAULT false,
	`externalListingRef` varchar(120),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `properties_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `seller_direction_artifacts` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`tenantId` bigint unsigned NOT NULL,
	`propertyId` bigint unsigned NOT NULL,
	`contactId` bigint unsigned,
	`signedEvidenceText` text NOT NULL,
	`status` enum('pending','verified','revoked') NOT NULL DEFAULT 'pending',
	`verifiedByUserId` bigint unsigned,
	`verifiedAt` timestamp,
	`expiresAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `seller_direction_artifacts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `strategies` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`tenantId` bigint unsigned NOT NULL,
	`propertyId` bigint unsigned NOT NULL,
	`positioning` json,
	`prepWork` json,
	`mediaPlan` json,
	`launchSequence` json,
	`commsPlan` json,
	`showingStrategy` json,
	`timeline` json,
	`status` enum('draft','proposed','approved','rejected') NOT NULL DEFAULT 'draft',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `strategies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `suppression_list` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`tenantId` bigint unsigned NOT NULL,
	`contactId` bigint unsigned NOT NULL,
	`channel` enum('email','sms','voice','dm') NOT NULL,
	`reason` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `suppression_list_id` PRIMARY KEY(`id`),
	CONSTRAINT `suppression_contact_channel` UNIQUE(`contactId`,`channel`)
);
--> statement-breakpoint
CREATE TABLE `tenants` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`kind` enum('brokerage','team','solo') NOT NULL DEFAULT 'brokerage',
	`province` varchar(2) NOT NULL,
	`timezone` varchar(64) NOT NULL DEFAULT 'America/Toronto',
	`policyPackVersion` varchar(32),
	`brokeragePolicyVersion` varchar(32) NOT NULL DEFAULT '2.3',
	`autonomyCeiling` varchar(2) NOT NULL DEFAULT 'A2',
	`dnclPosture` enum('unregistered','standard','strict') NOT NULL DEFAULT 'standard',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tenants_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `transaction_tasks` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`tenantId` bigint unsigned NOT NULL,
	`transactionId` bigint unsigned NOT NULL,
	`kind` enum('condition','deposit','document','reminder','lawyer_handoff','closing','fintrac_idv','fintrac_receipt_of_funds','fintrac_third_party','fintrac_pep','fintrac_str','other') NOT NULL DEFAULT 'other',
	`title` varchar(255) NOT NULL,
	`dueAt` timestamp,
	`ownerRole` varchar(60),
	`status` enum('pending','in_progress','done','waived') NOT NULL DEFAULT 'pending',
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `transaction_tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`tenantId` bigint unsigned NOT NULL,
	`propertyId` bigint unsigned NOT NULL,
	`acceptedOfferId` bigint unsigned,
	`sellerName` varchar(255),
	`buyerName` varchar(255),
	`acceptedPrice` int,
	`acceptedAt` timestamp,
	`closingAt` timestamp,
	`status` enum('conditional','firm','lawyer_handoff','closed','collapsed') NOT NULL DEFAULT 'conditional',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`unionId` varchar(255) NOT NULL,
	`name` varchar(255),
	`email` varchar(320),
	`avatar` text,
	`role` enum('user','admin','seller') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	`lastSignInAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_unionId_unique` UNIQUE(`unionId`)
);
--> statement-breakpoint
CREATE TABLE `valuations` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`tenantId` bigint unsigned NOT NULL,
	`dossierId` bigint unsigned NOT NULL,
	`low` int NOT NULL,
	`mid` int NOT NULL,
	`high` int NOT NULL,
	`confidenceInterval` int,
	`assumptions` json,
	`rationale` text,
	`disclaimer` text NOT NULL,
	`modelVersion` varchar(60),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `valuations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workflow_events` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`tenantId` bigint unsigned NOT NULL,
	`workflowId` bigint unsigned NOT NULL,
	`seq` int NOT NULL,
	`type` varchar(80) NOT NULL,
	`payload` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `workflow_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `workflow_events_wf_seq` UNIQUE(`workflowId`,`seq`)
);
--> statement-breakpoint
CREATE TABLE `workflows` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`tenantId` bigint unsigned NOT NULL,
	`kind` varchar(80) NOT NULL,
	`subjectId` bigint unsigned,
	`status` enum('running','waiting','completed','failed') NOT NULL DEFAULT 'running',
	`currentStep` varchar(120),
	`state` json,
	`version` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `workflows_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `approvals` ADD CONSTRAINT `approvals_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `approvals` ADD CONSTRAINT `approvals_policyDecisionId_policy_decisions_id_fk` FOREIGN KEY (`policyDecisionId`) REFERENCES `policy_decisions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `approvals` ADD CONSTRAINT `approvals_requestedByUserId_users_id_fk` FOREIGN KEY (`requestedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `approvals` ADD CONSTRAINT `approvals_decidedBy_users_id_fk` FOREIGN KEY (`decidedBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `audit_log` ADD CONSTRAINT `audit_log_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `audit_log` ADD CONSTRAINT `audit_log_actorId_users_id_fk` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `audit_log` ADD CONSTRAINT `audit_log_policyDecisionId_policy_decisions_id_fk` FOREIGN KEY (`policyDecisionId`) REFERENCES `policy_decisions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `campaign_messages` ADD CONSTRAINT `campaign_messages_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `campaign_messages` ADD CONSTRAINT `campaign_messages_campaignId_campaigns_id_fk` FOREIGN KEY (`campaignId`) REFERENCES `campaigns`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `campaign_messages` ADD CONSTRAINT `campaign_messages_contactId_contacts_id_fk` FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `campaign_messages` ADD CONSTRAINT `campaign_messages_policyDecisionId_policy_decisions_id_fk` FOREIGN KEY (`policyDecisionId`) REFERENCES `policy_decisions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `campaigns` ADD CONSTRAINT `campaigns_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `comparables` ADD CONSTRAINT `comparables_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `comparables` ADD CONSTRAINT `comparables_dossierId_dossiers_id_fk` FOREIGN KEY (`dossierId`) REFERENCES `dossiers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `consent_records` ADD CONSTRAINT `consent_records_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `consent_records` ADD CONSTRAINT `consent_records_contactId_contacts_id_fk` FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contacts` ADD CONSTRAINT `contacts_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `conversations` ADD CONSTRAINT `conversations_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `conversations` ADD CONSTRAINT `conversations_contactId_contacts_id_fk` FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `conversations` ADD CONSTRAINT `conversations_assignedTo_users_id_fk` FOREIGN KEY (`assignedTo`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dossiers` ADD CONSTRAINT `dossiers_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dossiers` ADD CONSTRAINT `dossiers_propertyId_properties_id_fk` FOREIGN KEY (`propertyId`) REFERENCES `properties`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `evidence` ADD CONSTRAINT `evidence_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `memberships` ADD CONSTRAINT `memberships_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `memberships` ADD CONSTRAINT `memberships_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `messages` ADD CONSTRAINT `messages_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `messages` ADD CONSTRAINT `messages_conversationId_conversations_id_fk` FOREIGN KEY (`conversationId`) REFERENCES `conversations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `model_calls` ADD CONSTRAINT `model_calls_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `offer_comparisons` ADD CONSTRAINT `offer_comparisons_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `offer_comparisons` ADD CONSTRAINT `offer_comparisons_propertyId_properties_id_fk` FOREIGN KEY (`propertyId`) REFERENCES `properties`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `offer_terms` ADD CONSTRAINT `offer_terms_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `offer_terms` ADD CONSTRAINT `offer_terms_offerId_offers_id_fk` FOREIGN KEY (`offerId`) REFERENCES `offers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `offer_terms` ADD CONSTRAINT `offer_terms_verifiedBy_users_id_fk` FOREIGN KEY (`verifiedBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `offers` ADD CONSTRAINT `offers_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `offers` ADD CONSTRAINT `offers_propertyId_properties_id_fk` FOREIGN KEY (`propertyId`) REFERENCES `properties`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `outbox` ADD CONSTRAINT `outbox_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `outbox` ADD CONSTRAINT `outbox_policyDecisionId_policy_decisions_id_fk` FOREIGN KEY (`policyDecisionId`) REFERENCES `policy_decisions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `policy_decisions` ADD CONSTRAINT `policy_decisions_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `policy_rules` ADD CONSTRAINT `policy_rules_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `policy_rules` ADD CONSTRAINT `policy_rules_packId_policy_packs_id_fk` FOREIGN KEY (`packId`) REFERENCES `policy_packs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `properties` ADD CONSTRAINT `properties_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `properties` ADD CONSTRAINT `properties_ownerContactId_contacts_id_fk` FOREIGN KEY (`ownerContactId`) REFERENCES `contacts`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `seller_direction_artifacts` ADD CONSTRAINT `seller_direction_artifacts_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `seller_direction_artifacts` ADD CONSTRAINT `seller_direction_artifacts_propertyId_properties_id_fk` FOREIGN KEY (`propertyId`) REFERENCES `properties`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `seller_direction_artifacts` ADD CONSTRAINT `seller_direction_artifacts_contactId_contacts_id_fk` FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `seller_direction_artifacts` ADD CONSTRAINT `seller_direction_artifacts_verifiedByUserId_users_id_fk` FOREIGN KEY (`verifiedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `strategies` ADD CONSTRAINT `strategies_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `strategies` ADD CONSTRAINT `strategies_propertyId_properties_id_fk` FOREIGN KEY (`propertyId`) REFERENCES `properties`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `suppression_list` ADD CONSTRAINT `suppression_list_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `suppression_list` ADD CONSTRAINT `suppression_list_contactId_contacts_id_fk` FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transaction_tasks` ADD CONSTRAINT `transaction_tasks_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transaction_tasks` ADD CONSTRAINT `transaction_tasks_transactionId_transactions_id_fk` FOREIGN KEY (`transactionId`) REFERENCES `transactions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_propertyId_properties_id_fk` FOREIGN KEY (`propertyId`) REFERENCES `properties`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_acceptedOfferId_offers_id_fk` FOREIGN KEY (`acceptedOfferId`) REFERENCES `offers`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `valuations` ADD CONSTRAINT `valuations_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `valuations` ADD CONSTRAINT `valuations_dossierId_dossiers_id_fk` FOREIGN KEY (`dossierId`) REFERENCES `dossiers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workflow_events` ADD CONSTRAINT `workflow_events_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workflow_events` ADD CONSTRAINT `workflow_events_workflowId_workflows_id_fk` FOREIGN KEY (`workflowId`) REFERENCES `workflows`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workflows` ADD CONSTRAINT `workflows_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `approvals_tenant_idx` ON `approvals` (`tenantId`);--> statement-breakpoint
CREATE INDEX `audit_tenant_idx` ON `audit_log` (`tenantId`);--> statement-breakpoint
CREATE INDEX `campaign_messages_campaign_idx` ON `campaign_messages` (`campaignId`);--> statement-breakpoint
CREATE INDEX `campaigns_tenant_idx` ON `campaigns` (`tenantId`);--> statement-breakpoint
CREATE INDEX `comparables_dossier_idx` ON `comparables` (`dossierId`);--> statement-breakpoint
CREATE INDEX `consent_contact_idx` ON `consent_records` (`contactId`);--> statement-breakpoint
CREATE INDEX `consent_tenant_idx` ON `consent_records` (`tenantId`);--> statement-breakpoint
CREATE INDEX `contacts_tenant_idx` ON `contacts` (`tenantId`);--> statement-breakpoint
CREATE INDEX `conversations_tenant_idx` ON `conversations` (`tenantId`);--> statement-breakpoint
CREATE INDEX `dossiers_tenant_idx` ON `dossiers` (`tenantId`);--> statement-breakpoint
CREATE INDEX `evidence_subject_idx` ON `evidence` (`subjectType`,`subjectId`);--> statement-breakpoint
CREATE INDEX `evidence_tenant_idx` ON `evidence` (`tenantId`);--> statement-breakpoint
CREATE INDEX `memberships_tenant_idx` ON `memberships` (`tenantId`);--> statement-breakpoint
CREATE INDEX `messages_conversation_idx` ON `messages` (`conversationId`);--> statement-breakpoint
CREATE INDEX `model_calls_tenant_idx` ON `model_calls` (`tenantId`);--> statement-breakpoint
CREATE INDEX `offer_comparisons_tenant_idx` ON `offer_comparisons` (`tenantId`);--> statement-breakpoint
CREATE INDEX `offer_terms_offer_idx` ON `offer_terms` (`offerId`);--> statement-breakpoint
CREATE INDEX `offers_property_idx` ON `offers` (`propertyId`);--> statement-breakpoint
CREATE INDEX `offers_tenant_idx` ON `offers` (`tenantId`);--> statement-breakpoint
CREATE INDEX `policy_decisions_tenant_idx` ON `policy_decisions` (`tenantId`);--> statement-breakpoint
CREATE INDEX `policy_rules_pack_idx` ON `policy_rules` (`packId`);--> statement-breakpoint
CREATE INDEX `properties_tenant_idx` ON `properties` (`tenantId`);--> statement-breakpoint
CREATE INDEX `seller_direction_tenant_idx` ON `seller_direction_artifacts` (`tenantId`);--> statement-breakpoint
CREATE INDEX `strategies_tenant_idx` ON `strategies` (`tenantId`);--> statement-breakpoint
CREATE INDEX `transaction_tasks_txn_idx` ON `transaction_tasks` (`transactionId`);--> statement-breakpoint
CREATE INDEX `transactions_tenant_idx` ON `transactions` (`tenantId`);--> statement-breakpoint
CREATE INDEX `valuations_dossier_idx` ON `valuations` (`dossierId`);--> statement-breakpoint
CREATE INDEX `workflows_tenant_idx` ON `workflows` (`tenantId`);