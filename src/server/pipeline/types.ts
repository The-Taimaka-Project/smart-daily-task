/** Normalized household record -- the TS equivalent of the notebook's `df_id` row. */
export type HouseholdRecord = {
  odkId: string;
  formId: string;
  surveyDate: string; // ISO yyyy-mm-dd
  deviceId: string | null;
  teamNumber: number | null;
  otpName: string | null;
  settlementName: string | null;
  clusterNumber: string | null;
  hhId: number | null;
  startTime: string | null; // ISO datetime
  endTime: string | null;
  hasGeopoint: boolean;
  consent: string | null;
  absentHh: string | null;
  firstVisit: string | null; // "first" | "second" | null
  flags: string[];
  raw: Record<string, unknown>;
};

/** Normalized, present, measured child record -- the TS equivalent of `df_final`. */
export type ChildRecord = {
  odkChildKey: string;
  householdOdkId: string;
  surveyDate: string;
  teamNumber: number | null;
  clusterNumber: string | null;
  hhId: number | null;
  childId: number | null;
  sex: "male" | "female" | null;
  birthdate: string | null;
  ageMonths: number | null;
  weightKg: number | null;
  heightCm: number | null;
  hlYn: "h" | "l" | null;
  muacMm: number | null;
  oedema: "y" | "n" | null;
  cmamEnrollment: "y" | "n" | null;
  whz: number | null;
  waz: number | null;
  haz: number | null;
  malnStatus: string | null;
  droppedAsImplausible: boolean;
  flags: string[];
  raw: Record<string, unknown>;
};

export type ClusterAssignmentRow = {
  surveyDate: string;
  teamNumber: number;
  settlementName: string;
  clusterNumber: string;
  site: string | null;
  settlement: string | null;
};
