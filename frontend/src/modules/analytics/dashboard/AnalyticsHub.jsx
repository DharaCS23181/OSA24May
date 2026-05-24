import React from 'react';
import { 
  BarChart2, LayoutDashboard, Database, Activity, 
  ExternalLink, Plus, Network, FolderKanban, 
  Clock, Zap, CheckCircle, AlertTriangle, Eye, Shield, GitCommit, PieChart 
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './AnalyticsHub.css';

export default function AnalyticsHub() {
  const navigate = useNavigate();

  const handleOpenStudio = (project) => {
    // Navigate to the BI Workspace frontend directly
    navigate('/analytics/dashboard');
  };

  return (
    <div className="analytics-hub-root">
      {/* HEADER ROW */}
      <div className="ah-header-row">
        <div className="ah-header-left">
          <h1><BarChart2 size={24} /> Analytics Workspace</h1>
          <p>Connected datasets and visualization workspace</p>
        </div>
        <div className="ah-header-right">
          <button className="ah-btn-secondary" onClick={() => handleOpenStudio()}>
            <ExternalLink size={16} /> Open Studio
          </button>
          <button className="ah-btn-primary" onClick={() => navigate('/analytics/dashboard')}>
            <Plus size={16} /> New Dashboard
          </button>
        </div>
      </div>

      {/* KPI SUMMARY CARDS */}
      <div className="ah-kpi-grid">
        <div className="ah-kpi-card">
          <div className="ah-kpi-icon"><Network size={22} /></div>
          <div className="ah-kpi-content">
            <span className="ah-kpi-value">124</span>
            <span className="ah-kpi-label">Connected Datasets</span>
          </div>
        </div>
        <div className="ah-kpi-card">
          <div className="ah-kpi-icon"><LayoutDashboard size={22} /></div>
          <div className="ah-kpi-content">
            <span className="ah-kpi-value">38</span>
            <span className="ah-kpi-label">Dashboards</span>
          </div>
        </div>
        <div className="ah-kpi-card">
          <div className="ah-kpi-icon"><PieChart size={22} /></div>
          <div className="ah-kpi-content">
            <span className="ah-kpi-value">85</span>
            <span className="ah-kpi-label">Active Visualizations</span>
          </div>
        </div>
        <div className="ah-kpi-card">
          <div className="ah-kpi-icon"><FolderKanban size={22} /></div>
          <div className="ah-kpi-content">
            <span className="ah-kpi-value">12</span>
            <span className="ah-kpi-label">Active Projects</span>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="ah-main-layout">
        
        {/* LEFT SIDE — DATASET / PROJECT GRID */}
        <div className="ah-main-content">
          <div>
            <h2 className="ah-section-title">
              <span className="ah-section-title-icon"><Database size={18} /> Managed Data Projects</span>
            </h2>
            <div className="ah-project-grid">
              
              {/* Project Card 1 */}
              <div className="ah-project-card">
                <div className="ah-project-header">
                  <div className="ah-project-title-area">
                    <div className="ah-project-icon"><Activity size={20} /></div>
                    <div>
                      <h3 className="ah-project-name">
                        Sales Intelligence
                        <span className="ah-medallion-badge gold">Gold</span>
                      </h3>
                      <div className="ah-project-meta">
                        <span className="ah-status-dot"></span> Pipeline Healthy
                      </div>
                    </div>
                  </div>
                </div>
                <div className="ah-project-stats">
                  <div className="ah-pstat">
                    <span className="ah-pstat-lbl">Datasets</span>
                    <span className="ah-pstat-val">24</span>
                  </div>
                  <div className="ah-pstat">
                    <span className="ah-pstat-lbl">Tables</span>
                    <span className="ah-pstat-val">156</span>
                  </div>
                </div>
                <div className="ah-project-footer">
                  <div className="ah-freshness">
                    <Clock size={12} /> Synced 2m ago
                  </div>
                  <button className="ah-btn-visualize" onClick={() => handleOpenStudio('sales_intelligence')}>
                    <BarChart2 size={12} /> Visualize
                  </button>
                </div>
              </div>

              {/* Project Card 2 */}
              <div className="ah-project-card">
                <div className="ah-project-header">
                  <div className="ah-project-title-area">
                    <div className="ah-project-icon"><Shield size={20} /></div>
                    <div>
                      <h3 className="ah-project-name">
                        Finance Analytics
                        <span className="ah-medallion-badge silver">Silver</span>
                      </h3>
                      <div className="ah-project-meta">
                        <span className="ah-status-dot"></span> Pipeline Healthy
                      </div>
                    </div>
                  </div>
                </div>
                <div className="ah-project-stats">
                  <div className="ah-pstat">
                    <span className="ah-pstat-lbl">Datasets</span>
                    <span className="ah-pstat-val">8</span>
                  </div>
                  <div className="ah-pstat">
                    <span className="ah-pstat-lbl">Tables</span>
                    <span className="ah-pstat-val">42</span>
                  </div>
                </div>
                <div className="ah-project-footer">
                  <div className="ah-freshness">
                    <Clock size={12} /> Synced 15m ago
                  </div>
                  <button className="ah-btn-visualize" onClick={() => handleOpenStudio('finance_analytics')}>
                    <BarChart2 size={12} /> Visualize
                  </button>
                </div>
              </div>

              {/* Project Card 3 */}
              <div className="ah-project-card">
                <div className="ah-project-header">
                  <div className="ah-project-title-area">
                    <div className="ah-project-icon"><FolderKanban size={20} /></div>
                    <div>
                      <h3 className="ah-project-name">
                        Inventory Warehouse
                        <span className="ah-medallion-badge bronze">Bronze</span>
                      </h3>
                      <div className="ah-project-meta">
                        <span className="ah-status-dot warning"></span> Sync Delayed
                      </div>
                    </div>
                  </div>
                </div>
                <div className="ah-project-stats">
                  <div className="ah-pstat">
                    <span className="ah-pstat-lbl">Datasets</span>
                    <span className="ah-pstat-val">16</span>
                  </div>
                  <div className="ah-pstat">
                    <span className="ah-pstat-lbl">Tables</span>
                    <span className="ah-pstat-val">98</span>
                  </div>
                </div>
                <div className="ah-project-footer">
                  <div className="ah-freshness">
                    <Clock size={12} /> Synced 2h ago
                  </div>
                  <button className="ah-btn-visualize" onClick={() => handleOpenStudio('inventory_warehouse')}>
                    <BarChart2 size={12} /> Visualize
                  </button>
                </div>
              </div>

              {/* Project Card 4 */}
              <div className="ah-project-card">
                <div className="ah-project-header">
                  <div className="ah-project-title-area">
                    <div className="ah-project-icon"><Eye size={20} /></div>
                    <div>
                      <h3 className="ah-project-name">
                        Customer Insights
                        <span className="ah-medallion-badge gold">Gold</span>
                      </h3>
                      <div className="ah-project-meta">
                        <span className="ah-status-dot"></span> Pipeline Healthy
                      </div>
                    </div>
                  </div>
                </div>
                <div className="ah-project-stats">
                  <div className="ah-pstat">
                    <span className="ah-pstat-lbl">Datasets</span>
                    <span className="ah-pstat-val">32</span>
                  </div>
                  <div className="ah-pstat">
                    <span className="ah-pstat-lbl">Tables</span>
                    <span className="ah-pstat-val">210</span>
                  </div>
                </div>
                <div className="ah-project-footer">
                  <div className="ah-freshness">
                    <Clock size={12} /> Synced just now
                  </div>
                  <button className="ah-btn-visualize" onClick={() => handleOpenStudio('customer_insights')}>
                    <BarChart2 size={12} /> Visualize
                  </button>
                </div>
              </div>

            </div>
          </div>

          {/* BOTTOM SECTION - RECENT VISUALIZATIONS */}
          <div style={{ marginTop: '16px' }}>
            <h2 className="ah-section-title">
              <span className="ah-section-title-icon"><LayoutDashboard size={18} /> Recent Dashboards</span>
            </h2>
            <div className="ah-vis-grid">
              
              <div className="ah-vis-card">
                <div className="ah-vis-thumbnail">
                  <BarChart2 />
                </div>
                <div className="ah-vis-info">
                  <h4 className="ah-vis-title">Revenue Analytics</h4>
                  <div className="ah-vis-meta"><Database size={12}/> Sales Intelligence</div>
                  <div className="ah-vis-footer">
                    <div className="ah-owner-badge"><div className="ah-owner-avatar">JS</div> John Smith</div>
                    <span className="ah-vis-meta">2h ago</span>
                  </div>
                </div>
              </div>

              <div className="ah-vis-card">
                <div className="ah-vis-thumbnail">
                  <PieChart />
                </div>
                <div className="ah-vis-info">
                  <h4 className="ah-vis-title">Customer Insights</h4>
                  <div className="ah-vis-meta"><Database size={12}/> Customer Data</div>
                  <div className="ah-vis-footer">
                    <div className="ah-owner-badge"><div className="ah-owner-avatar" style={{background: '#10b981'}}>AM</div> Alice M.</div>
                    <span className="ah-vis-meta">5h ago</span>
                  </div>
                </div>
              </div>

              <div className="ah-vis-card">
                <div className="ah-vis-thumbnail">
                  <Activity />
                </div>
                <div className="ah-vis-info">
                  <h4 className="ah-vis-title">Inventory Trends</h4>
                  <div className="ah-vis-meta"><Database size={12}/> Inventory Warehouse</div>
                  <div className="ah-vis-footer">
                    <div className="ah-owner-badge"><div className="ah-owner-avatar" style={{background: '#f59e0b'}}>RK</div> Rob K.</div>
                    <span className="ah-vis-meta">1d ago</span>
                  </div>
                </div>
              </div>

              <div className="ah-vis-card">
                <div className="ah-vis-thumbnail">
                  <Network />
                </div>
                <div className="ah-vis-info">
                  <h4 className="ah-vis-title">Pipeline Health</h4>
                  <div className="ah-vis-meta"><Database size={12}/> System Telemetry</div>
                  <div className="ah-vis-footer">
                    <div className="ah-owner-badge"><div className="ah-owner-avatar" style={{background: '#8b5cf6'}}>SY</div> System</div>
                    <span className="ah-vis-meta">2d ago</span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* RIGHT SIDE — INTELLIGENCE PANEL */}
        <div className="ah-side-panel">
          
          <div className="ah-panel-card">
            <h3 className="ah-panel-card-title"><Zap size={16} /> Recent Activity</h3>
            <div className="ah-activity-list">
              <div className="ah-activity-item">
                <div className="ah-activity-icon refresh"><CheckCircle size={14} /></div>
                <div className="ah-activity-details">
                  <div className="ah-activity-text"><strong>Sales Intelligence</strong> datasets refreshed</div>
                  <div className="ah-activity-time">2 mins ago</div>
                </div>
              </div>
              <div className="ah-activity-item">
                <div className="ah-activity-icon update"><LayoutDashboard size={14} /></div>
                <div className="ah-activity-details">
                  <div className="ah-activity-text"><strong>John Smith</strong> updated Revenue Analytics</div>
                  <div className="ah-activity-time">2 hours ago</div>
                </div>
              </div>
              <div className="ah-activity-item">
                <div className="ah-activity-icon alert"><AlertTriangle size={14} /></div>
                <div className="ah-activity-details">
                  <div className="ah-activity-text"><strong>Inventory Warehouse</strong> sync delayed</div>
                  <div className="ah-activity-time">5 hours ago</div>
                </div>
              </div>
            </div>
          </div>

          <div className="ah-panel-card">
            <h3 className="ah-panel-card-title"><Activity size={16} /> System Health</h3>
            <div className="ah-health-list">
              <div className="ah-health-item">
                <div className="ah-health-label"><Database size={14} /> Data Warehouse</div>
                <div className="ah-health-val ok">Online</div>
              </div>
              <div className="ah-health-item">
                <div className="ah-health-label"><GitCommit size={14} /> ETL Pipelines</div>
                <div className="ah-health-val ok">99.8% OK</div>
              </div>
              <div className="ah-health-item">
                <div className="ah-health-label"><Clock size={14} /> Sync Latency</div>
                <div className="ah-health-val warn">45ms</div>
              </div>
            </div>
          </div>

          <div className="ah-panel-card">
            <h3 className="ah-panel-card-title"><Shield size={16} /> Quick Actions</h3>
            <div className="ah-qa-list">
              <button className="ah-qa-btn" onClick={() => navigate('/analytics/dashboard')}><Plus size={14} /> Create Dashboard</button>
              <button className="ah-qa-btn" onClick={() => handleOpenStudio()}><ExternalLink size={14} /> Open Analytics Studio</button>
              <button className="ah-qa-btn"><Database size={14} /> Explore Metadata</button>
              <button className="ah-qa-btn"><Network size={14} /> View Data Lineage</button>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
