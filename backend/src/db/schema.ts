import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// better auth owns user/session/account/verification below. they are modelled
// here because drizzle-kit generates the migrations for the whole schema, but
// the shapes come from better auth's own generator - do not add columns.

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

// ---- application tables

export const optionType = pgEnum("option_type", ["call", "put"]);
export const legAction = pgEnum("leg_action", ["buy", "sell"]);
export const snapshotStatus = pgEnum("snapshot_status", ["pending", "ok", "failed"]);

export const symbol = pgTable("symbol", {
  id: text("id").primaryKey(),
  ticker: text("ticker").notNull().unique(),
  name: text("name"),
  // continuous dividend yield used when pricing this underlying. the IBM chain
  // recovers its own 1% yield through put-call parity, so carrying it per
  // symbol beats assuming zero.
  dividendYield: numeric("dividend_yield").notNull().default("0"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const snapshot = pgTable(
  "snapshot",
  {
    id: text("id").primaryKey(),
    symbolId: text("symbol_id")
      .notNull()
      .references(() => symbol.id, { onDelete: "cascade" }),
    tradeDate: text("trade_date").notNull(),
    underlyingPrice: numeric("underlying_price"),
    // risk-free rate used to solve this snapshot, kept so stored greeks stay
    // reproducible after the assumed rate changes
    rate: numeric("rate").notNull(),
    status: snapshotStatus("status").notNull().default("pending"),
    source: text("source").notNull(),
    contractCount: integer("contract_count").notNull().default(0),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("snapshot_symbol_date_uq").on(t.symbolId, t.tradeDate),
    index("snapshot_symbol_idx").on(t.symbolId),
  ],
);

export const contract = pgTable(
  "contract",
  {
    id: text("id").primaryKey(),
    snapshotId: text("snapshot_id")
      .notNull()
      .references(() => snapshot.id, { onDelete: "cascade" }),
    contractId: text("contract_id").notNull(),
    type: optionType("type").notNull(),
    strike: numeric("strike").notNull(),
    expiration: text("expiration").notNull(),
    bid: numeric("bid"),
    ask: numeric("ask"),
    last: numeric("last"),
    mark: numeric("mark"),
    volume: integer("volume"),
    openInterest: integer("open_interest"),
    vendorIv: numeric("vendor_iv"),
    vendorDelta: numeric("vendor_delta"),
    vendorGamma: numeric("vendor_gamma"),
    vendorTheta: numeric("vendor_theta"),
    vendorVega: numeric("vendor_vega"),
    vendorRho: numeric("vendor_rho"),
    computedIv: numeric("computed_iv"),
    computedDelta: numeric("computed_delta"),
    computedGamma: numeric("computed_gamma"),
    computedTheta: numeric("computed_theta"),
    computedVega: numeric("computed_vega"),
    computedRho: numeric("computed_rho"),
    ivConverged: boolean("iv_converged"),
  },
  (t) => [
    index("contract_snapshot_idx").on(t.snapshotId),
    index("contract_expiry_idx").on(t.snapshotId, t.expiration),
    uniqueIndex("contract_snapshot_contract_uq").on(t.snapshotId, t.contractId),
  ],
);

export const surfaceFit = pgTable("surface_fit", {
  id: text("id").primaryKey(),
  snapshotId: text("snapshot_id")
    .notNull()
    .references(() => snapshot.id, { onDelete: "cascade" })
    .unique(),
  slices: jsonb("slices").notNull(),
  grid: jsonb("grid").notNull(),
  calendarArbFree: boolean("calendar_arb_free").notNull(),
  // expiries dropped for thin quotes, surfaced so the UI can say so rather than
  // silently rendering a shorter term structure
  skippedExpirations: jsonb("skipped_expirations").notNull(),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const strategy = pgTable(
  "strategy",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    symbolId: text("symbol_id").references(() => symbol.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("strategy_user_idx").on(t.userId)],
);

export const strategyLeg = pgTable(
  "strategy_leg",
  {
    id: text("id").primaryKey(),
    strategyId: text("strategy_id")
      .notNull()
      .references(() => strategy.id, { onDelete: "cascade" }),
    action: legAction("action").notNull(),
    type: optionType("type").notNull(),
    strike: numeric("strike").notNull(),
    expiration: text("expiration").notNull(),
    quantity: integer("quantity").notNull().default(1),
    entryPrice: numeric("entry_price"),
  },
  (t) => [index("leg_strategy_idx").on(t.strategyId)],
);
