import { createSurveyConfig } from "@/server/actions/survey-configs";

export default function NewSurveyConfigPage() {
  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-xl font-semibold">New survey config</h1>
      <form action={createSurveyConfig} className="flex flex-col gap-4">
        <Field label="Name" name="name" placeholder="Round 3, Survey Area 1" required />
        <Field
          label="ODK Central server URL"
          name="odkBaseUrl"
          type="url"
          defaultValue="https://taimaka-internal.org:7443"
          required
        />
        <Field label="ODK project ID" name="odkProjectId" type="number" required />
        <Field label="Main form ID" name="mainFormId" placeholder="smart_round3" required />
        <Field label="Revisit form ID (optional)" name="revisitFormId" placeholder="smart_round3_revisit" />
        <Field
          label="Outside-sample form ID (optional)"
          name="outsideSampleFormId"
          placeholder="smart_outside_sample"
        />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Date from" name="dateFrom" type="date" required />
          <Field label="Date to" name="dateTo" type="date" required />
        </div>
        <Field
          label="Expected households per cluster"
          name="expectedHhPerCluster"
          type="number"
          defaultValue="15"
        />
        <Field
          label="Target sample size (optional -- for the progress %)"
          name="targetSampleSize"
          type="number"
          placeholder="2081"
        />
        <label className="flex flex-col gap-1 text-sm">
          Cluster-number CSV (optional, can add later)
          <input
            type="file"
            name="clusterCsv"
            accept=".csv"
            className="rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        <button
          type="submit"
          className="rounded bg-neutral-900 px-3 py-2 text-sm text-white dark:bg-white dark:text-neutral-900"
        >
          Create
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  placeholder,
  defaultValue,
  required,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        defaultValue={defaultValue}
        required={required}
        className="rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
      />
    </label>
  );
}
