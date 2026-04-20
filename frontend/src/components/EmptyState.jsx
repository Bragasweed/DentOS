import React from "react";

export default function EmptyState({ icon: Icon, title, description, action, testid }) {
  return (
    <div data-testid={testid} className="text-center py-14 px-6 border border-dashed border-slate-200 rounded-xl bg-white">
      {Icon && (
        <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mx-auto mb-4">
          <Icon size={22} />
        </div>
      )}
      <h3 className="text-base font-semibold text-slate-900" style={{ fontFamily: "Manrope" }}>{title}</h3>
      {description && <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">{description}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
