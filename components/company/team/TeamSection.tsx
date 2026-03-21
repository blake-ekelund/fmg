"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Mail,
  Shield,
  ShieldCheck,
  Crown,
  Trash2,
  X,
  UserPlus,
  TrendingUp,
  Megaphone,
  Briefcase,
} from "lucide-react";
import clsx from "clsx";

import { supabase } from "@/lib/supabaseClient";

/* ─── Types ─── */

export type AccessLevel = "owner" | "admin" | "user" | "sales" | "marketing" | "investor";

type TeamMember = {
  id: string;
  first_name: string;
  email: string;
  access: AccessLevel;
  created_at?: string;
};

const ACCESS_CONFIG: Record<AccessLevel, { label: string; icon: React.ReactNode; color: string; description: string }> = {
  owner: {
    label: "Owner",
    icon: <Crown size={12} />,
    color: "bg-amber-50 text-amber-700 border-amber-200",
    description: "Full access. Can manage team, billing, and all settings.",
  },
  admin: {
    label: "Admin",
    icon: <ShieldCheck size={12} />,
    color: "bg-blue-50 text-blue-700 border-blue-200",
    description: "Can manage team members and most settings.",
  },
  user: {
    label: "User",
    icon: <Shield size={12} />,
    color: "bg-gray-100 text-gray-600 border-gray-300",
    description: "Standard access to all workspace features.",
  },
  sales: {
    label: "Sales",
    icon: <TrendingUp size={12} />,
    color: "bg-green-50 text-green-700 border-green-200",
    description: "Access to customers, sales analysis, and their tasks.",
  },
  marketing: {
    label: "Marketing",
    icon: <Megaphone size={12} />,
    color: "bg-purple-50 text-purple-700 border-purple-200",
    description: "Access to marketing tools and content management.",
  },
  investor: {
    label: "Investor",
    icon: <Briefcase size={12} />,
    color: "bg-cyan-50 text-cyan-700 border-cyan-200",
    description: "Read-only access to investor reports and dashboards.",
  },
};

const ACCESS_LEVELS: AccessLevel[] = ["owner", "admin", "user", "sales", "marketing", "investor"];

/** Roles available when inviting someone (can't invite as owner) */
const INVITE_ROLES: AccessLevel[] = ["user", "admin", "sales", "marketing", "investor"];

/* ─── Main Component ─── */

