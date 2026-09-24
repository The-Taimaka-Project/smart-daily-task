/**
 * Field paths within one raw ODK Central OData submission/repeat record,
 * confirmed against a real exported dataset
 * (smart_round3_example_dataset/*.csv -- CSV export flattens groups with
 * "-", which is translated to "." for the nested-object OData JSON shape
 * these paths are written for).
 */

// -- Root "Submissions" table (household/identification level) --
export const HOUSEHOLD_PATHS = {
  surveyDate: "identification.survey_date",
  teamNumber: "identification.team_number",
  otpName: "identification.otp_name",
  settlementName: "identification.settlement_name",
  hhId: "identification.hh_id",
  absentHh: "identification.absent_hh",
  firstVisit: "identification.first_visit",
  consentGiven: "not_absent_hh.consent_given",
  healthVisit: "not_absent_hh.smart_survey.health_visit",
  healthVisitTime: "not_absent_hh.smart_survey.health_visit_time",
  healthVisitTaimaka: "not_absent_hh.smart_survey.health_visit_taimaka",
  // Household-level "was there a death" / "was there a pregnancy or birth"
  // questions, cross-checked against the preg_birth_list repeat's own
  // outcome (see extract-pregnancy-birth.ts). NOTE: this round's choice
  // list codes death as 1=yes/2=no (confirmed against a real export by
  // cross-tabulating with deathgrp.death_total, which is only ever
  // populated when death=="1") -- NOT 0/1 like the older notebook this was
  // ported from assumed, which was written against a different round's form.
  death: "not_absent_hh.smart_survey.death",
  pregBirth: "not_absent_hh.smart_survey.preg_birth",
  // ODK Central's OData JSON represents a true "geopoint" question as a
  // GeoJSON Point: { type: "Point", coordinates: [lon, lat, alt], properties: { accuracy } }.
  // (Confirmed against a real production submission -- NOT the flat
  // Latitude/Longitude shape ODK's CSV export uses.)
  geopointCoordinates: "geopoint.coordinates",
} as const;

// -- "Submissions.not_absent_hh.smart_survey.members" repeat table (one row per household member) --
const CHILD_GROUP = "member_present_group.child_health_n_nutrition.child_0_59";
const ANTHRO1 = `${CHILD_GROUP}.child_anthropometry_1`;

export const CHILD_PATHS = {
  memberName: "q2_2",
  ageGroupCode: "q2_3", // '1' = present child, 0-59 months
  memberPresent: "member_present",
  sex1: "sex1",
  birthdate: "age_validg.birthdate",
  reportedAgeMonths: "age_validg.age",

  weightKg: `${ANTHRO1}.weight`,
  finalHeightCm: `${ANTHRO1}.final_hl`,
  directionOfMeasure: `${ANTHRO1}.direction_of_measure`,
  muacCm: `${ANTHRO1}.oedema_valid.muac_measurement`,
  muacRaw: `${ANTHRO1}.oedema_valid.muac`,
  cOedema: `${ANTHRO1}.c_oedema`,
  oedemaStatus: `${ANTHRO1}.oedema_status`,
  wfhMalnStatus: `${ANTHRO1}.wfh_maln_status`,
  wfhPos5Warn: `${ANTHRO1}.wfh_pos5_warn`,
  wfhNeg5Warn: `${ANTHRO1}.wfh_neg5_warn`,
  weightExt: `${ANTHRO1}.weight_ext`,
  hlExt: `${ANTHRO1}.hl_ext`,
  muacExt: `${ANTHRO1}.muac_ext`,

  finalMalnStatus: `${CHILD_GROUP}.final_maln_status`,
  cmamEnrollmentTf: `${CHILD_GROUP}.cmam.cmam_enrollment_tf`,
  referralTf: `${CHILD_GROUP}.referral_tf`,
  referralNumber: `${CHILD_GROUP}.referral_number`,
  referralNumber2: `${CHILD_GROUP}.referral_number2`,
  itpReferralTf: `${CHILD_GROUP}.itp_referral_tf`,
  referralItp: `${CHILD_GROUP}.referral_itp`,
  imciEmergencyList: `${CHILD_GROUP}.imci_emergency_list`,
  imciEmergencyListOther: `${CHILD_GROUP}.imci_emergency_list_other`,
} as const;

export const SYSTEM_PATHS = {
  odkId: "__id",
  parentSubmissionId: "__Submissions-id",
} as const;

// -- Full household-member fields, for ALL members (not just present 0-59mo
// children) -- used only for the sample-size-achieved progress metric.
export const MEMBER_PATHS = {
  ageYears: "age_years", // per-member age in years, computed by the form for every member
  join: "join",
} as const;

// -- "Submissions.not_absent_hh.smart_survey.left_list" repeat table --
export const LEFT_LIST_PATHS = {
  memberLeft: "member_left",
  sexLeft: "sex_left",
  ageLeft: "age_left",
} as const;

// -- "Submissions.not_absent_hh.smart_survey.deathgrp.death_list" repeat table --
export const DEATH_LIST_PATHS = {
  memberDeath: "member_death",
  sexDeath: "sex_death",
  ageDied: "age_died",
  causeDeath: "cause_death",
} as const;

/**
 * Best-effort field paths for the separate "outside sample" ODK form
 * (children screened outside the main household sample). Inferred from how
 * smart_functions.py/the notebook access it (same "identification" and
 * "child_anthropometry_1" group names as the main form) -- NOT yet
 * confirmed against a real exported submission the way CHILD_PATHS/
 * HOUSEHOLD_PATHS were. Verify against a live pull once this form is wired
 * up for a real survey config.
 */
export const OUTSIDE_PATHS = {
  surveyDate: "identification.survey_date",
  teamNumber: "identification.team_number",
  otpName: "identification.otp_name",
  settlementName: "identification.settlement_name",
  childName: "q2_2",
  age: "age",
  itpReferralTf: "itp_referral_tf",
  referralItp: "referral_itp",
  imciEmergencyList: "imci_emergency_list",
  imciEmergencyListOther: "imci_emergency_list_other",
  muac: "child_anthropometry_1.muac",
  weight: "child_anthropometry_1.weight",
  finalHl: "child_anthropometry_1.final_hl",
} as const;
