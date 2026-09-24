import { addManualExclusion, listManualExclusionsForDisplay, removeManualExclusion } from "@/server/actions/manual-exclusions";

export async function ManualExclusionsSection({ surveyConfigId }: { surveyConfigId: string }) {
  const exclusions = await listManualExclusionsForDisplay(surveyConfigId);

  return (
    <section className="mb-6 rounded border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="mb-1 text-lg font-semibold">Remove a submission</h2>
      <p className="mb-3 text-sm text-neutral-500">
        Drop a household or child submission entirely from this app (courtesy visit, duplicate, bad
        data) by its ODK uuid -- excluding a household also drops its children. This does not touch
        anything in ODK Central; restore it any time.
      </p>

      <form action={addManualExclusion} className="mb-4 flex flex-wrap items-end gap-3 text-sm">
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
          reason (optional)
          <input
            type="text"
            name="reason"
            placeholder="courtesy visit"
            className="w-48 rounded border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        <button
          type="submit"
          className="rounded bg-red-700 px-3 py-2 text-white hover:bg-red-800"
        >
          Remove
        </button>
      </form>

      {exclusions.length === 0 ? (
        <p className="text-sm text-neutral-500">Nothing removed.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-xs">
            <thead>
              <tr>
                {["uuid", "reason", "removed", ""].map((h) => (
                  <th key={h} className="border border-neutral-200 px-2 py-1 text-left dark:border-neutral-800">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {exclusions.map((e) => (
                <tr key={e.id}>
                  <td className="border border-neutral-200 px-2 py-1 font-mono dark:border-neutral-800">{e.targetOdkId}</td>
                  <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">{e.reason}</td>
                  <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">
                    {e.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                  </td>
                  <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">
                    <form action={removeManualExclusion.bind(null, surveyConfigId, e.id)}>
                      <button type="submit" className="text-blue-600 underline dark:text-blue-400">
                        Restore
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
