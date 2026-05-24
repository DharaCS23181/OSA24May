import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

// ── Shared: Layout & UI ──────────────────────────────────────────────────────
import DashboardLayout from "./shared/layout/DashboardLayout";
import ToastContainer from "./shared/ui/ToastContainer";
import Dashboard from "./shared/dashboard/Dashboard";

// ── Shared: Context Providers ────────────────────────────────────────────────
import { ThemeProvider } from "./shared/context/ThemeContext";
import { ToastProvider } from "./shared/context/ToastContext";

// ── DW Module: Context Providers ─────────────────────────────────────────────
import { DataProvider } from "./modules/dw/context/DataContext";
import { WorkspaceProvider } from "./modules/dw/context/WorkspaceContext";
import { JobsProvider } from "./modules/dw/context/JobsContext";



// ── ETL Module ────────────────────────────────────────────────────────────────
import ConnectorHub from "./modules/etl/connectors/ConnectorHub";
import PipelineList from "./modules/etl/Pipelines/PipelineList";
import JobMonitor from "./modules/etl/Jobs/JobMonitor";
import PipelineEditor from "./modules/etl/PipelineEditor/PipelineEditor";
import TransformPage from "./modules/etl/Transform/TransformPage";

// ── DW Module: SQL ────────────────────────────────────────────────────────────
import SqlLab from "./modules/dw/sql/SqlLab";
import SavedQueriesPage from "./modules/dw/sql/SavedQueriesPage";
import QueryHistoryPage from "./modules/dw/sql/QueryHistoryPage";

// ── DW Module: Catalog ────────────────────────────────────────────────────────
import Catalog from "./modules/dw/catalog/Catalog";

// ── DW Module: Workspace ──────────────────────────────────────────────────────
import WorkspacePage from "./modules/dw/workspace/WorkspacePage";

// ── DW Module: Jobs & Pipelines ───────────────────────────────────────────────
import JobsList from "./modules/dw/jobs/JobsList";
import CreateJob from "./modules/dw/jobs/CreateJob";
import CreateJobSimple from "./modules/dw/jobs/CreateJobSimple";
import JobDetails from "./modules/dw/jobs/JobDetails";

// ── DW Module: Runs ───────────────────────────────────────────────────────────
import GlobalRunsPage from "./modules/dw/runs/GlobalRunsPage";

// ── Analytics Module ──────────────────────────────────────────────────────────
import AnalyticsHub from "./modules/analytics/dashboard/AnalyticsHub";

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <ToastProvider>
          <DataProvider>
            <WorkspaceProvider>
              <JobsProvider>
                <Routes>

                  <Route path="/" element={<Navigate to="/dashboard" replace />} />

                  {/* ── Shared: Dashboard ─────────────────────────── */}
                  <Route path="/dashboard"
                    element={<DashboardLayout><Dashboard /></DashboardLayout>} />

                  {/* ── ETL Module: /etl/* ────────────────────────── */}
                  <Route path="/etl" element={<Navigate to="/etl/pipelines" replace />} />
                  <Route path="/etl/pipelines"
                    element={<DashboardLayout><PipelineList /></DashboardLayout>} />
                  <Route path="/etl/pipelines/editor"
                    element={<DashboardLayout><PipelineEditor /></DashboardLayout>} />
                  <Route path="/etl/pipelines/editor/:id"
                    element={<DashboardLayout><PipelineEditor /></DashboardLayout>} />
                  <Route path="/etl/logs"
                    element={<DashboardLayout><JobMonitor /></DashboardLayout>} />
                  <Route path="/etl/transform"
                    element={<DashboardLayout><TransformPage /></DashboardLayout>} />
                  <Route path="/etl/connectors"
                    element={<DashboardLayout><ConnectorHub /></DashboardLayout>} />

                  {/* ── DW Module: /dw/* — SQL ────────────────────── */}
                  <Route path="/dw" element={<Navigate to="/dw/workspace" replace />} />
                  <Route path="/dw/sql-editor"
                    element={<DashboardLayout><SqlLab /></DashboardLayout>} />
                  <Route path="/dw/saved-queries"
                    element={<DashboardLayout><SavedQueriesPage /></DashboardLayout>} />
                  <Route path="/dw/query-history"
                    element={<DashboardLayout><QueryHistoryPage /></DashboardLayout>} />

                  {/* ── DW Module: /dw/* — Catalog ───────────────── */}
                  <Route path="/dw/catalog"
                    element={<DashboardLayout><Catalog /></DashboardLayout>} />

                  {/* ── DW Module: /dw/* — Workspace ─────────────── */}
                  <Route path="/dw/workspace"
                    element={<DashboardLayout><WorkspacePage /></DashboardLayout>} />

                  {/* ── DW Module: /dw/* — Jobs & Pipelines ──────── */}
                  <Route path="/dw/jobs"
                    element={<DashboardLayout><JobsList /></DashboardLayout>} />
                  <Route path="/dw/jobs/create"
                    element={<DashboardLayout><CreateJob /></DashboardLayout>} />
                  <Route path="/dw/jobs/create-job"
                    element={<DashboardLayout><CreateJobSimple /></DashboardLayout>} />
                  <Route path="/dw/jobs/:jobId"
                    element={<DashboardLayout><JobDetails /></DashboardLayout>} />

                  {/* ── DW Module: /dw/* — Runs ───────────────────── */}
                  <Route path="/dw/runs"
                    element={<DashboardLayout><GlobalRunsPage /></DashboardLayout>} />

                  {/* ── Analytics Module: /analytics/* ───────────── */}
                  <Route path="/analytics"
                    element={<DashboardLayout><AnalyticsHub /></DashboardLayout>} />

                  {/* ── Catch-all ─────────────────────────────────── */}
                  <Route path="*" element={<Navigate to="/dashboard" replace />} />

                </Routes>
                <ToastContainer />
              </JobsProvider>
            </WorkspaceProvider>
          </DataProvider>
        </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
