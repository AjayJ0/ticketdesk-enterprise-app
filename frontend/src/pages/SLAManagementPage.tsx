import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, Edit3, Info, Save, ShieldCheck, X } from "lucide-react";
import { apiRequest } from "../services/api";
import { SLAPolicyItem } from "../types";
import { PriorityBadge } from "../components/ui/Badges";
import { formatDateTime } from "../utils/format";

export const SLAManagementPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [editingPolicy, setEditingPolicy] = useState<SLAPolicyItem | null>(null);
  const [respMins, setRespMins] = useState(15);
  const [resMins, setResMins] = useState(240);
  const [bhOnly, setBhOnly] = useState(false);
  const [desc, setDesc] = useState("");
  const [savedBanner, setSavedBanner] = useState(false);

  const { data: policies, isLoading } = useQuery<SLAPolicyItem[]>({
    queryKey: ["sla-policies"],
    queryFn: () => apiRequest<SLAPolicyItem[]>("/sla"),
  });

  const updatePolicyMutation = useMutation({
    mutationFn: () => {
      if (!editingPolicy) throw new Error("No policy selected");
      return apiRequest<SLAPolicyItem>(`/sla/${editingPolicy.id}`, {
        method: "PUT",
        body: JSON.stringify({
          response_target_minutes: Number(respMins),
          resolution_target_minutes: Number(resMins),
          business_hours_only: bhOnly,
          description: desc,
        }),
      });
    },
    onSuccess: () => {
      setEditingPolicy(null);
      setSavedBanner(true);
      setTimeout(() => setSavedBanner(false), 3500);
      queryClient.invalidateQueries({ queryKey: ["sla-policies"] });
    },
  });

  const openEditor = (p: SLAPolicyItem) => {
    setEditingPolicy(p);
    setRespMins(p.response_target_minutes);
    setResMins(p.resolution_target_minutes);
    setBhOnly(p.business_hours_only);
    setDesc(p.description || "");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Service Level Agreement (SLA) Policies
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Configure response and resolution targets by priority tier. Changes are recorded in the enterprise audit log.
        </p>
      </div>

      {savedBanner && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2.5 text-xs font-semibold text-emerald-800">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>SLA policy updated and persisted to PostgreSQL.</span>
        </div>
      )}

      {/* Policies Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {isLoading
          ? [...Array(4)].map((_, i) => (
              <div key={i} className="h-48 bg-white rounded-xl border border-slate-200 animate-pulse" />
            ))
          : policies?.map((p) => (
              <div
                key={p.id}
                className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs flex flex-col justify-between space-y-4"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <PriorityBadge priority={p.priority} />
                      <h3 className="text-sm font-bold text-slate-900">{p.name}</h3>
                    </div>
                    <button
                      onClick={() => openEditor(p)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Configure
                    </button>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{p.description}</p>
                </div>

                <div className="grid grid-cols-2 gap-3 p-3.5 rounded-lg bg-slate-50 border border-slate-200/80 text-xs">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      First Response Target
                    </span>
                    <span className="text-base font-bold text-slate-900 font-mono">
                      {p.response_target_minutes >= 60
                        ? `${(p.response_target_minutes / 60).toFixed(
                            p.response_target_minutes % 60 === 0 ? 0 : 1
                          )}h (${p.response_target_minutes}m)`
                        : `${p.response_target_minutes} mins`}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      Resolution Target
                    </span>
                    <span className="text-base font-bold text-blue-600 font-mono">
                      {(p.resolution_target_minutes / 60).toFixed(
                        p.resolution_target_minutes % 60 === 0 ? 0 : 1
                      )}h ({p.resolution_target_minutes}m)
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                  <span className="inline-flex items-center gap-1 font-medium">
                    <Clock className="w-3.5 h-3.5 text-blue-600" />
                    Schedule:{" "}
                    <strong>
                      {p.business_hours_only ? "Business Hours (Mon-Fri)" : "24x7 Continuous"}
                    </strong>
                  </span>
                  <span>Updated {formatDateTime(p.updated_at)}</span>
                </div>
              </div>
            ))}
      </div>

      {/* Business-Hours & Timezone Assumption Documentation Box */}
      <div className="bg-navy-900 text-white rounded-xl p-6 shadow-2xs space-y-2">
        <div className="flex items-center gap-2 text-blue-400">
          <Info className="w-4 h-4" />
          <h3 className="text-xs font-bold uppercase tracking-wider">
            SLA Evaluation Engine & Timezone Assumptions
          </h3>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          All ticket timestamps (<code className="text-blue-300">sla_started_at</code>,{" "}
          <code className="text-blue-300">first_response_due_at</code>,{" "}
          <code className="text-blue-300">resolution_due_at</code>, and{" "}
          <code className="text-blue-300">resolved_at</code>) are stored in PostgreSQL as{" "}
          <strong>timezone-aware UTC timestamps</strong>. Critical (P1) and High (P2) incidents are
          evaluated on a 24x7 continuous clock, while Medium (P3) and Low (P4) policies record the
          standard business-hours operating assumption (Mon–Fri 08:00–18:00 UTC). Changing a
          ticket's priority dynamically recalculates its SLA deadlines from its creation timestamp.
        </p>
      </div>

      {/* Edit SLA Modal */}
      {editingPolicy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Configure {editingPolicy.name}
                </h3>
              </div>
              <button onClick={() => setEditingPolicy(null)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold uppercase text-slate-700 mb-1">
                  Response Target (Minutes)
                </label>
                <input
                  type="number"
                  min={1}
                  value={respMins}
                  onChange={(e) => setRespMins(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block font-bold uppercase text-slate-700 mb-1">
                  Resolution Target (Minutes)
                </label>
                <input
                  type="number"
                  min={5}
                  value={resMins}
                  onChange={(e) => setResMins(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block font-bold uppercase text-slate-700 mb-1">
                  Policy Description
                </label>
                <textarea
                  rows={3}
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg"
                />
              </div>
              <label className="inline-flex items-center gap-2 font-semibold text-slate-700 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={bhOnly}
                  onChange={(e) => setBhOnly(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600"
                />
                Apply Business Hours Window (Mon-Fri 08:00 - 18:00 UTC)
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                onClick={() => setEditingPolicy(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={() => updatePolicyMutation.mutate()}
                disabled={updatePolicyMutation.isPending}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                Save SLA Policy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
