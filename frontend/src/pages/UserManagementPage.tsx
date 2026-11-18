import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Building2,
  Edit3,
  Plus,
  Search,
  Shield,
  UserCheck,
  UserPlus,
  UserX,
  X,
} from "lucide-react";
import { ApiError, apiRequest } from "../services/api";
import {
  DepartmentInfo,
  RoleType,
  SupportTeamInfo,
  UserDetail,
} from "../types";
import { RoleBadge } from "../components/ui/Badges";
import { formatDateTime } from "../utils/format";

interface PaginatedUsers {
  items: UserDetail[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export const UserManagementPage: React.FC = () => {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserDetail | null>(null);
  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Create user form state
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("Welcome@12345");
  const [newEmpId, setNewEmpId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newRole, setNewRole] = useState<RoleType>("employee");
  const [newDeptId, setNewDeptId] = useState<string>("");
  const [newTeamId, setNewTeamId] = useState<string>("");

  // Edit user form state
  const [editName, setEditName] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editRole, setEditRole] = useState<RoleType>("employee");
  const [editDeptId, setEditDeptId] = useState<string>("");
  const [editTeamId, setEditTeamId] = useState<string>("");
  const [editActive, setEditActive] = useState(true);

  // Create support team form state
  const [teamName, setTeamName] = useState("");
  const [teamCode, setTeamCode] = useState("");
  const [teamSpec, setTeamSpec] = useState("");

  const { data: departments } = useQuery<DepartmentInfo[]>({
    queryKey: ["departments"],
    queryFn: () => apiRequest<DepartmentInfo[]>("/users/departments"),
  });

  const { data: supportTeams } = useQuery<SupportTeamInfo[]>({
    queryKey: ["support-teams"],
    queryFn: () => apiRequest<SupportTeamInfo[]>("/users/support-teams"),
  });

  const buildQuery = () => {
    const params = new URLSearchParams();
    params.set("page", "1");
    params.set("page_size", "50");
    if (search.trim()) params.set("search", search.trim());
    if (roleFilter !== "all") params.set("role", roleFilter);
    if (deptFilter !== "all") params.set("department_id", deptFilter);
    return params.toString();
  };

  const { data: usersData, isLoading } = useQuery<PaginatedUsers>({
    queryKey: ["admin-users", search, roleFilter, deptFilter],
    queryFn: () => apiRequest<PaginatedUsers>(`/users?${buildQuery()}`),
  });

  const createUserMutation = useMutation({
    mutationFn: () =>
      apiRequest<UserDetail>("/users", {
        method: "POST",
        body: JSON.stringify({
          email: newEmail,
          full_name: newName,
          password: newPassword,
          employee_id: newEmpId || null,
          job_title: newTitle || null,
          role: newRole,
          department_id: newDeptId ? Number(newDeptId) : null,
          support_team_id: newTeamId ? Number(newTeamId) : null,
          is_active: true,
        }),
      }),
    onSuccess: () => {
      setCreateModalOpen(false);
      setNewEmail("");
      setNewName("");
      setNewEmpId("");
      setNewTitle("");
      setErrorMsg(null);
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (err: unknown) => {
      setErrorMsg(err instanceof ApiError ? err.message : "Failed to create user.");
    },
  });

  const saveEditUserMutation = useMutation({
    mutationFn: async () => {
      if (!editUser) return;
      await apiRequest(`/users/${editUser.id}`, {
        method: "PUT",
        body: JSON.stringify({
          full_name: editName,
          job_title: editTitle || null,
          department_id: editDeptId ? Number(editDeptId) : 0,
          support_team_id: editTeamId ? Number(editTeamId) : 0,
          is_active: editActive,
        }),
      });
      if (editRole !== editUser.role) {
        await apiRequest(`/users/${editUser.id}/role`, {
          method: "PATCH",
          body: JSON.stringify({
            role: editRole,
            support_team_id: editTeamId ? Number(editTeamId) : 0,
          }),
        });
      }
    },
    onSuccess: () => {
      setEditUser(null);
      setErrorMsg(null);
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["support-agents"] });
    },
    onError: (err: unknown) => {
      setErrorMsg(err instanceof ApiError ? err.message : "Failed to update user.");
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: (u: UserDetail) =>
      apiRequest(`/users/${u.id}`, {
        method: "PUT",
        body: JSON.stringify({ is_active: !u.is_active }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (err: unknown) => {
      setErrorMsg(err instanceof ApiError ? err.message : "Cannot change user status.");
    },
  });

  const createTeamMutation = useMutation({
    mutationFn: () =>
      apiRequest("/users/support-teams", {
        method: "POST",
        body: JSON.stringify({
          name: teamName,
          code: teamCode,
          specialization: teamSpec,
        }),
      }),
    onSuccess: () => {
      setTeamModalOpen(false);
      setTeamName("");
      setTeamCode("");
      setTeamSpec("");
      queryClient.invalidateQueries({ queryKey: ["support-teams"] });
    },
    onError: (err: unknown) => {
      setErrorMsg(err instanceof ApiError ? err.message : "Failed to create support team.");
    },
  });

  const openEditModal = (u: UserDetail) => {
    setEditUser(u);
    setEditName(u.full_name);
    setEditTitle(u.job_title || "");
    setEditRole(u.role);
    setEditDeptId(u.department_id ? String(u.department_id) : "");
    setEditTeamId(u.support_team_id ? String(u.support_team_id) : "");
    setEditActive(u.is_active);
    setErrorMsg(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            User, Role & Support Team Administration
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Provision accounts, enforce RBAC permissions, and assign IT Support Teams.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setTeamModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
          >
            <Building2 className="w-4 h-4 text-blue-600" />
            New Support Team
          </button>
          <button
            onClick={() => {
              setErrorMsg(null);
              setCreateModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            Create User Account
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-center justify-between text-xs text-red-700">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="font-bold underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Support Teams Overview Pills */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5">
          Active IT Support Teams ({supportTeams?.length || 0})
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {supportTeams?.map((team) => (
            <div
              key={team.id}
              className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between"
            >
              <div>
                <p className="text-xs font-bold text-slate-900">{team.name}</p>
                <p className="text-[11px] text-slate-500">{team.specialization || "IT Operations"}</p>
              </div>
              <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-mono text-[10px] font-bold border border-blue-200">
                {team.code}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="md:col-span-2 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users by name, corporate email, employee ID, or title..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600 focus:bg-white"
          />
        </div>

        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          aria-label="Filter by role"
          className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg font-medium text-slate-700"
        >
          <option value="all">All Roles</option>
          <option value="admin">Administrators</option>
          <option value="agent">IT Support Agents</option>
          <option value="employee">Employees</option>
        </select>

        <select
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          aria-label="Filter by department"
          className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg font-medium text-slate-700"
        >
          <option value="all">All Departments</option>
          {departments?.map((d) => (
            <option key={d.id} value={String(d.id)}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-3.5 px-5">User / Identity</th>
                <th className="py-3.5 px-4">Role</th>
                <th className="py-3.5 px-4">Department</th>
                <th className="py-3.5 px-4">Support Team</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Last Login</th>
                <th className="py-3.5 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {isLoading ? (
                [...Array(6)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={7} className="py-4 px-5">
                      <div className="h-6 bg-slate-100 rounded" />
                    </td>
                  </tr>
                ))
              ) : (
                usersData?.items.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/80">
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-2.5">
                        <span className="font-bold text-slate-900">{u.full_name}</span>
                        {u.employee_id && (
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-[10px]">
                            {u.employee_id}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 font-mono">{u.email}</p>
                      {u.job_title && (
                        <p className="text-[11px] text-slate-400">{u.job_title}</p>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <RoleBadge role={u.role} />
                    </td>
                    <td className="py-3.5 px-4 text-slate-700 font-medium">
                      {u.department?.name || "—"}
                    </td>
                    <td className="py-3.5 px-4 text-slate-700">
                      {u.support_team ? (
                        <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-medium">
                          {u.support_team.name}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      {u.is_active ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                          <UserCheck className="w-3 h-3" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-50 text-red-700 font-semibold border border-red-200">
                          <UserX className="w-3 h-3" />
                          Deactivated
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500">
                      {formatDateTime(u.last_login_at)}
                    </td>
                    <td className="py-3.5 px-5 text-right space-x-2 whitespace-nowrap">
                      <button
                        onClick={() => openEditModal(u)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold cursor-pointer"
                      >
                        <Edit3 className="w-3 h-3" />
                        Edit / Role
                      </button>
                      <button
                        onClick={() => toggleActiveMutation.mutate(u)}
                        className={`px-2.5 py-1 rounded font-semibold cursor-pointer ${
                          u.is_active
                            ? "text-red-600 hover:bg-red-50"
                            : "text-emerald-600 hover:bg-emerald-50"
                        }`}
                      >
                        {u.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create User Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Provision New Enterprise User</h3>
              <button onClick={() => setCreateModalOpen(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="sm:col-span-2">
                <label className="block font-bold uppercase text-slate-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Jordan Taylor"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-bold uppercase text-slate-700 mb-1">
                  Corporate Email *
                </label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="jordan.taylor@ticketdesk.enterprise"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-bold uppercase text-slate-700 mb-1">
                  Initial Password *
                </label>
                <input
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block font-bold uppercase text-slate-700 mb-1">Employee ID</label>
                <input
                  type="text"
                  value={newEmpId}
                  onChange={(e) => setNewEmpId(e.target.value)}
                  placeholder="EMP-2050"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block font-bold uppercase text-slate-700 mb-1">Role *</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as RoleType)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg"
                >
                  <option value="employee">Employee</option>
                  <option value="agent">IT Support Agent</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>
              <div>
                <label className="block font-bold uppercase text-slate-700 mb-1">Job Title</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Systems Engineer"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-bold uppercase text-slate-700 mb-1">Department</label>
                <select
                  value={newDeptId}
                  onChange={(e) => setNewDeptId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg"
                >
                  <option value="">Select Department...</option>
                  {departments?.map((d) => (
                    <option key={d.id} value={String(d.id)}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-bold uppercase text-slate-700 mb-1">Support Team</label>
                <select
                  value={newTeamId}
                  onChange={(e) => setNewTeamId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg"
                >
                  <option value="">None</option>
                  {supportTeams?.map((t) => (
                    <option key={t.id} value={String(t.id)}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                onClick={() => setCreateModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={() => createUserMutation.mutate()}
                disabled={!newEmail || !newName || newPassword.length < 8 || createUserMutation.isPending}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
              >
                {createUserMutation.isPending ? "Creating..." : "Create Account"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User & Role Modal */}
      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Manage User: {editUser.full_name}
                </h3>
              </div>
              <button onClick={() => setEditUser(null)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="sm:col-span-2">
                <label className="block font-bold uppercase text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-bold uppercase text-slate-700 mb-1">
                  Assigned Role
                </label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as RoleType)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-semibold"
                >
                  <option value="employee">Employee</option>
                  <option value="agent">IT Support Agent</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>
              <div>
                <label className="block font-bold uppercase text-slate-700 mb-1">Job Title</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-bold uppercase text-slate-700 mb-1">Department</label>
                <select
                  value={editDeptId}
                  onChange={(e) => setEditDeptId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg"
                >
                  <option value="">Unassigned</option>
                  {departments?.map((d) => (
                    <option key={d.id} value={String(d.id)}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-bold uppercase text-slate-700 mb-1">Support Team</label>
                <select
                  value={editTeamId}
                  onChange={(e) => setEditTeamId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg"
                >
                  <option value="">None</option>
                  {supportTeams?.map((t) => (
                    <option key={t.id} value={String(t.id)}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2 pt-1">
                <label className="inline-flex items-center gap-2 font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editActive}
                    onChange={(e) => setEditActive(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600"
                  />
                  Account Active (Allow login & ticket assignment)
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                onClick={() => setEditUser(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={() => saveEditUserMutation.mutate()}
                disabled={saveEditUserMutation.isPending}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
              >
                {saveEditUserMutation.isPending ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Support Team Modal */}
      {teamModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Create IT Support Team</h3>
              <button onClick={() => setTeamModalOpen(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold uppercase text-slate-700 mb-1">Team Name *</label>
                <input
                  type="text"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="Cloud Platform Reliability"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-bold uppercase text-slate-700 mb-1">Short Code *</label>
                <input
                  type="text"
                  value={teamCode}
                  onChange={(e) => setTeamCode(e.target.value.toUpperCase())}
                  placeholder="SRE"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block font-bold uppercase text-slate-700 mb-1">
                  Specialization
                </label>
                <input
                  type="text"
                  value={teamSpec}
                  onChange={(e) => setTeamSpec(e.target.value)}
                  placeholder="Kubernetes, Terraform & AWS Infrastructure"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                onClick={() => setTeamModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={() => createTeamMutation.mutate()}
                disabled={!teamName || !teamCode || createTeamMutation.isPending}
                className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Create Team
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
