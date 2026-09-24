import {
  deleteManualCorrection,
  listManualCorrectionsForDisplay,
  setManualCorrection,
} from "@/server/actions/manual-corrections";
import {
  CHILD_CORRECTION_FIELDS,
  CORRECTION_FIELD_LABELS,
  HOUSEHOLD_CORRECTION_FIELDS,
} from "@/server/pipeline/apply-corrections";

export async function ManualCorrectionsSection({ surveyConfigId }: { surveyConfigId: string }) {
  const corrections = await listManualCorrectionsForDisplay(surveyConfigId);

  return (
    <section className="mb-6 rounded border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="mb-1 text-lg font-semibold">Manual corrections</h2>
      <p className="mb-3 text-sm text-neutral-500">
        Fix a specific submission by its ODK uuid (the <code>__id</code>) -- e.g. a household&apos;s team
        number that <code>get_survey_mode</code> didn&apos;t catch. Applies immediately, everywhere in this
        app (daily submission check, referral, log of typo, plausibility check) -- it does not change
        anything in ODK Central itself.
      </p>

      <form action={setManualCorrection} className="mb-4 flex flex-wrap items-end gap-3 text-sm">
        <input type="hidden" name="surveyConfigId" value={surveyConfigId} />
        <label className="flex flex-col gap-1">
          uuid (household or child)
          <input
            type="text"
            name="targetOdkId"
            placeholder="uuid:6d5cd687-6fb3-4495-98e0-d9969233090e"
            required
            className="w-80 rounded border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        <label className="flex flex-col gap-1">
          field
          <select
            name="fieldName"
            required
            className="rounded border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
          >
            <optgroup label="Household">
              {HOUSEHOLD_CORRECTION_FIELDS.map((f) => (
                <option key={f} value={f}>
                  {CORRECTION_FIELD_LABELS[f]}
                </option>
              ))}
            </optgroup>
            <optgroup label="Child">
              {CHILD_CORRECTION_FIELDS.map((f) => (
                <option key={f} value={f}>
                  {CORRECTION_FIELD_LABELS[f]}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          corrected value
          <input
            type="text"
            name="correctedValue"
            placeholder="6"
            required
            className="w-32 rounded border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        <button
          type="submit"
          className="rounded bg-neutral-900 px-3 py-2 text-white dark:bg-white dark:text-neutral-900"
        >
          Save
        </button>
      </form>
      <p className="mb-3 text-xs text-neutral-500">
        Sex: &quot;male&quot; or &quot;female&quot;. Birthdate: YYYY-MM-DD. Team/household ID: whole numbers.
      </p>

      {corrections.length === 0 ? (
        <p className="text-sm text-neutral-500">No manual corrections yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-xs">
            <thead>
              <tr>
                {["uuid", "field", "corrected value", "updated", ""].map((h) => (
                  <th key={h} className="border border-neutral-200 px-2 py-1 text-left dark:border-neutral-800">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {corrections.map((c) => (
                <tr key={c.id}>
                  <td className="border border-neutral-200 px-2 py-1 font-mono dark:border-neutral-800">{c.targetOdkId}</td>
                  <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">
                    {CORRECTION_FIELD_LABELS[c.fieldName as keyof typeof CORRECTION_FIELD_LABELS] ?? c.fieldName}
                  </td>
                  <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">{c.correctedValue}</td>
                  <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">
                    {c.updatedAt.toISOString().slice(0, 16).replace("T", " ")}
                  </td>
                  <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">
                    <form action={deleteManualCorrection.bind(null, surveyConfigId, c.id)}>
                      <button type="submit" className="text-red-600 underline dark:text-red-400">
                        Remove
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
