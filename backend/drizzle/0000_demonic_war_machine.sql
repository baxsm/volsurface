CREATE TYPE "public"."leg_action" AS ENUM('buy', 'sell');--> statement-breakpoint
CREATE TYPE "public"."option_type" AS ENUM('call', 'put');--> statement-breakpoint
CREATE TYPE "public"."snapshot_status" AS ENUM('pending', 'ok', 'failed');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract" (
	"id" text PRIMARY KEY NOT NULL,
	"snapshot_id" text NOT NULL,
	"contract_id" text NOT NULL,
	"type" "option_type" NOT NULL,
	"strike" numeric NOT NULL,
	"expiration" text NOT NULL,
	"bid" numeric,
	"ask" numeric,
	"last" numeric,
	"mark" numeric,
	"volume" integer,
	"open_interest" integer,
	"vendor_iv" numeric,
	"vendor_delta" numeric,
	"vendor_gamma" numeric,
	"vendor_theta" numeric,
	"vendor_vega" numeric,
	"vendor_rho" numeric,
	"computed_iv" numeric,
	"computed_delta" numeric,
	"computed_gamma" numeric,
	"computed_theta" numeric,
	"computed_vega" numeric,
	"computed_rho" numeric,
	"iv_converged" boolean
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "snapshot" (
	"id" text PRIMARY KEY NOT NULL,
	"symbol_id" text NOT NULL,
	"trade_date" text NOT NULL,
	"underlying_price" numeric,
	"rate" numeric NOT NULL,
	"status" "snapshot_status" DEFAULT 'pending' NOT NULL,
	"source" text NOT NULL,
	"contract_count" integer DEFAULT 0 NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategy" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"symbol_id" text,
	"kind" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategy_leg" (
	"id" text PRIMARY KEY NOT NULL,
	"strategy_id" text NOT NULL,
	"action" "leg_action" NOT NULL,
	"type" "option_type" NOT NULL,
	"strike" numeric NOT NULL,
	"expiration" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"entry_price" numeric
);
--> statement-breakpoint
CREATE TABLE "surface_fit" (
	"id" text PRIMARY KEY NOT NULL,
	"snapshot_id" text NOT NULL,
	"slices" jsonb NOT NULL,
	"grid" jsonb NOT NULL,
	"calendar_arb_free" boolean NOT NULL,
	"skipped_expirations" jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "surface_fit_snapshot_id_unique" UNIQUE("snapshot_id")
);
--> statement-breakpoint
CREATE TABLE "symbol" (
	"id" text PRIMARY KEY NOT NULL,
	"ticker" text NOT NULL,
	"name" text,
	"dividend_yield" numeric DEFAULT '0' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "symbol_ticker_unique" UNIQUE("ticker")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract" ADD CONSTRAINT "contract_snapshot_id_snapshot_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."snapshot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshot" ADD CONSTRAINT "snapshot_symbol_id_symbol_id_fk" FOREIGN KEY ("symbol_id") REFERENCES "public"."symbol"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy" ADD CONSTRAINT "strategy_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy" ADD CONSTRAINT "strategy_symbol_id_symbol_id_fk" FOREIGN KEY ("symbol_id") REFERENCES "public"."symbol"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_leg" ADD CONSTRAINT "strategy_leg_strategy_id_strategy_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategy"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surface_fit" ADD CONSTRAINT "surface_fit_snapshot_id_snapshot_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."snapshot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "contract_snapshot_idx" ON "contract" USING btree ("snapshot_id");--> statement-breakpoint
CREATE INDEX "contract_expiry_idx" ON "contract" USING btree ("snapshot_id","expiration");--> statement-breakpoint
CREATE UNIQUE INDEX "contract_snapshot_contract_uq" ON "contract" USING btree ("snapshot_id","contract_id");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "snapshot_symbol_date_uq" ON "snapshot" USING btree ("symbol_id","trade_date");--> statement-breakpoint
CREATE INDEX "snapshot_symbol_idx" ON "snapshot" USING btree ("symbol_id");--> statement-breakpoint
CREATE INDEX "strategy_user_idx" ON "strategy" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "leg_strategy_idx" ON "strategy_leg" USING btree ("strategy_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");