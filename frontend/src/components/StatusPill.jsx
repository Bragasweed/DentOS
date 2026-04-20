import React from "react";

export function StatusPill({ label, cls = "status-neutral", testid }) {
  return (
    <span data-testid={testid} className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}
