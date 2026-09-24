import { notFound } from "next/navigation";
import { getSurveyConfig, updateSurveyConfig } from "@/server/actions/survey-configs";
import { NavTabs } from "../nav-tabs";

export default async function EditSurveyConfigPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const config = await getSurveyConfig(id);
  if (!config) notFound();

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold">{config.name}</h1>
        <p className="text-sm text-neutral-500">Edit settings</p>
      </div>

      <NavTabs surveyConfigId={id} active="overview" />

      <div className="mx-auto max-w-lg">
        <form action={updateSurveyConfig.bind(null, id)} className="flex flex-col gap-4">
          <Field label="Name" name="name" defaultValue={config.name} required />
          <Field
            label="ODK Central server URL"
            name="odkBaseUrl"
            type="url"
            defaultValue={config.odkBaseUrl}
            required
          />
          <Field label="ODK project ID" name="odkProjectId" type="number" defaultValue={String(config.odkProjectId)} required />
          <Field label="Main form ID" name="mainFormId" defaultValue={config.mainFormId} required />
          <Field
            label="Revisit form ID (optional)"
            name="revisitFormId"
            placeholder="smart_round3_revisit"
            defaultValue={config.revisitFormId ?? ""}
          />
          <Field
            label="Outside-sample form ID (optional)"
            name="outsideSampleFormId"
            placeholder="smart_outside_sample"
            defaultValue={config.outsideSampleFormId ?? ""}
          />
          <div className="grid grid-cols-2 gap-4">
            <Field label="Date from" name="dateFrom" type="date" defaultValue={config.dateFrom} required />
            <Field label="Date to" name="dateTo" type="date" defaultValue={config.dateTo} required />
          </div>
          <Field
            label="Expected households per cluster"
            name="expectedHhPerCluster"
            type="number"
            defaultValue={String(config.expectedHhPerCluster)}
          />
          <Field
            label="Target sample size (optional -- for the progress %)"
            name="targetSampleSize"
            type="number"
            placeholder="2081"
            defaultValue={config.targetSampleSize !== null ? String(config.targetSampleSize) : ""}
          />
          <label className="flex flex-col gap-1 text-sm">
            Replace cluster-number CSV (optional -- leave blank to keep the current one)
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
            Save
          </button>
        </form>
      </div>
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
