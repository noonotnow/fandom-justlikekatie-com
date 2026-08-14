CREATE TABLE "card_events" (
	"id" serial PRIMARY KEY,
	"subject_type" text NOT NULL,
	"card_id" text NOT NULL,
	"batch_key" text,
	"actor" text,
	"vibe" text,
	"event" text NOT NULL,
	"captured_date" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "card_events_card_idx" ON "card_events" ("subject_type","card_id","event");--> statement-breakpoint
CREATE INDEX "card_events_event_created_at_idx" ON "card_events" ("event","created_at");