import React, { useState } from 'react';
import { Filter, BarChart3, Database, ChevronLeft, ChevronRight, Minimize2, Maximize2 } from 'lucide-react';
import BIFiltersPane from './BIFiltersPane';
import BIVisualizationsPane from './BIVisualizationsPane';
import BIFieldsPane from './BIFieldsPane';
import './BIRightPanes.css';

const BIRightPanes = ({ schema, dataset, fileName, selectedVisual, onUpdateVisual, onAddVisual, isCollapsed, onToggleCollapse, measures, activeColumn, onSelectColumn, forcedActiveTab, onActiveTabChange, isFieldsRefreshing = false }) => {
    const [activeTab, setActiveTab] = useState('visualizations'); // 'filters', 'visualizations', 'fields'
    const currentTab = forcedActiveTab || activeTab;

    const tabs = [
        { id: 'filters', icon: <Filter size={18} />, label: 'Filters' },
        { id: 'visualizations', icon: <BarChart3 size={18} />, label: 'Visualizations' },
        { id: 'fields', icon: <Database size={18} />, label: 'Fields' }
    ];

    if (isCollapsed) {
        return (
            <div className="bi-right-panes-collapsed">
                <div className="bi-collapse-toggle" onClick={onToggleCollapse} title="Expand">
                    <Maximize2 size={16} />
                </div>
                <div className="bi-collapsed-tabs">
                    {tabs.map(tab => (
                        <div
                            key={tab.id}
                            className={`bi-collapsed-tab ${currentTab === tab.id ? 'active' : ''}`}
                            onClick={() => {
                                setActiveTab(tab.id);
                                if (onActiveTabChange) onActiveTabChange(tab.id);
                                if (isCollapsed) onToggleCollapse();
                            }}
                            title={tab.label}
                        >
                            {tab.icon}
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="bi-right-panes-container">
            <div className="bi-panes-sidebar">
                <div className="bi-collapse-toggle" onClick={onToggleCollapse} title="Minimize">
                    <Minimize2 size={16} />
                </div>
                <div className="bi-pane-tabs">
                    {tabs.map(tab => (
                        <div
                            key={tab.id}
                            className={`bi-pane-tab ${currentTab === tab.id ? 'active' : ''}`}
                            onClick={() => {
                                setActiveTab(tab.id);
                                if (onActiveTabChange) onActiveTabChange(tab.id);
                            }}
                            title={tab.label}
                        >
                            {tab.icon}
                        </div>
                    ))}
                </div>
            </div>

            <div className="bi-pane-content">
                {currentTab === 'filters' && (
                    <BIFiltersPane
                        selectedVisual={selectedVisual}
                        schema={schema}
                        dataset={dataset}
                        onUpdateVisual={onUpdateVisual}
                    />
                )}
                {currentTab === 'visualizations' && (
                    <BIVisualizationsPane
                        selectedVisual={selectedVisual}
                        onUpdateVisual={onUpdateVisual}
                        onAddVisual={onAddVisual}
                        schema={schema}
                        dataset={dataset}
                        isFieldsRefreshing={isFieldsRefreshing}
                    />
                )}
                {currentTab === 'fields' && (
                    <BIFieldsPane
                        schema={schema}
                        dataset={dataset}
                        fileName={fileName}
                        measures={measures}
                        activeColumn={activeColumn}
                        onSelectColumn={onSelectColumn}
                        isFieldsRefreshing={isFieldsRefreshing}
                    />
                )}
            </div>
        </div>
    );
};

export default BIRightPanes;
