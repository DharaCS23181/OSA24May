/**
 * ManageRolesPanel.jsx
 *
 * Full-featured RLS role editor — mirrors the Power BI "Manage roles" experience.
 *
 * Layout:
 *  ┌──────────────────────────────────────────────────────────────────────┐
 *  │  Header                                                              │
 *  ├──────────────────┬───────────────────────────────────────────────────┤
 *  │  Role sidebar    │  Editor pane (role name, description, rule rows)  │
 *  │  (list + add)    │  + Footer (Save / Cancel)                         │
 *  └──────────────────┴───────────────────────────────────────────────────┘
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Lock, Plus, Trash2, X, Shield, Loader } from 'lucide-react';
import {
  getRoles,
  createRole,
  updateRole,
  deleteRole,
  addRule,
  updateRule,
  deleteRule,
  getColumns,
} from '../services/rlsService';
import './ManageRolesPanel.css';

// ── Operators available in the filter builder ────────────────────────────────
const OPERATORS = ['=', '!=', '>', '<', '>=', '<=', 'IN', 'NOT IN', 'CONTAINS', 'STARTS_WITH', 'ENDS_WITH'];

// ── Empty rule template ───────────────────────────────────────────────────────
const newRuleTemplate = (displayOrder = 0) => ({
  _localId: Math.random().toString(36).slice(2),
  id: null,           // null = not yet persisted
  table_name: '',
  column_name: '',
  operator: '=',
  value: '',
  logic_group: 0,
  group_operator: 'AND',
  display_order: displayOrder,
  _error: '',
});

// ── Validate one rule row ─────────────────────────────────────────────────────
function validateRule(r) {
  if (!r.column_name.trim()) return 'Column is required';
  if (!r.value.trim()) return 'Value cannot be empty';
  return '';
}

// ── ManageRolesPanel ─────────────────────────────────────────────────────────

export default function ManageRolesPanel({ fileId, onClose }) {
  // ── State ──────────────────────────────────────────────────────────────────
  const [roles, setRoles] = useState([]);
  const [selectedRoleId, setSelectedRoleId] = useState(null);

  // Editor local state (draft — only pushed to API on Save)
  const [draftName, setDraftName] = useState('');
  const [draftDesc, setDraftDesc] = useState('');
  const [draftPermission, setDraftPermission] = useState('view');
  const [draftRules, setDraftRules] = useState([]);

  const [columns, setColumns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ text: '', type: '' });
  const [deletingId, setDeletingId] = useState(null);

  const nameRef = useRef(null);

  // ── Load roles on mount ────────────────────────────────────────────────────
  useEffect(() => {
    loadRoles();
    if (fileId) loadColumns();
  }, [fileId]);

  const loadRoles = async () => {
    setLoading(true);
    try {
      const data = await getRoles(fileId);
      setRoles(data);
    } catch (e) {
      flash(`Failed to load roles: ${e.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadColumns = async () => {
    try {
      const data = await getColumns(fileId);
      setColumns(data.columns || []);
    } catch {
      /* non-fatal */
    }
  };

  // ── Select a role into the editor ─────────────────────────────────────────
  const selectRole = useCallback((role) => {
    setSelectedRoleId(role.id);
    setDraftName(role.name);
    setDraftDesc(role.description || '');
    setDraftPermission(role.permission || 'view');
    // Deep-clone so editor changes don't mutate the original
    setDraftRules(
      (role.rules || []).map((r) => ({
        ...r,
        _localId: r.id,
        _error: '',
      }))
    );
    setStatusMsg({ text: '', type: '' });
  }, []);

  // ── Add new role ───────────────────────────────────────────────────────────
  const handleAddRole = async () => {
    try {
      const role = await createRole({ name: 'New Role', fileId, description: '', permission: 'view' });
      const updated = [...roles, role];
      setRoles(updated);
      selectRole(role);
      setTimeout(() => nameRef.current?.focus(), 100);
    } catch (e) {
      flash(`Could not create role: ${e.message}`, 'error');
    }
  };

  // ── Delete role ────────────────────────────────────────────────────────────
  const handleDeleteRole = async (role, e) => {
    e.stopPropagation();
    if (!window.confirm(`Delete role "${role.name}"? This cannot be undone.`)) return;
    setDeletingId(role.id);
    try {
      await deleteRole(role.id);
      const updated = roles.filter((r) => r.id !== role.id);
      setRoles(updated);
      if (selectedRoleId === role.id) {
        setSelectedRoleId(null);
        setDraftRules([]);
        setDraftName('');
        setDraftDesc('');
        setDraftPermission('view');
      }
    } catch (e) {
      flash(`Delete failed: ${e.message}`, 'error');
    } finally {
      setDeletingId(null);
    }
  };

  // ── Rule manipulation ──────────────────────────────────────────────────────
  const updateDraftRule = (localId, field, value) => {
    setDraftRules((prev) =>
      prev.map((r) =>
        r._localId === localId ? { ...r, [field]: value, _error: '' } : r
      )
    );
  };

  const addDraftRule = () => {
    setDraftRules((prev) => [
      ...prev,
      newRuleTemplate(prev.length),
    ]);
  };

  const removeDraftRule = (localId) => {
    setDraftRules((prev) => prev.filter((r) => r._localId !== localId));
  };

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!selectedRoleId) return;

    // Validate rules
    let hasError = false;
    const validated = draftRules.map((r) => {
      const err = validateRule(r);
      if (err) hasError = true;
      return { ...r, _error: err };
    });
    if (hasError) {
      setDraftRules(validated);
      flash('Please fix the highlighted errors before saving.', 'error');
      return;
    }

    setSaving(true);
    try {
      // 1. Update role metadata if changed
      const original = roles.find((r) => r.id === selectedRoleId);
      if (original.name !== draftName || original.description !== draftDesc || original.permission !== draftPermission) {
        await updateRole(selectedRoleId, { name: draftName, description: draftDesc, permission: draftPermission });
      }

      // 2. Sync rules: delete removed, update existing, add new
      const originalRuleIds = new Set((original.rules || []).map((r) => r.id));
      const draftRuleIds = new Set(draftRules.filter((r) => r.id).map((r) => r.id));

      // Rules to delete (in original but not in draft)
      const toDelete = [...originalRuleIds].filter((id) => !draftRuleIds.has(id));
      await Promise.all(toDelete.map((id) => deleteRule(id)));

      // Rules to add or update
      await Promise.all(
        draftRules.map(async (r, idx) => {
          const payload = {
            table_name: r.table_name || (columns[0]?.name ? 'main' : ''),
            column_name: r.column_name,
            operator: r.operator,
            value: r.value,
            logic_group: r.logic_group,
            group_operator: r.group_operator,
            display_order: idx,
          };
          if (r.id) {
            return updateRule(r.id, payload);
          } else {
            return addRule(selectedRoleId, payload);
          }
        })
      );

      // 3. Re-fetch this role to get clean server state
      const freshRoles = await getRoles(fileId);
      setRoles(freshRoles);
      const freshRole = freshRoles.find((r) => r.id === selectedRoleId);
      if (freshRole) selectRole(freshRole);

      flash('Role saved successfully ✓', 'success');
    } catch (e) {
      flash(`Save failed: ${e.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const flash = (text, type) => {
    setStatusMsg({ text, type });
    setTimeout(() => setStatusMsg({ text: '', type: '' }), 4000);
  };

  const selectedRole = roles.find((r) => r.id === selectedRoleId);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="mrp-overlay" onClick={onClose}>
      <div className="mrp-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="mrp-header">
          <div className="mrp-header-icon">
            <Lock size={18} />
          </div>
          <div className="mrp-header-text">
            <h2>Manage Roles</h2>
            <p>Define row-level security filters per role. Users only see data permitted by their role.</p>
          </div>
          <button className="mrp-close-btn" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="mrp-body">
          {/* ── Sidebar ── */}
          <div className="mrp-sidebar">
            <div className="mrp-sidebar-header">Roles</div>
            <div className="mrp-roles-list">
              {loading && (
                <div className="mrp-sidebar-empty">Loading…</div>
              )}
              {!loading && roles.length === 0 && (
                <div className="mrp-sidebar-empty">No roles yet</div>
              )}
              {roles.map((role) => (
                <div
                  key={role.id}
                  className={`mrp-role-item ${selectedRoleId === role.id ? 'active' : ''}`}
                  onClick={() => selectRole(role)}
                  title={role.name}
                >
                  <div className="mrp-role-item-icon">
                    <Shield size={15} strokeWidth={2.2} />
                  </div>
                  <span className="mrp-role-name">{role.name}</span>
                  <span className="mrp-role-badge">{(role.rules || []).length}</span>
                  <button
                    className="mrp-role-del-btn"
                    onClick={(e) => handleDeleteRole(role, e)}
                    disabled={deletingId === role.id}
                    title="Delete role"
                  >
                    {deletingId === role.id ? <Loader size={12} /> : <Trash2 size={12} />}
                  </button>
                </div>
              ))}
            </div>
            <button className="mrp-add-role-btn" onClick={handleAddRole}>
              <Plus size={15} />
              New Role
            </button>
          </div>

          {/* ── Editor ── */}
          <div className="mrp-editor">
            {!selectedRole ? (
              <div className="mrp-editor-empty">
                <Shield size={48} />
                <p>Select a role to edit, or create a new one</p>
              </div>
            ) : (
              <>
                <div className="mrp-editor-content">
                  {/* Role meta */}
                  <div className="mrp-field-row">
                    <div className="mrp-field mrp-field-grow">
                      <label>Role Name</label>
                      <input
                        ref={nameRef}
                        id="mrp-role-name-input"
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        placeholder="e.g. West Region Manager"
                      />
                    </div>
                    <div className="mrp-field mrp-field-compact">
                      <label>Permission</label>
                      <select
                        value={draftPermission}
                        onChange={(e) => setDraftPermission(e.target.value)}
                      >
                        <option value="view">Can View</option>
                        <option value="edit">Can Edit</option>
                        <option value="view_edit">Can View & Edit</option>
                      </select>
                    </div>
                  </div>
                  <div className="mrp-field-row mrp-field-row-stack">
                    <div className="mrp-field mrp-field-full">
                      <label>Description</label>
                      <textarea
                        value={draftDesc}
                        onChange={(e) => setDraftDesc(e.target.value)}
                        placeholder="Optional description"
                        rows={3}
                      />
                    </div>
                  </div>

                  {/* Rules section */}
                  <div className="mrp-section-title">
                    <Lock size={11} />
                    Filter Rules
                  </div>

                  <div className="mrp-rules-list">
                    {draftRules.map((rule, idx) => (
                      <div key={rule._localId}>
                        <div className={`mrp-rule-row ${rule._error ? 'error' : ''}`}>
                          {/* Logic connector */}
                          {idx > 0 && (
                            <select
                              className="mrp-rule-select mrp-rule-logic"
                              value={rule.group_operator}
                              onChange={(e) => updateDraftRule(rule._localId, 'group_operator', e.target.value)}
                              title="Connector between rules"
                            >
                              <option value="AND">AND</option>
                              <option value="OR">OR</option>
                            </select>
                          )}
                          {idx === 0 && (
                            <span className="mrp-connector-badge" style={{ visibility: 'hidden' }}>AND</span>
                          )}

                          {/* Column */}
                          <select
                            className="mrp-rule-select mrp-rule-col"
                            value={rule.column_name}
                            onChange={(e) => updateDraftRule(rule._localId, 'column_name', e.target.value)}
                            title="Column to filter on"
                          >
                            <option value="">— Select column —</option>
                            {columns.map((c) => (
                              <option key={c.name} value={c.name}>
                                {c.name}
                              </option>
                            ))}
                          </select>

                          {/* Operator */}
                          <select
                            className="mrp-rule-select mrp-rule-op"
                            value={rule.operator}
                            onChange={(e) => updateDraftRule(rule._localId, 'operator', e.target.value)}
                          >
                            {OPERATORS.map((op) => (
                              <option key={op} value={op}>{op}</option>
                            ))}
                          </select>

                          {/* Value */}
                          <input
                            className="mrp-rule-input mrp-rule-val"
                            value={rule.value}
                            onChange={(e) => updateDraftRule(rule._localId, 'value', e.target.value)}
                            placeholder={
                              rule.operator === 'IN' || rule.operator === 'NOT IN'
                                ? 'val1, val2, …'
                                : 'Value'
                            }
                          />

                          {/* Delete rule */}
                          <button
                            className="mrp-rule-del-btn"
                            onClick={() => removeDraftRule(rule._localId)}
                            title="Remove rule"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        {rule._error && (
                          <div className="mrp-rule-error">⚠ {rule._error}</div>
                        )}
                      </div>
                    ))}
                  </div>

                  <button className="mrp-add-rule-btn" onClick={addDraftRule}>
                    <Plus size={14} />
                    Add condition
                  </button>
                </div>

                {/* Footer */}
                <div className="mrp-editor-footer">
                  <button
                    className="mrp-save-btn"
                    onClick={handleSave}
                    disabled={saving}
                    id="mrp-save-btn"
                  >
                    {saving ? <><span className="mrp-spinner" /> Saving…</> : 'Save Role'}
                  </button>
                  <button className="mrp-cancel-btn" onClick={onClose}>
                    Cancel
                  </button>
                  {statusMsg.text && (
                    <span className={`mrp-status-msg ${statusMsg.type}`}>
                      {statusMsg.text}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
