"use client";

import { useState } from "react";

/** Copies tabular data to the clipboard as tab-separated text, so it pastes
 * cleanly into Excel/Google Sheets as real columns instead of one blob of
 * text. */
export function CopyTableButton({
  headers,
  rows,
}: {
  headers: string[];
  rows: (string | number | boolean | null | undefined)[][];
}) {
  const [copied, setCopied] = useState(false);

  function cell(value: string | number | boolean | null | undefined): string {
    return (value ?? "").toString().replace(/\t/g, " ").replace(/\r?\n/g, " ");
  }

  async function handleCopy() {
    const text = [headers, ...rows].map((row) => row.map(cell).join("\t")).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied by the browser; nothing useful to
      // recover into, so just leave the button showing its normal label.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="rounded border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700"
    >
      {copied ? "Copied!" : "Copy table"}
    </button>
  );
}
