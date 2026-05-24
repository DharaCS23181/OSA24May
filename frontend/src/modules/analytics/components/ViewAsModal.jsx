/**
 * ViewAsModal.jsx
 *
 * Power BI-style "View As" role simulation picker.
 * Shows a checkbox list of all roles for the current dataset.
 * On Apply → calls RLSContext.setActiveRoles() which hits the filter engine
 * and makes filtered data available to every chart in BIWorkspace.
 *
 * Also exports the <RLSActiveBanner> component shown at the top of the
 * workspace while simulation is active (orange strip with Exit button).
 */

import React, { useState, useEffect } from 'react';
import { Eye, X, Check, AlertTriangle, Shield } from 'lucide-react';
import { getRoles } from '../services/rlsService';
import { useRLS } from '../context/RLSContext';
import './ViewAsModal.css';

// ── ViewAsModal ───────────────────────────────────────────────────────────────

export default function ViewAsModal({ fileId, onClose, onOpenManageRoles }) {
  const { activeRoles, setActiveRoles, rlsLoading, rlsError, clearViewAs } = useRLS();

  const [roles, setRoles]             = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set(activeRoles.map((r) => r.id)));
  const [loading, setLoading]         = useState(false);
  const [noneSelected, setNoneSelected] = useState(activeRoles.length === 0);

  // Load available roles for this file
  useEffect(() => {
    if (!fileId) return;
    setLoading(true);
    getRoles(fileId)
      .then((data) => setRoles(data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [fileId]);

  // Keep "None" in sync
  useEffect(() => {
    if (selectedIds.size === 0) setNoneSelected(true);
  }, [selectedIds]);

  const toggleRole = (roleId) => {
    setNoneSelected(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(roleId) ? next.delete(roleId) : next.add(roleId);
      return next;
    });
  };

  const selectNone = () => {
    setNoneSelected(true);
    setSelectedIds(new Set());
  };

  const handleApply = async () => {
    if (noneSelected || selectedIds.size === 0) {
      clearViewAs();
      onClose();
      return;
    }
    const chosen = roles.filter((r) => selectedIds.has(r.id));
    await setActiveRoles(chosen);
    onClose();
  };

  return (
    <div className="vam-overlay" onClick={onClose}>
      <div className="vam-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="vam-header">
          <div className="vam-header-icon">
            <Eye size={17} />
          </div>
          <div className="vam-header-text">
            <h3>View As</h3>
            <p>Simulate how the report looks with a specific role's data access.</p>
          </div>
          <button className="vam-close-btn" onClick={onClose}><X size={17} /></button>
        </div>

        {/* Body */}
        <div className="vam-body">
          <div className="vam-section-label">Role</div>

          {/* None option */}
          <div
            className={`vam-option-none ${noneSelected ? 'selected' : ''}`}
            onClick={selectNone}
            id="vam-none-option"
          >
            <div className="vam-checkbox">
              {noneSelected && <Check size={11} color="#ffffff" strokeWidth={3} />}
            </div>
            <div>
              <div className="vam-option-none-label">None (your own role)</div>
              <div className="vam-option-none-sub">Exit simulation — see full dataset</div>
            </div>
          </div>

          {/* Roles */}
          <div className="vam-roles-list">
            {loading && (
              <div className="vam-no-roles">Loading roles…</div>
            )}
            {!loading && roles.length === 0 && (
              <div className="vam-no-roles">
                No roles defined for this dataset.{' '}
                <a
                  onClick={() => { onClose(); onOpenManageRoles?.(); }}
                  tabIndex={0}
                >
                  Create one
                </a>{' '}
                in Manage Roles.
              </div>
            )}
            {roles.map((role) => {
              const isChecked = selectedIds.has(role.id);
              return (
                <div
                  key={role.id}
                  className={`vam-role-option ${isChecked ? 'checked' : ''}`}
                  onClick={() => toggleRole(role.id)}
                  id={`vam-role-${role.id}`}
                >
                  <div className="vam-checkbox">
                    {isChecked && <Check size={10} color="#fff" strokeWidth={3} />}
                  </div>
                  <div className="vam-role-icon">
                    <Shield size={15} strokeWidth={2.2} />
                  </div>
                  <div className="vam-role-info">
                    <div className="vam-role-name">{role.name}</div>
                    <div className="vam-role-sub">
                      {(role.rules || []).length} filter rule{(role.rules || []).length !== 1 ? 's' : ''} • {role.permission === 'view_edit' ? 'Can View & Edit' : role.permission === 'edit' ? 'Can Edit' : 'Can View'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Info / error */}
          {selectedIds.size > 1 && (
            <div className="vam-info-banner">
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              Simulating multiple roles — rows visible to <strong>any</strong> selected role will be shown (union).
            </div>
          )}
          {rlsError && (
            <div className="vam-error-banner">⚠ {rlsError}</div>
          )}
        </div>

        {/* Footer */}
        <div className="vam-footer">
          <ApplyBtn
            loading={rlsLoading}
            disabled={rlsLoading}
            noneSelected={noneSelected}
            selectedCount={selectedIds.size}
            onClick={handleApply}
          />
          <button className="vam-cancel-btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}


// ── Apply button helper ───────────────────────────────────────────────────────
function ApplyBtn({ loading, disabled, noneSelected, selectedCount, onClick }) {
  const label = noneSelected
    ? 'Exit Simulation'
    : selectedCount === 0
    ? 'Apply'
    : `Apply (${selectedCount} role${selectedCount > 1 ? 's' : ''})`;

  return (
    <button className="vam-apply-btn" disabled={disabled} onClick={onClick} id="vam-apply-btn">
      {loading
        ? <><span className="vam-spinner" /> Applying…</>
        : <><Eye size={14} /> {label}</>
      }
    </button>
  );
}

// ── RLS Active Banner (exported separately, rendered by BIWorkspace) ───────────

export function RLSActiveBanner({ activeRoles, rlsData, onExit, allowExit = true }) {
  if (!activeRoles || activeRoles.length === 0) return null;

  const roleNames = activeRoles.map((r) => {
    const perm = r.permission === 'view_edit' ? 'Can View & Edit' : r.permission === 'edit' ? 'Can Edit' : 'Can View';
    return `${r.name} (${perm})`;
  }).join(', ');
  const filteredPct = rlsData
    ? `${rlsData.filtered_rows.toLocaleString()} / ${rlsData.total_rows.toLocaleString()} rows`
    : null;

  return (
    <div className="rls-active-banner" id="rls-active-banner">
      <Shield size={15} />
      <span>Viewing as:</span>
      <span className="rls-active-banner-roles">{roleNames}</span>
      {filteredPct && (
        <span className="rls-stats-chip">{filteredPct}</span>
      )}
      {!allowExit && (
        <span className="rls-active-banner-shared-hint" title="This session was opened from a published link with row-level security">
          Shared link
        </span>
      )}
      {allowExit && (
        <button type="button" className="rls-active-banner-exit" onClick={onExit} id="rls-exit-btn">
          Exit View As
        </button>
      )}
    </div>
  );
}
