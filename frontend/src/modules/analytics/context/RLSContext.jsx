/**
 * RLSContext.jsx
 *
 * Provides RLS simulation state across the entire BIWorkspace:
 *   - activeRoles      → currently selected role objects for simulation
 *   - isViewAsActive   → whether "View As" simulation mode is on
 *   - rlsData          → result from the filter-engine (filtered rows, preview, etc.)
 *   - setActiveRoles   → activate simulation with the given roles
 *   - clearViewAs      → exit simulation mode
 *
 * Any component that renders chart data should read `isViewAsActive` and
 * `rlsData` to decide whether to use filtered or full data.
 */

import React, { createContext, useContext, useState, useCallback } from 'react';
import { applyRLS } from '../services/rlsService';

// ── Context ───────────────────────────────────────────────────────────────────

const RLSContext = createContext({
  activeRoles: [],
  isViewAsActive: false,
  rlsData: null,
  rlsLoading: false,
  rlsError: null,
  effectivePermission: 'view_edit',
  isShareLocked: false,
  setActiveRoles: async () => {},
  clearViewAs: () => {},
});

// ── Provider ──────────────────────────────────────────────────────────────────

export function RLSProvider({ children, fileId, shareLocked = false }) {
  const [activeRoles, setActiveRolesState] = useState([]);   // array of role objects { id, name, ... }
  const [isViewAsActive, setIsViewAsActive] = useState(false);
  const [rlsData, setRlsData] = useState(null);              // result from /api/rls/apply
  const [rlsLoading, setRlsLoading] = useState(false);
  const [rlsError, setRlsError] = useState(null);

  // Derive effective permission based on active roles
  const effectivePermission = React.useMemo(() => {
    if (!isViewAsActive || activeRoles.length === 0) return 'view_edit';
    
    // Most permissive wins: view_edit > edit > view
    const hierarchy = ['view_edit', 'edit', 'view'];
    let bestIdx = 2; // default to view
    
    for (const role of activeRoles) {
      const idx = hierarchy.indexOf(role.permission || 'view');
      if (idx >= 0 && idx < bestIdx) {
        bestIdx = idx;
      }
    }
    return hierarchy[bestIdx];
  }, [isViewAsActive, activeRoles]);

  /**
   * Activate simulation mode for the supplied roles.
   * Immediately calls the filter engine and stores the result.
   * @param {Array<{id, name, permission}>} roles
   */
  const setActiveRoles = useCallback(async (roles) => {
    if (!roles || roles.length === 0) {
      clearViewAs();
      return;
    }

    setActiveRolesState(roles);
    setIsViewAsActive(true);
    setRlsLoading(true);
    setRlsError(null);

    try {
      const roleIds = roles.map((r) => r.id);
      const data = await applyRLS(fileId, roleIds, 5000);
      setRlsData(data);
    } catch (err) {
      setRlsError(err.message || 'Failed to apply RLS filter');
      setRlsData(null);
    } finally {
      setRlsLoading(false);
    }
  }, [fileId]);

  /** Exit simulation mode and restore full data access. */
  const clearViewAs = useCallback(() => {
    if (shareLocked) return;
    setActiveRolesState([]);
    setIsViewAsActive(false);
    setRlsData(null);
    setRlsError(null);
  }, [shareLocked]);

  return (
    <RLSContext.Provider
      value={{
        activeRoles,
        isViewAsActive,
        rlsData,
        rlsLoading,
        rlsError,
        effectivePermission,
        isShareLocked: shareLocked,
        setActiveRoles,
        clearViewAs,
        fileId,
      }}
    >
      {children}
    </RLSContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/** Convenience hook. Must be used inside <RLSProvider>. */
export function useRLS() {
  return useContext(RLSContext);
}

export default RLSContext;
