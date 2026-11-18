import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Cloud,
  Database,
  FolderPlus,
  Save,
  Server,
  Shield,
  User,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { apiRequest } from "../services/api";
import { CategoryItem, SystemSettingItem } from "../types";
import { RoleBadge } from "../components/ui/Badges";

export const SettingsPage: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "admin";

  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [savedNotice, setSavedNotice] = useState(false);

  // New Category form (Admin)
  const [catName, setCatName] = useState("");
  const [catSlug, setCatSlug] = useState("");
  const [catDesc, setCatDesc] = useState("");
  const [catSubs, setCatSubs] = useState("");

  const { data: settingsList } = useQuery<SystemSettingItem[]>({
    queryKey: ["system-settings"],
    queryFn: () => apiRequest<SystemSettingItem[]>("/settings"),
  });

  const { data: categories } = useQuery<CategoryItem[]>({
    queryKey: ["ticket-categories"],
    queryFn: () => apiRequest<CategoryItem[]>("/tickets/categories"),
  });

  useEffect(() => {
    if (settingsList) {
      const map: Record<string, string> = {};
      for (const s of settingsList) {
        map[s.key] = s.value;
      }
      setFormValues(map);
    }
  }, [settingsList]);

  const updateSettingsMutation = useMutation({
    mutationFn: () =>
      apiRequest<SystemSettingItem[]>("/settings", {
        method: "PUT",
        body: JSON.stringify({ settings: formValues }),
      }),
    onSuccess: () => {
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 3500);
      queryClient.invalidateQueries({ queryKey: ["system-settings"] });
    },
  });

  const createCategoryMutation = useMutation({
    mutationFn: () =>
      apiRequest<CategoryItem>("/tickets/categories", {
        method: "POST",
        body: JSON.stringify({
          name: catName,
          slug: catSlug || catName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          description: catDesc,
          subcategories: catSubs
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          is_active: true,
        }),
      }),
    onSuccess: () => {
      setCatName("");
      setCatSlug("");
      setCatDesc("");
      setCatSubs("");
      queryClient.invalidateQueries({ queryKey: ["ticket-categories"] });
    },
  });

  if (!user) return null;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Platform Settings & Cloud Readiness
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          View your enterprise profile, active security session, and global ITSM configuration.
        </p>
      </div>

      {savedNotice && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-xs font-semibold text-emerald-800">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>Enterprise configuration saved and recorded in audit trail.</span>
        </div>
      )}

      {/* User Identity Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4">
        <div className="flex items-center gap-2 text-slate-900">
          <User className="w-4 h-4 text-blue-600" />
          <h2 className="text-sm font-bold">Authenticated User Profile</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs pt-2">
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200/70">
            <span className="text-slate-400 uppercase font-bold text-[10px] block">Full Name</span>
            <span className="font-bold text-slate-900 text-sm">{user.full_name}</span>
          </div>
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200/70">
            <span className="text-slate-400 uppercase font-bold text-[10px] block">
              Corporate Email
            </span>
            <span className="font-mono text-slate-800">{user.email}</span>
          </div>
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200/70">
            <span className="text-slate-400 uppercase font-bold text-[10px] block mb-1">
              Access Role
            </span>
            <RoleBadge role={user.role} />
          </div>
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200/70">
            <span className="text-slate-400 uppercase font-bold text-[10px] block">
              Employee ID
            </span>
            <span className="font-mono text-slate-800">{user.employee_id || "EMP-CORP"}</span>
          </div>
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200/70">
            <span className="text-slate-400 uppercase font-bold text-[10px] block">Department</span>
            <span className="font-medium text-slate-800">
              {user.department?.name || "Enterprise IT"}
            </span>
          </div>
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200/70">
            <span className="text-slate-400 uppercase font-bold text-[10px] block">
              Assigned Support Team
            </span>
            <span className="font-medium text-slate-800">
              {user.support_team?.name || "Standard Requester"}
            </span>
          </div>
        </div>
      </div>

      {/* AWS Architecture & Cloud Readiness Panel */}
      <div className="bg-navy-900 text-white rounded-xl p-6 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-blue-400">
            <Cloud className="w-5 h-5" />
            <h2 className="text-sm font-bold uppercase tracking-wider">
              AWS Cloud Deployment & Integration Status
            </h2>
          </div>
          <span className="px-2.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-semibold">
            AWS Ready Architecture
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="p-4 rounded-lg bg-slate-800/80 border border-slate-700 space-y-1">
            <div className="flex items-center gap-2 font-bold text-white">
              <Database className="w-4 h-4 text-blue-400" />
              <span>Amazon RDS (PostgreSQL)</span>
            </div>
            <p className="text-slate-300 text-[11px] leading-relaxed">
              SQLAlchemy 2.0 ORM with Alembic migrations and connection pooling (`pool_pre_ping`) ready for Multi-AZ Amazon RDS PostgreSQL.
            </p>
          </div>
          <div className="p-4 rounded-lg bg-slate-800/80 border border-slate-700 space-y-1">
            <div className="flex items-center gap-2 font-bold text-white">
              <Server className="w-4 h-4 text-emerald-400" />
              <span>Amazon S3 Storage Abstraction</span>
            </div>
            <p className="text-slate-300 text-[11px] leading-relaxed">
              Configurable via <code className="text-blue-300">STORAGE_PROVIDER=s3</code> using Boto3 IAM role credentials and pre-signed download URLs.
            </p>
          </div>
          <div className="p-4 rounded-lg bg-slate-800/80 border border-slate-700 space-y-1">
            <div className="flex items-center gap-2 font-bold text-white">
              <Shield className="w-4 h-4 text-purple-400" />
              <span>AWS Lambda + CloudWatch</span>
            </div>
            <p className="text-slate-300 text-[11px] leading-relaxed">
              Includes <code className="text-blue-300">lambda/file_processor/handler.py</code> for S3 ObjectCreated events and JSON structured CloudWatch logging.
            </p>
          </div>
        </div>
      </div>

      {/* Admin-Only Global System Settings & Ticket Categories */}
      {isAdmin && (
        <>
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Enterprise System Configuration (Admin Only)
                </h2>
                <p className="text-xs text-slate-500">
                  Modify global TicketDesk parameters persisted in the{" "}
                  <code className="font-mono">system_settings</code> table
                </p>
              </div>
              <button
                onClick={() => updateSettingsMutation.mutate()}
                disabled={updateSettingsMutation.isPending}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{updateSettingsMutation.isPending ? "Saving..." : "Save Configuration"}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              {settingsList?.map((item) => (
                <div key={item.key} className="space-y-1 text-xs">
                  <label className="block font-bold text-slate-700 font-mono">{item.key}</label>
                  <input
                    type="text"
                    value={formValues[item.key] ?? item.value}
                    onChange={(e) =>
                      setFormValues((prev) => ({ ...prev, [item.key]: e.target.value }))
                    }
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 focus:bg-white"
                  />
                  {item.description && (
                    <p className="text-[11px] text-slate-400">{item.description}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Admin Category Configuration */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4">
            <div className="flex items-center gap-2">
              <FolderPlus className="w-4 h-4 text-blue-600" />
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Configure Ticket Categories ({categories?.length || 0})
                </h2>
                <p className="text-xs text-slate-500">
                  Add custom IT service categories and subcategories for ticket routing
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {categories?.map((c) => (
                <div
                  key={c.id}
                  className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs"
                >
                  <span className="font-bold text-slate-900">{c.name}</span>
                  <span className="text-slate-400 ml-1.5 font-mono">({c.slug})</span>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {c.subcategories.join(" • ") || "General"}
                  </p>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <input
                type="text"
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                placeholder="Category Name (e.g. Cloud Ops)"
                className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg"
              />
              <input
                type="text"
                value={catDesc}
                onChange={(e) => setCatDesc(e.target.value)}
                placeholder="Description..."
                className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg"
              />
              <input
                type="text"
                value={catSubs}
                onChange={(e) => setCatSubs(e.target.value)}
                placeholder="Subcategories (comma-separated)"
                className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg"
              />
              <button
                type="button"
                onClick={() => createCategoryMutation.mutate()}
                disabled={!catName.trim() || createCategoryMutation.isPending}
                className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-semibold cursor-pointer"
              >
                Add Category
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