export default function TeamSection() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentAccess, setCurrentAccess] = useState<AccessLevel>("user");

  const [inviteOpen, setInviteOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TeamMember | null>(null);

  const loadMembers = useCallback(async () => {
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (user) setCurrentUserId(user.id);

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("first_name", { ascending: true });

    if (error) {
      console.error("Failed to load team:", error.message);
      setMembers([]);
    } else {
      const sorted = sortByAccess((data as TeamMember[]) ?? []);
      setMembers(sorted);

      if (user) {
        const me = sorted.find((m) => m.id === user.id);
        if (me) setCurrentAccess(me.access);
      }
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const canManage = currentAccess === "owner" || currentAccess === "admin";

  async function changeAccess(memberId: string, newAccess: AccessLevel) {
    const { error } = await supabase
      .from("profiles")
      .update({ access: newAccess })
      .eq("id", memberId);

    if (error) {
      console.error("Failed to update access:", error.message);
      return;
    }

    setMembers((prev) =>
      sortByAccess(prev.map((m) => (m.id === memberId ? { ...m, access: newAccess } : m)))
    );
    setEditingId(null);
  }

  async function removeMember() {
    if (!deleteTarget) return;
    const { error } = await supabase
      .from("profiles")
      .delete()
      .eq("id", deleteTarget.id);

    if (error) {
      console.error("Failed to remove member:", error.message);
      return;
    }

    setDeleteTarget(null);
    loadMembers();
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Team Members</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {members.length} member{members.length !== 1 ? "s" : ""}
          </p>
        </div>

        {canManage && (
          <button
            onClick={() => setInviteOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 hover:shadow-sm transition"
          >
            <UserPlus size={14} />
            Invite Member
          </button>
        )}
      </div>

      {/* Roles overview */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {ACCESS_LEVELS.map((level) => {
          const cfg = ACCESS_CONFIG[level];
          const count = members.filter((m) => m.access === level).length;
          return (
            <div key={level} className="rounded-xl border border-gray-200 bg-white p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <span className={clsx("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium", cfg.color)}>
                  {cfg.icon}
                  {cfg.label}
                </span>
                <span className="text-xs font-semibold text-gray-900 tabular-nums">{count}</span>
              </div>
              <p className="text-[10px] text-gray-500 leading-relaxed line-clamp-2">{cfg.description}</p>
            </div>
          );
        })}
      </div>

      {/* Members table */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="hidden md:grid grid-cols-[1fr_180px_130px_36px] gap-3 px-4 py-2.5 border-b border-gray-100 bg-gray-50/50">
          <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Member</span>
          <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Email</span>
          <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Role</span>
          <span />
        </div>

        {loading ? (
          <div className="px-4 py-8 text-center text-sm text-gray-400">Loading team…</div>
        ) : members.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-400">No team members found</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {members.map((member) => {
              const cfg = ACCESS_CONFIG[member.access];
              const isMe = member.id === currentUserId;
              const isOwner = member.access === "owner";
              const canEdit = canManage && !isMe && !isOwner;

              return (
                <div
                  key={member.id}
                  className="grid grid-cols-1 md:grid-cols-[1fr_180px_130px_36px] gap-2 md:gap-3 px-4 py-3 items-center group hover:bg-gray-50 transition"
                >
                  {/* Name */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-600 shrink-0">
                      {member.first_name?.[0]?.toUpperCase() ?? "?"}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {member.first_name}
                        {isMe && <span className="ml-1.5 text-[10px] text-gray-400">(you)</span>}
                      </div>
                    </div>
                  </div>

                  {/* Email */}
                  <div className="text-xs text-gray-500 truncate">{member.email}</div>

                  {/* Role */}
                  <div>
                    {editingId === member.id ? (
                      <select
                        value={member.access}
                        onChange={(e) => changeAccess(member.id, e.target.value as AccessLevel)}
                        onBlur={() => setEditingId(null)}
                        autoFocus
                        className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300"
                      >
                        {ACCESS_LEVELS.map((l) => (
                          <option key={l} value={l}>{ACCESS_CONFIG[l].label}</option>
                        ))}
                      </select>
                    ) : (
                      <button
                        onClick={() => canEdit && setEditingId(member.id)}
                        disabled={!canEdit}
                        className={clsx(
                          "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium transition",
                          cfg.color,
                          canEdit && "cursor-pointer hover:shadow-sm"
                        )}
                      >
                        {cfg.icon}
                        {cfg.label}
                      </button>
                    )}
                  </div>

                  {/* Actions */}
                  <div>
                    {canEdit && (
                      <button
                        onClick={() => setDeleteTarget(member)}
                        className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Invite Modal */}
      {inviteOpen && (
        <InviteModal onClose={() => setInviteOpen(false)} onInvited={loadMembers} />
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDeleteTarget(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">Remove team member?</h3>
            <p className="text-xs text-gray-500">
              <span className="font-medium text-gray-700">{deleteTarget.first_name}</span> ({deleteTarget.email}) will lose access to this workspace.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-700 transition">Cancel</button>
              <button onClick={removeMember} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition">Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Invite Modal ─── */

function InviteModal({ onClose, onInvited }: { onClose: () => void; onInvited: () => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [access, setAccess] = useState<AccessLevel>("user");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !name.trim()) return;

    setSending(true);
    setError("");

    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email.trim())
      .single();

    if (existing) {
      setError("This email is already on the team.");
      setSending(false);
      return;
    }

    const { error: insertError } = await supabase
      .from("profiles")
      .insert({
        id: crypto.randomUUID(),
        first_name: name.trim(),
        email: email.trim().toLowerCase(),
        access,
      });

    if (insertError) {
      setError(insertError.message);
      setSending(false);
      return;
    }

    setSending(false);
    setSuccess(true);
    onInvited();
    setTimeout(onClose, 1500);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <UserPlus size={16} className="text-gray-500" />
            <span className="text-sm font-semibold text-gray-900">Invite Team Member</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <X size={18} />
          </button>
        </div>

        {success ? (
          <div className="px-6 py-8 text-center">
            <div className="text-sm font-medium text-green-700">Member added successfully!</div>
          </div>
        ) : (
          <form onSubmit={handleInvite} className="px-6 py-5 space-y-4">
            <div>
              <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">Name</label>
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="First name" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300" />
            </div>

            <div>
              <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">Email</label>
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" className="w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300" />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">Role</label>
              <div className="flex flex-wrap gap-1.5">
                {INVITE_ROLES.map((level) => {
                  const cfg = ACCESS_CONFIG[level];
                  return (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setAccess(level)}
                      className={clsx(
                        "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition",
                        access === level ? cfg.color : "bg-white text-gray-400 border-gray-200 hover:border-gray-300"
                      )}
                    >
                      {cfg.icon}
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
              {access && (
                <p className="text-[10px] text-gray-500 mt-1.5">{ACCESS_CONFIG[access].description}</p>
              )}
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-700 transition">Cancel</button>
              <button type="submit" disabled={sending || !email.trim() || !name.trim()} className="px-5 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition disabled:opacity-40">
                {sending ? "Adding…" : "Add Member"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/* ─── Helpers ─── */

function sortByAccess(members: TeamMember[]): TeamMember[] {
  const order: Record<AccessLevel, number> = { owner: 0, admin: 1, user: 2, sales: 3, marketing: 4, investor: 5 };
  return [...members].sort((a, b) => {
    const diff = (order[a.access] ?? 9) - (order[b.access] ?? 9);
    if (diff !== 0) return diff;
    return (a.first_name ?? "").localeCompare(b.first_name ?? "");
  });
}
