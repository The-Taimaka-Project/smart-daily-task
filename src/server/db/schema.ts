import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  integer,
  boolean,
  date,
  doublePrecision,
  pgEnum,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const pullJobStatus = pgEnum("pull_job_status", [
  "pending",
  "running",
  "success",
  "error",
]);

export const submissionKind = pgEnum("submission_kind", [
  "household",
  "child",
]);

export const reviewStatus = pgEnum("review_status", [
  "open",
  "corrected_in_odk",
  "not_an_error",
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// One ODK Central session per app user. The plaintext ODK password is never
// stored -- only the bearer token ODK Central issues, encrypted at rest.
export const odkSessions = pgTable("odk_sessions", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  odkBaseUrl: text("odk_base_url").notNull(),
  odkEmail: text("odk_email").notNull(),
  encryptedToken: text("encrypted_token").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// A "survey configuration" is one round + survey-area: which ODK forms to
// pull, what date range, and the cluster-number assignment sheet for that
// round. Generalizes the app across rounds instead of hardcoding form ids.
export const surveyConfigs = pgTable("survey_configs", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  odkBaseUrl: text("odk_base_url").notNull(),
  odkProjectId: integer("odk_project_id").notNull(),
  mainFormId: text("main_form_id").notNull(),
  revisitFormId: text("revisit_form_id"),
  outsideSampleFormId: text("outside_sample_form_id"),
  dateFrom: date("date_from").notNull(),
  dateTo: date("date_to").notNull(),
  expectedHhPerCluster: integer("expected_hh_per_cluster").notNull().default(15),
  // Target sample size for the "progress" section (achieved-vs-target %).
  // Survey-specific (e.g. 2081 for round3 sa1) -- left unset skips the %.
  targetSampleSize: integer("target_sample_size"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Parsed rows from the uploaded cluster-number CSV for a survey config,
// joined against pulled households on (surveyDate, teamNumber, settlementName).
export const clusterAssignments = pgTable(
  "cluster_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    surveyConfigId: uuid("survey_config_id")
      .notNull()
      .references(() => surveyConfigs.id, { onDelete: "cascade" }),
    surveyDate: date("survey_date").notNull(),
    teamNumber: integer("team_number").notNull(),
    settlementName: text("settlement_name").notNull(),
    clusterNumber: text("cluster_number").notNull(),
    site: text("site"),
    settlement: text("settlement"),
  },
  (table) => [
    uniqueIndex("cluster_assignments_join_key").on(
      table.surveyConfigId,
      table.surveyDate,
      table.teamNumber,
      table.settlementName,
    ),
  ],
);

export const pullJobs = pgTable("pull_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  surveyConfigId: uuid("survey_config_id")
    .notNull()
    .references(() => surveyConfigs.id, { onDelete: "cascade" }),
  status: pullJobStatus("status").notNull().default("pending"),
  progress: text("progress"), // short human-readable "current step" line, updated as the pull runs
  triggeredBy: uuid("triggered_by").references(() => users.id),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  errorMessage: text("error_message"),
  householdCount: integer("household_count"),
  childCount: integer("child_count"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// One row per household (identification-level) submission, after
// get_survey_mode() majority-vote correction and cluster merge.
export const households = pgTable(
  "households",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    surveyConfigId: uuid("survey_config_id")
      .notNull()
      .references(() => surveyConfigs.id, { onDelete: "cascade" }),
    pullJobId: uuid("pull_job_id")
      .notNull()
      .references(() => pullJobs.id, { onDelete: "cascade" }),
    odkId: text("odk_id").notNull(),
    formId: text("form_id").notNull(),
    surveyDate: date("survey_date").notNull(),
    teamNumber: integer("team_number"),
    otpName: text("otp_name"),
    settlementName: text("settlement_name"),
    clusterNumber: text("cluster_number"),
    hhId: integer("hh_id"),
    deviceId: text("device_id"),
    startTime: timestamp("start_time", { withTimezone: true }),
    endTime: timestamp("end_time", { withTimezone: true }),
    hasGeopoint: boolean("has_geopoint").notNull().default(false),
    consent: text("consent"),
    absentHh: text("absent_hh"),
    firstVisit: text("first_visit"),
    flags: jsonb("flags").$type<string[]>().notNull().default([]),
    raw: jsonb("raw").notNull(),
  },
  (table) => [uniqueIndex("households_odk_id_unique").on(table.surveyConfigId, table.odkId)],
);

// One row per measured, present child (df_final equivalent), after
// plausibility_format() cleaning and z-score/status computation.
export const children = pgTable(
  "children",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    surveyConfigId: uuid("survey_config_id")
      .notNull()
      .references(() => surveyConfigs.id, { onDelete: "cascade" }),
    pullJobId: uuid("pull_job_id")
      .notNull()
      .references(() => pullJobs.id, { onDelete: "cascade" }),
    householdOdkId: text("household_odk_id").notNull(),
    odkChildKey: text("odk_child_key").notNull(),
    childId: integer("child_id"),
    surveyDate: date("survey_date").notNull(),
    teamNumber: integer("team_number"),
    clusterNumber: text("cluster_number"),
    hhId: integer("hh_id"),
    sex: text("sex"),
    birthdate: date("birthdate"),
    ageMonths: doublePrecision("age_months"),
    weightKg: doublePrecision("weight_kg"),
    heightCm: doublePrecision("height_cm"),
    hlYn: text("hl_yn"),
    muacMm: doublePrecision("muac_mm"),
    oedema: text("oedema"),
    cmamEnrollment: text("cmam_enrollment"),
    whz: doublePrecision("whz"),
    waz: doublePrecision("waz"),
    haz: doublePrecision("haz"),
    malnStatus: text("maln_status"),
    droppedAsImplausible: boolean("dropped_as_implausible").notNull().default(false),
    flags: jsonb("flags").$type<string[]>().notNull().default([]),
    raw: jsonb("raw").notNull(),
  },
  (table) => [uniqueIndex("children_odk_key_unique").on(table.surveyConfigId, table.odkChildKey)],
);

// One row per household member -- ALL members (not just present 0-59mo
// children, unlike `children` above), tagged with which source repeat it
// came from. Used only to compute the "sample size achieved" progress
// metric (mirrors `process_mortality_members` in smart_functions.py), not
// for mortality rates/demographics (out of scope for this app).
export const householdMemberSource = pgEnum("household_member_source", [
  "current",
  "left",
  "death",
]);

export const householdMembers = pgTable(
  "household_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    surveyConfigId: uuid("survey_config_id")
      .notNull()
      .references(() => surveyConfigs.id, { onDelete: "cascade" }),
    pullJobId: uuid("pull_job_id")
      .notNull()
      .references(() => pullJobs.id, { onDelete: "cascade" }),
    householdOdkId: text("household_odk_id").notNull(),
    memberOdkKey: text("member_odk_key").notNull(),
    source: householdMemberSource("source").notNull(),
    sex: text("sex"),
    ageYears: doublePrecision("age_years"),
    joinFlag: text("join_flag"),
    bornFlag: text("born_flag"),
    leftFlag: text("left_flag"),
    diedFlag: text("died_flag"),
    dCause: text("d_cause"),
    raw: jsonb("raw").notNull(),
  },
  (table) => [
    uniqueIndex("household_members_key_unique").on(table.surveyConfigId, table.memberOdkKey),
  ],
);

// One row per entry in the main form's "preg_birth_list" repeat group (a
// pregnancy or birth reported for a household), used only for the
// household-level "death" question vs. this repeat's own outcome
// cross-check on the daily page -- not mortality/demographic analysis.
export const pregnancyBirths = pgTable(
  "pregnancy_births",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    surveyConfigId: uuid("survey_config_id")
      .notNull()
      .references(() => surveyConfigs.id, { onDelete: "cascade" }),
    pullJobId: uuid("pull_job_id")
      .notNull()
      .references(() => pullJobs.id, { onDelete: "cascade" }),
    householdOdkId: text("household_odk_id").notNull(),
    odkKey: text("odk_key").notNull(),
    position: integer("position"),
    outcome: text("outcome"),
    raw: jsonb("raw").notNull(),
  },
  (table) => [
    uniqueIndex("pregnancy_births_key_unique").on(table.surveyConfigId, table.odkKey),
  ],
);

// One row per child screened through the separate "outside sample" ODK
// form (children found outside the main household sample, e.g. at an OTP).
// Only used today for the ITP-referral list; full field paths are a
// best-effort inference pending live validation.
export const outsideChildren = pgTable(
  "outside_children",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    surveyConfigId: uuid("survey_config_id")
      .notNull()
      .references(() => surveyConfigs.id, { onDelete: "cascade" }),
    pullJobId: uuid("pull_job_id")
      .notNull()
      .references(() => pullJobs.id, { onDelete: "cascade" }),
    odkId: text("odk_id").notNull(),
    formId: text("form_id").notNull(),
    surveyDate: date("survey_date"),
    teamNumber: integer("team_number"),
    otpName: text("otp_name"),
    settlementName: text("settlement_name"),
    raw: jsonb("raw").notNull(),
  },
  (table) => [uniqueIndex("outside_children_odk_id_unique").on(table.surveyConfigId, table.odkId)],
);

// Colleague-facing "was this ITP referral successfully enrolled?" tracker --
// yes/no + a free-text note, shared via the database so every teammate with
// access to the app sees the same answer (not stored per-browser).
export const itpReferralReviews = pgTable(
  "itp_referral_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    surveyConfigId: uuid("survey_config_id")
      .notNull()
      .references(() => surveyConfigs.id, { onDelete: "cascade" }),
    targetKind: text("target_kind").notNull(), // 'child' | 'outside_child'
    targetOdkId: text("target_odk_id").notNull(),
    enrolled: boolean("enrolled"), // null = not yet answered
    pid: text("pid"), // OTP/CMAM patient ID, looked up and typed in by hand -- not pulled from any system
    note: text("note"),
    updatedBy: uuid("updated_by").references(() => users.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("itp_referral_reviews_target_unique").on(
      table.surveyConfigId,
      table.targetKind,
      table.targetOdkId,
    ),
  ],
);

// A household or child submission excluded entirely from every screen in
// this app (courtesy visit, duplicate, obviously bad data) -- by ODK uuid.
// Does not touch ODK Central; purely filters what this app shows/computes.
// Excluding a household also excludes its children.
export const manualExclusions = pgTable(
  "manual_exclusions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    surveyConfigId: uuid("survey_config_id")
      .notNull()
      .references(() => surveyConfigs.id, { onDelete: "cascade" }),
    targetOdkId: text("target_odk_id").notNull(), // households.odk_id or children.odk_child_key
    reason: text("reason"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("manual_exclusions_target_unique").on(table.surveyConfigId, table.targetOdkId)],
);

// Replaces the "Log of Typos" Google Sheet: for each child flagged by the
// plausibility check's WHZ/HAZ/WAZ statistical outlier test, tracks whether
// a teammate confirmed it's a typo, the corrected values, and whether Dani
// has signed off ("dani-revise").
export const typoLogReviews = pgTable(
  "typo_log_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    surveyConfigId: uuid("survey_config_id")
      .notNull()
      .references(() => surveyConfigs.id, { onDelete: "cascade" }),
    targetOdkId: text("target_odk_id").notNull(), // children.odkChildKey
    isTypo: boolean("is_typo"), // null = not yet answered
    correctBirthdate: text("correct_birthdate"),
    correctAgeMonths: doublePrecision("correct_age_months"),
    correctWeightKg: doublePrecision("correct_weight_kg"),
    correctHeightCm: doublePrecision("correct_height_cm"),
    correctMuacMm: doublePrecision("correct_muac_mm"),
    note: text("note"),
    daniRevise: boolean("dani_revise"), // null = not yet answered
    updatedBy: uuid("updated_by").references(() => users.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("typo_log_reviews_target_unique").on(table.surveyConfigId, table.targetOdkId)],
);

// Manual field-level overrides, applied live everywhere the app reads
// household/child data (daily submission check, referral, typo log,
// plausibility check). Mirrors the notebook's manual-exception pattern:
//   df_id.loc[df_id['__id'] == 'uuid:...', 'team_number'] = '6'
// One row per (survey config, target uuid, field) -- re-submitting the same
// uuid+field just updates the value.
export const manualCorrections = pgTable(
  "manual_corrections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    surveyConfigId: uuid("survey_config_id")
      .notNull()
      .references(() => surveyConfigs.id, { onDelete: "cascade" }),
    targetOdkId: text("target_odk_id").notNull(), // households.odk_id or children.odk_child_key
    fieldName: text("field_name").notNull(),
    correctedValue: text("corrected_value").notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("manual_corrections_target_field_unique").on(
      table.surveyConfigId,
      table.targetOdkId,
      table.fieldName,
    ),
  ],
);

// Generic reviewer-tracked state for a flagged household or child record
// (open/corrected-in-odk/not-an-error). Currently unused by the UI --
// typoLogReviews above is the actual "Log of Typo" feature.
export const reviewNotes = pgTable("review_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  surveyConfigId: uuid("survey_config_id")
    .notNull()
    .references(() => surveyConfigs.id, { onDelete: "cascade" }),
  targetKind: submissionKind("target_kind").notNull(),
  targetOdkId: text("target_odk_id").notNull(),
  flagCode: text("flag_code").notNull(),
  status: reviewStatus("status").notNull().default("open"),
  note: text("note"),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reportSnapshots = pgTable("report_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  surveyConfigId: uuid("survey_config_id")
    .notNull()
    .references(() => surveyConfigs.id, { onDelete: "cascade" }),
  pullJobId: uuid("pull_job_id").references(() => pullJobs.id),
  generatedBy: uuid("generated_by").references(() => users.id),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  stats: jsonb("stats").notNull(),
});
