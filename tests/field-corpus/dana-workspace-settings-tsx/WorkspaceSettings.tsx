import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "../i18n";
import { useOrgWorkspace } from "../contexts/OrgWorkspaceContext";
import { usePermissions } from "../contexts/PermissionsContext";
import { Button } from "./Button";
import { Badge } from "./Badge";
import { ConfirmDialog } from "./ConfirmDialog";
import { Plus } from "../lib/icons";
import { Tooltip } from "./Tooltip";
import { webApiClient } from "../web/api-client";
import { TeamDashboard } from "./TeamDashboard";
import type { AgentConfig } from "../lib/types";

interface WorkspaceData {
  id: string;
  organization: string;
  name: string;
  slug: string;
  description?: string;
  created_at: string;
}

interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  results: T[];
}

interface WorkspaceMember {
  id: string;
  user: string;
  user_email: string;
  role_name: string;
}

interface WorkspaceSettingsProps {
  showToast: (text: string, type?: "success" | "error" | "warning") => void;
}

export function WorkspaceSettings({ showToast }: WorkspaceSettingsProps) {
  const { t } = useTranslation();
  const { currentOrg, workspaces: ctxWorkspaces } = useOrgWorkspace();
  const { can, isAdmin } = usePermissions();
  const canManage = can("manage:workspace") || isAdmin;

  const [workspaces, setWorkspaces] = useState<WorkspaceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<WorkspaceData | null>(null);
  const [editingWs, setEditingWs] = useState<WorkspaceData | null>(null);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  // Detail view: when a workspace is selected, render TeamDashboard
  const [selectedWs, setSelectedWs] = useState<WorkspaceData | null>(null);
  // Org-visible agents anchored to the workspace pending deletion (warning surface).
  const [orgAgentsAnchoredHere, setOrgAgentsAnchoredHere] = useState<AgentConfig[]>([]);

  const fetchWorkspaces = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    try {
      const resp = await webApiClient.get<PaginatedResponse<WorkspaceData>>("/api/v1/workspaces");
      setWorkspaces(resp.results ?? []);
    } catch {
      if (ctxWorkspaces.length) {
        setWorkspaces(ctxWorkspaces.map((ws) => ({
          id: ws.id,
          organization: currentOrg.id,
          name: ws.name,
          slug: ws.slug ?? ws.name.toLowerCase().replace(/\s+/g, "-"),
          created_at: "",
        })));
      }
    } finally {
      setLoading(false);
    }
  }, [currentOrg, ctxWorkspaces]);

  // Fetch member counts for each workspace
  const fetchMemberCounts = useCallback(async () => {
    for (const ws of workspaces) {
      try {
        const resp = await webApiClient.get<PaginatedResponse<WorkspaceMember>>(
          `/api/v1/workspaces/${ws.id}/members`,
        );
        setMemberCounts((prev) => ({ ...prev, [ws.id]: (resp.results ?? []).length }));
      } catch {
        // non-fatal
      }
    }
  }, [workspaces]);

  useEffect(() => { fetchWorkspaces(); }, [fetchWorkspaces]);
  useEffect(() => { if (workspaces.length) fetchMemberCounts(); }, [workspaces]); // eslint-disable-line react-hooks/exhaustive-deps

  // When the delete-confirm opens, fetch the list of org-visible agents anchored to this
  // workspace so we can warn the operator that deleting will cascade.
  useEffect(() => {
    if (!confirmDelete) {
      setOrgAgentsAnchoredHere([]);
      return;
    }
    let cancelled = false;
    webApiClient
      .get<PaginatedResponse<AgentConfig>>("/api/v1/agents/?page_size=500")
      .then((resp) => {
        if (cancelled) return;
        const anchored = (resp.results ?? []).filter(
          (a) =>
            a.visibility === "organization" &&
            (a.workspace_ids ?? []).includes(confirmDelete.id),
        );
        setOrgAgentsAnchoredHere(anchored);
      })
      .catch(() => {
        if (cancelled) return;
        setOrgAgentsAnchoredHere([]);
      });
    return () => {
      cancelled = true;
    };
  }, [confirmDelete]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await webApiClient.post("/api/v1/workspaces", {
        name: newName.trim(),
        slug: newSlug.trim() || newName.trim().toLowerCase().replace(/\s+/g, "-"),
        description: newDesc.trim(),
        organization: currentOrg?.id,
      });
      showToast(t("orgSettings.workspaceCreated"), "success");
      setShowCreate(false);
      setNewName("");
      setNewSlug("");
      setNewDesc("");
      fetchWorkspaces();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to create team", "error");
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (ws: WorkspaceData) => {
    setEditingWs(ws);
    setEditName(ws.name);
    setEditSlug(ws.slug);
    setEditDesc(ws.description ?? "");
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWs || !editName.trim()) return;
    setSaving(true);
    try {
      await webApiClient.patch(`/api/v1/workspaces/${editingWs.id}`, {
        name: editName.trim(),
        slug: editSlug.trim() || editName.trim().toLowerCase().replace(/\s+/g, "-"),
        description: editDesc.trim(),
      });
      showToast(t("orgSettings.workspaceUpdated"), "success");
      setEditingWs(null);
      fetchWorkspaces();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to update team", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await webApiClient.delete(`/api/v1/workspaces/${confirmDelete.id}`);
      showToast(t("orgSettings.workspaceDeleted"), "success");
      fetchWorkspaces();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to delete team", "error");
    }
    setConfirmDelete(null);
  };

  // ── Detail view: show TeamDashboard for the selected workspace ──
  if (selectedWs) {
    return (
      <TeamDashboard
        showToast={showToast}
        workspace={selectedWs}
        onBack={() => { setSelectedWs(null); fetchWorkspaces(); fetchMemberCounts(); }}
      />
    );
  }

  // ── List view ──
  if (loading) {
    return <div className="text-sm text-tertiary">{t("common.loading")}</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-md font-medium text-secondary">{t("orgSettings.workspaces")}</h3>
        {canManage && (
          <Button variant="primary" size="md" onClick={() => setShowCreate(true)}>
            <Plus width={14} height={14} strokeWidth={2} />
            {t("orgSettings.newWorkspace")}
          </Button>
        )}
      </div>

      {workspaces.length === 0 ? (
        <p className="text-sm text-tertiary">{canManage ? t("orgSettings.noWorkspaces") : t("orgSettings.noWorkspacesReadOnly")}</p>
      ) : (
        <div className="space-y-2">
          {workspaces.map((ws) => (
            <div
              key={ws.id}
              className="border border-gray-700 rounded-lg overflow-hidden hover:bg-gray-800/30 transition-colors cursor-pointer"
              onClick={() => setSelectedWs(ws)}
            >
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-primary font-medium">{ws.name}</span>
                  <span className="text-sm text-tertiary">{ws.slug}</span>
                  {memberCounts[ws.id] !== undefined && (
                    <Badge variant="default" size="sm">
                      {memberCounts[ws.id]} {memberCounts[ws.id] === 1 ? t("orgSettings.wsMember") : t("orgSettings.wsMembers")}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {canManage && (
                    <>
                      <Tooltip label={t("common.edit")} placement="top">
                        <button
                          onClick={(e) => { e.stopPropagation(); openEdit(ws); }}
                          className="p-1 text-tertiary hover:text-secondary transition-colors rounded hover:bg-gray-700/50"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                            <path d="m15 5 4 4" />
                          </svg>
                        </button>
                      </Tooltip>
                      <Tooltip label={t("common.delete")} placement="top">
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmDelete(ws); }}
                          className="p-1 text-tertiary hover:text-danger transition-colors rounded hover:bg-gray-700/50"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18" />
                            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                          </svg>
                        </button>
                      </Tooltip>
                    </>
                  )}
                  <svg
                    width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor"
                    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                    className="text-tertiary"
                  >
                    <path d="M4 2L8 6L4 10" />
                  </svg>
                </div>
              </div>
              {ws.description && (
                <div className="px-4 pb-2">
                  <p className="text-xs text-tertiary">{ws.description}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create workspace modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 modal-overlay" onClick={() => setShowCreate(false)} />
          <div className="relative bg-[var(--surface-elevated,#1a1a2e)] border border-gray-700 rounded-2xl w-full max-w-md mx-4 shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
              <h2 className="text-lg font-semibold text-primary">{t("orgSettings.newWorkspace")}</h2>
              <button onClick={() => setShowCreate(false)} className="text-tertiary hover:text-secondary transition-colors p-1">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-secondary mb-1">{t("orgSettings.wsName")}</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g., Engineering"
                  className="w-full bg-gray-800 border border-gray-600 rounded-sm px-3 py-2 text-sm text-primary focus:border-accent focus:outline-none"
                  autoFocus
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-secondary mb-1">{t("orgSettings.wsSlug")}</label>
                <input
                  type="text"
                  value={newSlug}
                  onChange={(e) => setNewSlug(e.target.value)}
                  placeholder="e.g., engineering"
                  className="w-full bg-gray-800 border border-gray-600 rounded-sm px-3 py-2 text-sm text-primary focus:border-accent focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-secondary mb-1">{t("orgSettings.wsDescription")}</label>
                <input
                  type="text"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Optional description"
                  className="w-full bg-gray-800 border border-gray-600 rounded-sm px-3 py-2 text-sm text-primary focus:border-accent focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setShowCreate(false)} type="button">
                  {t("common.cancel")}
                </Button>
                <Button variant="primary" size="sm" type="submit" loading={creating}>
                  {t("orgSettings.wsCreate")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit workspace modal */}
      {editingWs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 modal-overlay" onClick={() => setEditingWs(null)} />
          <div className="relative bg-[var(--surface-elevated,#1a1a2e)] border border-gray-700 rounded-2xl w-full max-w-md mx-4 shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
              <h2 className="text-lg font-semibold text-primary">{t("orgSettings.editWorkspace")}</h2>
              <button onClick={() => setEditingWs(null)} className="text-tertiary hover:text-secondary transition-colors p-1">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleUpdate} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-secondary mb-1">{t("orgSettings.wsName")}</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-600 rounded-sm px-3 py-2 text-sm text-primary focus:border-accent focus:outline-none"
                  autoFocus
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-secondary mb-1">{t("orgSettings.wsSlug")}</label>
                <input
                  type="text"
                  value={editSlug}
                  onChange={(e) => setEditSlug(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-600 rounded-sm px-3 py-2 text-sm text-primary focus:border-accent focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-secondary mb-1">{t("orgSettings.wsDescription")}</label>
                <input
                  type="text"
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  placeholder="Optional description"
                  className="w-full bg-gray-800 border border-gray-600 rounded-sm px-3 py-2 text-sm text-primary focus:border-accent focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setEditingWs(null)} type="button">
                  {t("common.cancel")}
                </Button>
                <Button variant="primary" size="sm" type="submit" loading={saving}>
                  {t("common.save")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={t("orgSettings.deleteWorkspace")}
          confirmLabel={t("common.delete")}
          variant="danger"
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
        >
          <p className="text-sm text-secondary">
            {t("orgSettings.deleteWorkspaceConfirm", { name: confirmDelete.name })}
          </p>
          {orgAgentsAnchoredHere.length > 0 && (
            <p className="text-xs text-error-700 dark:text-error-300 mt-3">
              {t("orgSettings.deleteWorkspaceOrgAgentsWarning", {
                count: orgAgentsAnchoredHere.length,
                names: orgAgentsAnchoredHere.slice(0, 3).map((a) => a.name).join(", "),
              })}
            </p>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}
