import React, { useState, useRef, useEffect } from 'react';
import {
    Scissors, Copy, Clipboard, Paintbrush,
    Database, FileSpreadsheet, Table, Server, Plus, Clock,
    RotateCcw, FileCode, ChevronDown, ChevronUp,
    BarChart2, Type, MoreHorizontal,
    Calculator, Zap,
    Share2,
    Search, User, Monitor, FilePlus, Layout, MessageSquare, Activity, GitBranch, FileText,
    AppWindow, Image, MousePointer2, TrendingUp, Square, Circle, Minus, Triangle, ArrowRight,
    Users, Eye, Lock, Globe, Settings, Play, BookOpen, ExternalLink, Terminal, Cpu, Info, Palette,
    Calendar, RefreshCw, UserCheck, Languages, Binary, FileJson, Smartphone, Layers, Timer, Filter, Bookmark, Link2, Tag, X,
    Archive, FileText as FileTextIcon,
    Sparkles, Brain, AlertTriangle, Target, Lightbulb, Compass, Download, MessageCircle, FileBarChart
} from 'lucide-react';
import InstallVisualModal from './InstallVisualModal';
import './BIRibbon.css';

// ── Dropdown Component ───────────────────────────────────────────────────────
const Dropdown = ({ options, onClose, onSelect }) => {
    const ref = useRef(null);

    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
        document.addEventListener('mouseup', handler);
        return () => document.removeEventListener('mouseup', handler);
    }, [onClose]);

    return (
        <div className="bi-dropdown-menu" ref={ref}>
            {options.map((opt, i) =>
                opt === null ? (
                    <div key={i} className="bi-dropdown-divider" />
                ) : (
                    <button
                        key={opt.id}
                        className={`bi-dropdown-item ${opt.disabled ? 'disabled' : ''}`}
                        onClick={() => { if (!opt.disabled) { onSelect(opt.id, opt); onClose(); } }}
                        title={opt.tooltip || opt.label}
                    >
                        {opt.icon && <span className="bi-dropdown-item-icon">{opt.icon}</span>}
                        <div>
                            <div className="bi-dropdown-item-label">{opt.label}</div>
                            {opt.sub && <div className="bi-dropdown-item-sub">{opt.sub}</div>}
                        </div>
                    </button>
                )
            )}
        </div>
    );
};

// ── Toolbar Button Components ────────────────────────────────────────────────
const RibbonBtn = ({ icon, label, onClick, disabled, tooltip, children, className = '' }) => (
    <button
        className={`bi-ribbon-tool bi-tool-large ${children ? 'bi-tool-has-dropdown' : ''} ${disabled ? 'bi-tool-disabled' : ''} ${className}`}
        onClick={disabled ? undefined : onClick}
        title={tooltip || label}
        disabled={disabled}
    >
        {icon}
        {children ? (
            <span className="bi-ribbon-tool-text">
                <span className="bi-ribbon-tool-label">{label}</span>
                <span className="bi-ribbon-tool-chevron" aria-hidden>
                    {children}
                </span>
            </span>
        ) : (
            <span>{label}</span>
        )}
    </button>
);

const SmallBtn = ({ icon, label, onClick, disabled, tooltip }) => (
    <button
        className={`bi-ribbon-tool-small ${disabled ? 'bi-tool-disabled' : ''}`}
        onClick={disabled ? undefined : onClick}
        title={tooltip || label}
        disabled={disabled}
    >
        {icon}
        {label}
    </button>
);

const Group = ({ label, children }) => (
    <>
        <div className="bi-tool-group">
            <div className="bi-tool-row">{children}</div>
            <div className="bi-group-label">{label}</div>
        </div>
        <div className="bi-group-divider" />
    </>
);

// ── Main Ribbon ──────────────────────────────────────────────────────────────

const BIRibbon = ({ 
    activeTab, setActiveTab, onAction, fileName, 
    activeMeasure, setActiveMeasure, activeColumn, setActiveColumn, 
    onUpdateColumn, fileId, dataset,
    dateHierarchy, dateFilter, setDateFilter,
    hideSecurityTools = false,
    aiMode = 'ceo',
}) => {
    let tabs = [
        'File', 'Home', 'Insert', 'Modeling', 'View', 'AI Insights',
        // 'Help', 'Table tools', 'External Tools',
    ];
    if (activeMeasure) {
        tabs.push('Measure tools');
    }
    if (activeColumn) {
        tabs.push('Column tools');
    }
    const [openDropdown, setOpenDropdown] = useState(null);
    const [ribbonCollapsed, setRibbonCollapsed] = useState(false);
    const [installModalOpen, setInstallModalOpen] = useState(false);
    const [installModalMode, setInstallModalMode] = useState('appsource');
    const [recentSourcesOptions, setRecentSourcesOptions] = useState([
        { id: 'recent_none', label: 'No recent sources', disabled: true },
    ]);

    const toggleDropdown = (name) => setOpenDropdown(prev => prev === name ? null : name);
    const closeDropdown = () => setOpenDropdown(null);

    const handleTabClick = (tab) => {
        if (tab === activeTab && !ribbonCollapsed) {
            // Double-click same tab collapses (Power BI behavior via single click when already active)
            setRibbonCollapsed(true);
        } else {
            setActiveTab(tab);
            setRibbonCollapsed(false);
        }
    };

    const act = (id, optionMeta) => { 
        if (optionMeta?.recentAction) {
            onAction(optionMeta.recentAction, optionMeta.recentPayload || null);
            closeDropdown();
            return;
        }
        if (id === 'vis_appsource') {
             setInstallModalMode('appsource');
             setInstallModalOpen(true);
        } else if (id === 'vis_file') {
             setInstallModalMode('file');
             setInstallModalOpen(true);
        } else {
             onAction(id); 
        }
        closeDropdown(); 
    };

    // ── Get Data sub-items
    const getDataOptions = [
        { id: 'excel', icon: <FileSpreadsheet size={16} />, label: 'Excel Workbook', sub: 'Import .xlsx files' },
        { id: 'sql_import', icon: <Database size={16} />, label: 'Import from Connection', sub: 'Add tables from existing DBs' },
        { id: 'sql_editor', icon: <FileCode size={16} />, label: 'Custom SQL dataset', sub: 'JOINs in SQL — no model relationships' },
        { id: 'sql', icon: <Server size={16} />, label: 'SQL Server', sub: 'Manage Server Connections' },
        { id: 'enter_data', icon: <Table size={16} />, label: 'Enter Data', sub: 'Manual table entry' },
        { id: 'data_vault', icon: <Archive size={16} />, label: 'DataVault', sub: 'Browse & reuse stored datasets' },
        // { id: 'dataverse', icon: <Database size={16} />, label: 'Dataverse', sub: 'Connect to Dataverse source' },
        null,
        { id: 'more_connectors', icon: <Plus size={16} />, label: 'More...', sub: 'View all data connectors' },
    ];

    useEffect(() => {
        const loadRecentSources = () => {
            try {
                const raw = localStorage.getItem('osa_recent_sources');
                const arr = raw ? JSON.parse(raw) : [];
                if (!Array.isArray(arr) || arr.length === 0) {
                    setRecentSourcesOptions([{ id: 'recent_none', label: 'No recent sources', disabled: true }]);
                    return;
                }
                const opts = arr.slice(0, 8).map((src, idx) => ({
                    id: `recent_source_${idx}`,
                    label: src?.label || 'Recent source',
                    sub: src?.sub || '',
                    recentAction: src?.actionId || 'get_data',
                    recentPayload: src?.payload || null,
                }));
                setRecentSourcesOptions(opts.length ? opts : [{ id: 'recent_none', label: 'No recent sources', disabled: true }]);
            } catch (_) {
                setRecentSourcesOptions([{ id: 'recent_none', label: 'No recent sources', disabled: true }]);
            }
        };

        loadRecentSources();
        window.addEventListener('storage', loadRecentSources);
        window.addEventListener('osa_recent_sources_updated', loadRecentSources);
        return () => {
            window.removeEventListener('storage', loadRecentSources);
            window.removeEventListener('osa_recent_sources_updated', loadRecentSources);
        };
    }, []);

    const transformDataOptions = [
        { id: 'transform_data', icon: <FileCode size={16} />, label: 'Transform Data', sub: 'Open Power Query editor' },
        { id: 'edit_queries', icon: <FileCode size={16} />, label: 'Edit Queries', sub: 'Edit existing query steps' },
        null,
        { id: 'data_src_settings', icon: <Database size={16} />, label: 'Data Source Settings' },
        { id: 'manage_parameters', icon: <Calculator size={16} />, label: 'Manage Parameters' },
    ];

    const moreVisualsOptions = [
        { id: 'vis_appsource', icon: <Search size={16} />, label: 'From AppSource', sub: 'Import from marketplace' },
        { id: 'vis_file', icon: <FileText size={16} />, label: 'From file...', sub: 'Import local visual' },
        null,
        { id: 'vis_remove', icon: <Plus size={16} />, label: 'Remove a visual', style: { transform: 'rotate(45deg)' } },
    ];

    const buttonsOptions = [
        { id: 'btn_blank', label: 'Blank' },
        { id: 'btn_back', label: 'Back' },
        { id: 'btn_drillthrough', label: 'Drill through' },
        { id: 'btn_page_nav', label: 'Page navigation' },
        { id: 'btn_bookmark', label: 'Bookmark' },
        { id: 'btn_info', label: 'Information' },
    ];

    const shapesOptions = [
        { id: 'shp_rect', icon: <Square size={16} />, label: 'Rectangle' },
        { id: 'shp_oval', icon: <Circle size={16} />, label: 'Oval' },
        { id: 'shp_line', icon: <Minus size={16} />, label: 'Line' },
        { id: 'shp_tri', icon: <Triangle size={16} />, label: 'Triangle' },
        { id: 'shp_arrow', icon: <ArrowRight size={16} />, label: 'Arrow' },
    ];

    const newCalcOptions = [
        { id: 'vcalc_custom', label: 'Custom' },
        { id: 'vcalc_run_sum', label: 'Running sum' },
        { id: 'vcalc_mov_avg', label: 'Moving average' },
        { id: 'vcalc_perc_parent', label: 'Percent of parent' },
        { id: 'vcalc_perc_grand', label: 'Percent of grand total' },
        { id: 'vcalc_avg_child', label: 'Average of children' },
        { id: 'vcalc_vs_prev', label: 'Versus previous' },
        { id: 'vcalc_vs_next', label: 'Versus next' },
        { id: 'vcalc_vs_first', label: 'Versus first' },
        { id: 'vcalc_vs_last', label: 'Versus last' },
        { id: 'vcalc_ctx_lookup', label: 'Look up a value with context' },
        { id: 'vcalc_tot_lookup', label: 'Look up a value with totals' },
    ];

    const securityOptions = [
        { id: 'manage_roles', icon: <Lock size={16} />, label: 'Manage roles', sub: 'Define row-level security' },
        { id: 'view_as', icon: <Eye size={16} />, label: 'View as', sub: 'Test RLS roles' },
    ];

    const parameterOptions = [
        { id: 'param_numeric', label: 'Numeric range', sub: 'What-if parameter' },
        { id: 'param_field', label: 'Fields', sub: 'Field parameter' },
    ];

    const themesOptions = [
        { id: 'theme_default', label: 'OSA Purple' },
        { id: 'theme_storm', label: 'Storm' },
        { id: 'theme_bloom', label: 'Bloom' },
        { id: 'theme_sunset', label: 'Sunset' },
        { id: 'theme_forest', label: 'Forest' },
        { id: 'theme_monochrome', label: 'Monochrome' },
        { id: 'theme_financial', label: 'Financial (navy & gold)' },
        null,
        { id: 'theme_gallery', icon: <Palette size={16} />, label: 'Theme gallery' },
        { id: 'theme_import', icon: <Plus size={16} />, label: 'Browse for themes' },
        { id: 'theme_save', icon: <Share2 size={16} />, label: 'Save current theme' },
    ];

    const qnaOptions = [
        { id: 'qna_setup', icon: <Settings size={16} />, label: 'Q&A Setup', sub: 'Configure field synonyms' },
        { id: 'qna_language', icon: <Languages size={16} />, label: 'Language', sub: 'Select NLP language' },
        { id: 'qna_schema', icon: <FileJson size={16} />, label: 'Linguistic Schema', sub: 'Import/Export schema' },
    ];

    const pageViewOptions = [
        { id: 'view_fit_page', label: 'Fit to page' },
        { id: 'view_fit_width', label: 'Fit to width' },
        { id: 'view_actual', label: 'Actual size' },
        null,
        { id: 'view_present', icon: <Play size={16} />, label: 'Present' },
    ];

    const pageColorOptions = [
        { id: 'set_report_bg_white', label: 'White' },
        { id: 'set_report_bg_soft_gray', label: 'Soft gray' },
        { id: 'set_report_bg_soft_blue', label: 'Soft blue' },
        { id: 'set_report_bg_soft_purple', label: 'Soft purple' },
        { id: 'set_report_bg_soft_cream', label: 'Soft cream' },
        null,
        { id: 'set_report_background', icon: <Palette size={16} />, label: 'More colors (hex code)' },
    ];

    // const sensitivityOptions = [
    //     { id: 'sens_general', label: 'General' },
    //     { id: 'sens_public', label: 'Public' },
    //     { id: 'sens_internal', label: 'Internal' },
    //     { id: 'sens_confidential', label: 'Confidential' },
    //     { id: 'sens_highly_conf', label: 'Highly Confidential' },
    // ];

    const renderHomeToolbar = () => (
        <>
            {/* ── Clipboard ── */}
            <Group label="Clipboard">
                <RibbonBtn
                    icon={<Clipboard size={32} />}
                    label="Paste"
                    onClick={() => act('paste')}
                    tooltip="Paste (Ctrl+V)"
                />
                <div className="bi-tool-column">
                    <SmallBtn icon={<Scissors size={13} />} label="Cut" onClick={() => act('cut')} tooltip="Cut (Ctrl+X)" />
                    <SmallBtn icon={<Copy size={13} />} label="Copy" onClick={() => act('copy')} tooltip="Copy (Ctrl+C)" />
                    <SmallBtn icon={<Paintbrush size={13} />} label="Format Painter" onClick={() => act('format_painter')} tooltip="Copy formatting and apply to another visual" />
                </div>
            </Group>

            {/* ── Data ── */}
            <Group label="Data">
                {/* Get Data with dropdown */}
                <div className="bi-dropdown-wrapper">
                    <RibbonBtn
                        icon={<Database size={32} />}
                        label="Get data"
                        onClick={() => toggleDropdown('get_data')}
                        tooltip="Connect to a data source"
                    >
                        <ChevronDown size={11} style={{ marginLeft: 2 }} />
                    </RibbonBtn>
                    {openDropdown === 'get_data' && (
                        <Dropdown options={getDataOptions} onClose={closeDropdown} onSelect={act} />
                    )}
                </div>

                <RibbonBtn
                    icon={<FileSpreadsheet size={32} />}
                    label="Excel workbook"
                    onClick={() => act('excel')}
                    tooltip="Import an Excel workbook (.xlsx)"
                />

                <RibbonBtn
                    icon={<Plus size={32} />}
                    label="Enter data"
                    onClick={() => act('enter_data')}
                    tooltip="Manually enter data into a table"
                />

                {/* Recent Sources with dropdown */}
                <div className="bi-dropdown-wrapper">
                    <RibbonBtn
                        icon={<Clock size={32} />}
                        label="Recent sources"
                        onClick={() => toggleDropdown('recent_sources')}
                        tooltip="Reconnect to a recent data source"
                    >
                        <ChevronDown size={11} style={{ marginLeft: 2 }} />
                    </RibbonBtn>
                    {openDropdown === 'recent_sources' && (
                        <Dropdown options={recentSourcesOptions} onClose={closeDropdown} onSelect={act} />
                    )}
                </div>
            </Group>

            {/* ── Queries ── */}
            <Group label="Queries">
                {/* <div className="bi-dropdown-wrapper">
                    <RibbonBtn
                        icon={<FileCode size={32} />}
                        label="Transform data"
                        onClick={() => toggleDropdown('transform_data')}
                        tooltip="Open the data transformation editor"
                    >
                        <ChevronDown size={11} style={{ marginLeft: 2 }} />
                    </RibbonBtn>
                    {openDropdown === 'transform_data' && (
                        <Dropdown options={transformDataOptions} onClose={closeDropdown} onSelect={act} />
                    )}
                </div> */}

                <RibbonBtn
                    icon={<RotateCcw size={32} />}
                    label="Refresh"
                    onClick={() => act('refresh')}
                    tooltip="Reload all connected data sources and refresh visuals"
                />
            </Group>

            {/* ── Insert ── */}
            <Group label="Insert">
                <RibbonBtn
                    icon={<BarChart2 size={32} />}
                    label="New visual"
                    onClick={() => act('new_visual')}
                    tooltip="Add a blank visual container to the report canvas"
                />

                <RibbonBtn
                    icon={<Type size={32} />}
                    label="Text box"
                    onClick={() => act('text_box')}
                    tooltip="Insert an editable text element into the report"
                />

                <div className="bi-dropdown-wrapper">
                    <RibbonBtn
                        icon={<MoreHorizontal size={32} />}
                        label="More visuals"
                        onClick={() => toggleDropdown('more_visuals')}
                        tooltip="Open the visual library"
                    >
                        <ChevronDown size={11} style={{ marginLeft: 2 }} />
                    </RibbonBtn>
                    {openDropdown === 'more_visuals' && (
                        <Dropdown options={moreVisualsOptions} onClose={closeDropdown} onSelect={act} />
                    )}
                </div>

                <RibbonBtn
                    icon={<FileTextIcon size={32} />}
                    label="Paginated Report"
                    onClick={() => act('paginated_report')}
                    disabled={!fileId}
                    tooltip="Generate a paginated PDF report with tables"
                />
            </Group>

            {/* ── Calculations ── */}
            <Group label="Calculations">
                <div className="bi-dropdown-wrapper">
                    <RibbonBtn
                        icon={<Calculator size={32} />}
                        label="New visual calculation"
                        onClick={() => toggleDropdown('new_calc')}
                        tooltip="Create a new visual calculation"
                    >
                        <ChevronDown size={11} style={{ marginLeft: 2 }} />
                    </RibbonBtn>
                    {openDropdown === 'new_calc' && (
                        <Dropdown options={newCalcOptions} onClose={closeDropdown} onSelect={act} />
                    )}
                </div>

                <RibbonBtn
                    icon={<Calculator size={32} />}
                    label="New measure"
                    onClick={() => act('new_measure')}
                    tooltip="Open the formula editor to create a dynamic measure"
                />

                {/* <RibbonBtn
                    icon={<Zap size={32} />}
                    label="Quick measure"
                    onClick={() => act('quick_measures')}
                    tooltip="Guided calculation templates for common use cases"
                /> */}
            </Group>

            {/* ── Sensitivity (hidden) ── */}
            {/* <Group label="Sensitivity">
                <div className="bi-dropdown-wrapper">
                    <RibbonBtn
                        icon={<Shield size={32} />}
                        label="Sensitivity"
                        onClick={() => toggleDropdown('sensitivity')}
                        tooltip="Apply a sensitivity classification label to this report"
                    >
                        <ChevronDown size={11} style={{ marginLeft: 2 }} />
                    </RibbonBtn>
                    {openDropdown === 'sensitivity' && (
                        <Dropdown options={sensitivityOptions} onClose={closeDropdown} onSelect={act} />
                    )}
                </div>
            </Group> */}

            {/* ── Share ── */}
            <Group label="Share">
                <RibbonBtn
                    icon={<Share2 size={32} />}
                    label="Publish"
                    onClick={() => act('publish')}
                    tooltip="Publish this report to a cloud workspace"
                />
            </Group>
        </>
    );

    const renderInsertToolbar = () => (
        <>
            {/* ── Pages ── */}
            <Group label="Pages">
                <RibbonBtn
                    icon={<FilePlus size={32} />}
                    label="New page"
                    onClick={() => act('new_page')}
                    tooltip="Add a new page to this report"
                />
            </Group>

            {/* ── Visuals ── */}
            <Group label="Visuals">
                <RibbonBtn
                    icon={<Layout size={32} />}
                    label="New visual"
                    onClick={() => act('new_visual')}
                    tooltip="Add a blank visual container to the report canvas"
                />
                <div className="bi-dropdown-wrapper">
                    <RibbonBtn
                        icon={<MoreHorizontal size={32} />}
                        label="More visuals"
                        onClick={() => toggleDropdown('more_visuals')}
                        tooltip="Open the visual library or AppSource"
                    >
                        <ChevronDown size={11} style={{ marginLeft: 2 }} />
                    </RibbonBtn>
                    {openDropdown === 'more_visuals' && (
                        <Dropdown options={moreVisualsOptions} onClose={closeDropdown} onSelect={act} />
                    )}
                </div>
            </Group>

            {/* ── AI Visuals ── */}
            <Group label="AI Visuals">
                <RibbonBtn
                    icon={<MessageSquare size={32} />}
                    label="Q&A"
                    onClick={() => act('ai_qna')}
                    tooltip="Ask a question about your data in natural language"
                />
                <RibbonBtn
                    icon={<Activity size={32} />}
                    label="Key influencers"
                    onClick={() => act('ai_influencers')}
                    tooltip="Identify factors that influence a specific metric"
                />
                <RibbonBtn
                    icon={<GitBranch size={32} />}
                    label="Decomposition tree"
                    onClick={() => act('ai_decomp_tree')}
                    tooltip="Break down a measure to understand contributors"
                />
                <RibbonBtn
                    icon={<FileText size={32} />}
                    label="Smart narrative"
                    onClick={() => act('ai_smart_narrative')}
                    tooltip="Add a summarized text description of your data"
                />
            </Group>

            {/* ── Power Platform ── */}
            <Group label="Power Platform">
                <RibbonBtn
                    icon={<AppWindow size={32} />}
                    label="Power Apps"
                    onClick={() => act('pp_apps')}
                    tooltip="Embed a Power App"
                />
                <RibbonBtn
                    icon={<Zap size={32} />}
                    label="Power Automate"
                    onClick={() => act('pp_automate')}
                    tooltip="Add a button to trigger an automation flow"
                />
            </Group>

            {/* ── Elements ── */}
            <Group label="Elements">
                <RibbonBtn
                    icon={<Type size={32} />}
                    label="Text box"
                    onClick={() => act('text_box')}
                    tooltip="Insert a text box with static or dynamic text"
                />
                <div className="bi-dropdown-wrapper">
                    <RibbonBtn
                        icon={<MousePointer2 size={32} />}
                        label="Buttons"
                        onClick={() => toggleDropdown('buttons')}
                        tooltip="Insert a button for navigation or actions"
                    >
                        <ChevronDown size={11} style={{ marginLeft: 2 }} />
                    </RibbonBtn>
                    {openDropdown === 'buttons' && (
                        <Dropdown options={buttonsOptions} onClose={closeDropdown} onSelect={act} />
                    )}
                </div>
                <div className="bi-dropdown-wrapper">
                    <RibbonBtn
                        icon={<Square size={32} />}
                        label="Shapes"
                        onClick={() => toggleDropdown('shapes')}
                        tooltip="Insert a basic geometric shape"
                    >
                        <ChevronDown size={11} style={{ marginLeft: 2 }} />
                    </RibbonBtn>
                    {openDropdown === 'shapes' && (
                        <Dropdown options={shapesOptions} onClose={closeDropdown} onSelect={act} />
                    )}
                </div>
                <RibbonBtn
                    icon={<Image size={32} />}
                    label="Image"
                    onClick={() => act('insert_image')}
                    tooltip="Upload and insert an image"
                />
            </Group>

            {/* ── Sparklines ── */}
            <Group label="Sparklines">
                <RibbonBtn
                    icon={<TrendingUp size={32} />}
                    label="Add sparkline"
                    onClick={() => act('add_sparkline')}
                    tooltip="Insert a small line chart inside table or matrix cells"
                />
            </Group>
        </>
    );

    const renderModelingToolbar = () => (
        <>

            {/* ── Calendars ── */}
            <Group label="Calendars">
                <RibbonBtn
                    icon={<Calendar size={32} />}
                    label="Mark as date table"
                    onClick={() => act('mark_date_table')}
                    tooltip="Enable time-intelligence features for this table"
                />
            </Group>

            {/* ── Page Refresh ── */}
            <Group label="Page refresh">
                <RibbonBtn
                    icon={<RefreshCw size={32} />}
                    label="Change detection"
                    onClick={() => act('change_detection')}
                    tooltip="Configure automatic page refresh based on data changes"
                />
            </Group>

            {/* ── Security (hidden for consumers opening a locked publish link) ── */}
            {!hideSecurityTools && (
            <Group label="Security">
                <RibbonBtn
                    icon={<Lock size={32} />}
                    label="Manage roles"
                    onClick={() => act('manage_roles')}
                    tooltip="Define security roles and filters for row-level security"
                />
                <RibbonBtn
                    icon={<UserCheck size={32} />}
                    label="View as"
                    onClick={() => act('view_as')}
                    tooltip="Test your report as different security roles"
                />
            </Group>
            )}

            {/* ── Time Slicer (Added) ── */}
            {dateHierarchy && (
                <Group label="Time Slicer">
                    <div className="bi-tool-column">
                        <select 
                            className="bi-ribbon-select"
                            value={dateFilter.year || ""} 
                            onChange={(e) => setDateFilter(prev => ({ ...prev, year: e.target.value ? parseInt(e.target.value) : null }))}
                        >
                            <option value="">All Years</option>
                            {dateHierarchy.years.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                        <select 
                            className="bi-ribbon-select"
                            value={dateFilter.quarter || ""} 
                            onChange={(e) => setDateFilter(prev => ({ ...prev, quarter: e.target.value ? parseInt(e.target.value) : null }))}
                        >
                            <option value="">All Quarters</option>
                            {dateHierarchy.quarters.map(q => <option key={q} value={q}>Q{q}</option>)}
                        </select>
                    </div>
                    <div className="bi-tool-column">
                        <select 
                            className="bi-ribbon-select"
                            value={dateFilter.month || ""} 
                            onChange={(e) => setDateFilter(prev => ({ ...prev, month: e.target.value ? parseInt(e.target.value) : null }))}
                        >
                            <option value="">All Months</option>
                            {dateHierarchy.months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                        <button 
                            className="bi-ribbon-tool-small osa-ribbon-reset"
                            onClick={() => setDateFilter({ year: null, month: null, quarter: null })}
                        >
                            <X size={12} color="#ef4444" />
                            <span style={{ color: '#ef4444' }}>Reset Filters</span>
                        </button>
                    </div>
                </Group>
            )}
        </>
    );

    const renderViewToolbar = () => {
        const themes = [
            { id: 'theme_default', name: 'OSA Purple', color: '#7a1e3a' },
            { id: 'theme_storm', name: 'Storm', color: '#4a90e2' },
            { id: 'theme_bloom', name: 'Bloom', color: '#50e3c2' },
            { id: 'theme_financial', name: 'Financial', color: '#2D2D3A' },
        ];

        return (
            <>
                {/* ── Themes ── */}
                <Group label="Themes">
                    <div className="bi-theme-gallery">
                        {themes.map(t => (
                            <div
                                key={t.id}
                                className="bi-theme-thumbnail"
                                onClick={() => act(t.id)}
                                title={t.name}
                                style={{ backgroundColor: t.color }}
                            />
                        ))}
                    </div>
                    <div className="bi-dropdown-wrapper">
                        <SmallBtn
                            icon={<ChevronDown size={14} />}
                            label="More themes"
                            onClick={() => toggleDropdown('themes')}
                            tooltip="Browse or import themes"
                        />
                        {openDropdown === 'themes' && (
                            <Dropdown options={themesOptions} onClose={closeDropdown} onSelect={act} />
                        )}
                    </div>
                    <RibbonBtn
                        icon={<TrendingUp size={32} />}
                        label="Financial theme"
                        onClick={() => act('theme_financial')}
                        tooltip="Apply navy (#2D2D3A), gold (#FFC107), and coral (#E67E4D) to all chart visuals"
                    />
                </Group>

                {/* ── Scale to Fit ── */}
                <Group label="Scale to fit">
                    <div className="bi-dropdown-wrapper" style={{ height: 'auto' }}>
                        <RibbonBtn
                            icon={<Monitor size={32} />}
                            label="Page view"
                            onClick={() => toggleDropdown('page_view')}
                            tooltip="Adjust how the page fits the screen"
                        >
                            <ChevronDown size={11} style={{ marginLeft: 2 }} />
                        </RibbonBtn>
                        {openDropdown === 'page_view' && (
                            <Dropdown options={pageViewOptions} onClose={closeDropdown} onSelect={act} />
                        )}
                    </div>
                    <RibbonBtn
                        icon={<Play size={32} />}
                        label="Present"
                        onClick={() => act('view_present')}
                        tooltip="Present report in fullscreen mode"
                    />
                </Group>

                {/* ── Mobile ── */}
                <Group label="Mobile">
                    <RibbonBtn
                        icon={<Smartphone size={32} />}
                        label="Mobile layout"
                        onClick={() => act('mobile_layout')}
                        tooltip="Switch to mobile report design mode"
                    />
                </Group>

                {/* ── Page Options ── */}
                <Group label="Page options">
                    <div className="bi-tool-column">
                        <SmallBtn icon={<Type size={12} />} label="Report header" onClick={() => act('set_report_header')} tooltip="Set a report-level heading shown on the canvas" />
                        <div className="bi-dropdown-wrapper">
                            <SmallBtn
                                icon={<Palette size={12} />}
                                label="Page color"
                                onClick={() => toggleDropdown('page_color')}
                                tooltip="Set report canvas background color"
                            />
                            {openDropdown === 'page_color' && (
                                <Dropdown options={pageColorOptions} onClose={closeDropdown} onSelect={act} />
                            )}
                        </div>
                        {/* <SmallBtn icon={null} label="Gridlines" onClick={() => act('toggle_gridlines')} tooltip="Show or hide alignment gridlines" />
                        <SmallBtn icon={null} label="Snap to grid" onClick={() => act('toggle_snap')} tooltip="Align visuals to grid automatically" /> */}
                        <SmallBtn icon={<Lock size={12} />} label="Lock objects" onClick={() => act('toggle_lock')} tooltip="Prevent visuals from being moved or resized" />
                    </div>
                </Group>

                {/* ── Show Panes ── */}
                <Group label="Show panes">
                    <div className="bi-tool-column">
                        <SmallBtn icon={<Filter size={12} />} label="Filters" onClick={() => act('toggle_filters')} />
                        <SmallBtn icon={<Bookmark size={12} />} label="Bookmarks" onClick={() => act('toggle_bookmarks')} />
                        <SmallBtn icon={<Layers size={12} />} label="Selection" onClick={() => act('toggle_selection')} />
                    </div>
                    <div className="bi-tool-column">
                        <SmallBtn icon={<Timer size={12} />} label="Performance analyzer" onClick={() => act('toggle_perf')} />
                        <SmallBtn icon={<Link2 size={12} />} label="Sync slicers" onClick={() => act('toggle_sync_slicers')} />
                    </div>
                </Group>
            </>
        );
    };

    /*
    const renderHelpToolbar = () => (
        <>
            <Group label="Help">
                <RibbonBtn icon={<Info size={32} />} label="About" onClick={() => act('about')} />
                <RibbonBtn icon={<BookOpen size={32} />} label="Documentation" onClick={() => act('help_docs')} />
                <RibbonBtn icon={<Play size={32} />} label="Guided learning" onClick={() => act('guided_learning')} />
                <RibbonBtn icon={<Users size={32} />} label="Community" onClick={() => act('community')} />
            </Group>
            <Group label="Support">
                <RibbonBtn icon={<MessageSquare size={32} />} label="Submit an idea" onClick={() => act('submit_idea')} />
                <RibbonBtn icon={<Settings size={32} />} label="Check for updates" onClick={() => act('check_updates')} />
            </Group>
        </>
    );

    const renderExternalToolsToolbar = () => (
        <>
            <Group label="External Tools">
                <RibbonBtn
                    icon={<Terminal size={32} />}
                    label="DAX Studio"
                    onClick={() => act('ext_dax_studio')}
                    tooltip="External tool for DAX authoring"
                />
                <RibbonBtn
                    icon={<Settings size={32} />}
                    label="Tabular Editor"
                    onClick={() => act('ext_tabular_editor')}
                    tooltip="External tool for model metadata editing"
                />
                <RibbonBtn
                    icon={<Cpu size={32} />}
                    label="ALM Toolkit"
                    onClick={() => act('ext_alm_toolkit')}
                    tooltip="External tool for dataset comparison"
                />
            </Group>
        </>
    );
    */

    const renderMeasureToolsToolbar = () => (
        <>
            <Group label="Structure">
                <div className="bi-tool-column">
                    <div className="bi-ribbon-field-item">
                        <span className="bi-ribbon-field-label">Name</span>
                        <input type="text" className="bi-dropdown-select" defaultValue="Measure" readOnly style={{ width: 140, height: 22 }} />
                    </div>
                    <div className="bi-ribbon-field-item">
                        <span className="bi-ribbon-field-label">Home table</span>
                        <select className="bi-dropdown-select" style={{ width: 140, height: 22 }} disabled>
                            <option>{fileName || 'Dataset'}</option>
                        </select>
                    </div>
                </div>
            </Group>

            <Group label="Formatting">
                <div className="bi-tool-column">
                    <div className="bi-ribbon-field-item">
                        <span className="bi-ribbon-field-label">Format</span>
                        <select className="bi-dropdown-select" style={{ width: 140, height: 22 }}>
                            <option>General</option>
                            <option>Currency</option>
                            <option>Decimal number</option>
                            <option>Whole number</option>
                            <option>Percentage</option>
                        </select>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                        <button className="bi-icon-btn-small" title="Format as Currency">$</button>
                        <button className="bi-icon-btn-small" title="Format as Percentage">%</button>
                        <button className="bi-icon-btn-small" title="Comma style">,</button>
                        <div style={{ width: 1, height: 14, background: '#cbd5e1', margin: '0 4px' }} />
                        <select className="bi-dropdown-select" style={{ width: 45, height: 20 }} defaultValue="Auto">
                            <option>Auto</option>
                            <option>0</option>
                            <option>1</option>
                            <option>2</option>
                            <option>3</option>
                            <option>4</option>
                        </select>
                    </div>
                </div>
            </Group>

            <Group label="Properties">
                <div className="bi-tool-column">
                    <div className="bi-ribbon-field-item">
                        <span className="bi-ribbon-field-label">Data category</span>
                        <select className="bi-dropdown-select" style={{ width: 140, height: 22 }} defaultValue="Uncategorized">
                            <option>Uncategorized</option>
                            <option>Address</option>
                            <option>City</option>
                            <option>Continent</option>
                            <option>Country/Region</option>
                            <option>County</option>
                            <option>Postal Code</option>
                            <option>State or Province</option>
                            <option>Web URL</option>
                            <option>Image URL</option>
                        </select>
                    </div>
                </div>
            </Group>

            <Group label="Calculations">
                <RibbonBtn
                    icon={<Calculator size={32} />}
                    label="New measure"
                    onClick={() => act('new_measure')}
                />
                <RibbonBtn
                    icon={<Zap size={32} color="#f59e0b" />}
                    label="Quick measure"
                    onClick={() => act('quick_measures')}
                />
            </Group>
        </>
    );

    const renderColumnToolsToolbar = () => (
        <>
            <Group label="Structure">
                <div className="bi-tool-column" style={{ gap: '8px' }}>
                    <div className="bi-ribbon-field-item">
                        <div className="bi-ribbon-field-label">
                            <Type size={12} className="bi-ribbon-field-icon" /> Name
                        </div>
                        <input
                            type="text"
                            className="bi-dropdown-select"
                            value={activeColumn?.column_name || ''}
                            onChange={(e) => onUpdateColumn(activeColumn.column_name, { column_name: e.target.value })}
                            style={{ width: 140, height: 22 }}
                        />
                    </div>
                    <div className="bi-ribbon-field-item">
                        <div className="bi-ribbon-field-label">
                            <Clock size={12} className="bi-ribbon-field-icon" /> Data type
                        </div>
                        <select
                            className="bi-dropdown-select"
                            style={{ width: 140, height: 22 }}
                            value={activeColumn?.data_type || 'numeric'}
                            onChange={(e) => onUpdateColumn(activeColumn.column_name, { data_type: e.target.value })}
                        >
                            <option value="numeric">Decimal number</option>
                            <option value="integer">Whole number</option>
                            <option value="text">Text</option>
                            <option value="date">Date</option>
                            <option value="boolean">True/False</option>
                        </select>
                    </div>
                </div>
            </Group>

            <Group label="Formatting">
                <div className="bi-tool-column" style={{ gap: '8px' }}>
                    <div className="bi-ribbon-field-item">
                        <div className="bi-ribbon-field-label">
                            <Palette size={12} className="bi-ribbon-field-icon" /> Format
                        </div>
                        <select
                            className="bi-dropdown-select"
                            style={{ width: 140, height: 22 }}
                            value={activeColumn?.format || 'General'}
                            onChange={(e) => onUpdateColumn(activeColumn.column_name, { format: e.target.value })}
                        >
                            <option>General</option>
                            <option>Currency</option>
                            <option>Decimal number</option>
                            <option>Whole number</option>
                            <option>Percentage</option>
                            <option>Scientific</option>
                        </select>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', paddingLeft: '4px' }}>
                        <button className="bi-icon-btn-small" title="Format as Currency" onClick={() => onUpdateColumn(activeColumn.column_name, { format: 'Currency' })}>$</button>
                        <button className="bi-icon-btn-small" title="Format as Percentage" onClick={() => onUpdateColumn(activeColumn.column_name, { format: 'Percentage' })}>%</button>
                        <button className="bi-icon-btn-small" title="Comma style" onClick={() => onUpdateColumn(activeColumn.column_name, { format: 'Decimal number' })}>,</button>
                        <div style={{ width: 1, height: 16, background: '#e2e8f0', margin: '0 4px' }} />
                        <div className="bi-ribbon-field-item" style={{ padding: 0 }}>
                            <select className="bi-dropdown-select" style={{ width: 50, height: 22 }} defaultValue="Auto">
                                <option>Auto</option>
                                <option>0</option>
                                <option>1</option>
                                <option>2</option>
                                <option>3</option>
                            </select>
                        </div>
                    </div>
                </div>
            </Group>

            <Group label="Properties">
                <div className="bi-tool-column" style={{ gap: '8px' }}>
                    <div className="bi-ribbon-field-item">
                        <div className="bi-ribbon-field-label">
                            <Activity size={12} className="bi-ribbon-field-icon" /> Summarization
                        </div>
                        <select
                            className="bi-dropdown-select"
                            style={{ width: 140, height: 22 }}
                            value={activeColumn?.summarization || 'Sum'}
                            onChange={(e) => onUpdateColumn(activeColumn.column_name, { summarization: e.target.value })}
                        >
                            <option>Sum</option>
                            <option>Average</option>
                            <option>Minimum</option>
                            <option>Maximum</option>
                            <option>Count</option>
                            <option>Don't summarize</option>
                        </select>
                    </div>
                    <div className="bi-ribbon-field-item">
                        <div className="bi-ribbon-field-label">
                            <Info size={12} className="bi-ribbon-field-icon" /> Data category
                        </div>
                        <select
                            className="bi-dropdown-select"
                            style={{ width: 140, height: 22 }}
                            value={activeColumn?.data_category || 'Uncategorized'}
                            onChange={(e) => onUpdateColumn(activeColumn.column_name, { data_category: e.target.value })}
                        >
                            <option>Uncategorized</option>
                            <option>Address</option>
                            <option>City</option>
                            <option>Continent</option>
                            <option>Country/Region</option>
                            <option>County</option>
                            <option>Postal Code</option>
                        </select>
                    </div>
                </div>
            </Group>

            <Group label="Sort">
                <RibbonBtn
                    icon={<TrendingUp size={32} color="#7a1e3a" />}
                    label="Sort by column"
                >
                    <ChevronDown size={14} style={{ marginLeft: 4 }} />
                </RibbonBtn>
            </Group>

            <Group label="Groups">
                <RibbonBtn
                    icon={<Layers size={32} color="#7a1e3a" />}
                    label="Data groups"
                >
                    <ChevronDown size={14} style={{ marginLeft: 4 }} />
                </RibbonBtn>
            </Group>
        </>
    );

    /*
    const renderTableToolsToolbar = () => (
        <>
            <Group label="Structure">
                <div className="bi-tool-column" style={{ justifyContent: 'center' }}>
                    <div className="bi-ribbon-field-item">
                        <div className="bi-ribbon-field-label">
                            <Tag size={12} className="bi-ribbon-field-icon" style={{ transform: 'rotate(45deg)' }} /> Name
                        </div>
                        <input
                            type="text"
                            className="bi-dropdown-select"
                            defaultValue={fileName?.replace('.csv', '') || 'Table'}
                            readOnly
                            style={{ width: 140, height: 22 }}
                        />
                    </div>
                </div>
            </Group>

            <Group label="Relationships">
                <RibbonBtn
                    icon={<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px', opacity: 0.5 }}><Square size={8} /><Square size={8} /><Square size={8} /><Square size={8} /></div>}
                    label="Manage relationships"
                    onClick={() => { }}
                    disabled={true}
                />
            </Group>

            <Group label="Calculations">
                <RibbonBtn
                    icon={<BarChart2 size={32} />}
                    label="New visual calculation"
                    onClick={() => act('new_visual_calc')}
                >
                    <ChevronDown size={11} style={{ marginLeft: 2 }} />
                </RibbonBtn>
                <RibbonBtn icon={<Calculator size={32} />} label="New measure" onClick={() => act('new_measure')} />
                <RibbonBtn icon={<Zap size={32} color="#f59e0b" />} label="Quick measure" onClick={() => act('quick_measures')} />
                <RibbonBtn icon={<Table size={32} color="#8c2546" />} label="New column" onClick={() => act('new_column')} />
                <RibbonBtn icon={<Database size={32} />} label="New table" onClick={() => act('new_table')} />
            </Group>

            <Group label="Calendars">
                <RibbonBtn
                    icon={<Calendar size={32} color="#64748b" />}
                    label="Mark as date table"
                    onClick={() => act('mark_date_table')}
                />
            </Group>
        </>
    );
    */

    const renderFileToolbar = () => null; // File tab opens overlay, not toolbar

    // ── AI Insights toolbar ──────────────────────────────────────────────
    const aiModeOptions = [
        { id: 'ai_mode_ceo', icon: <span style={{ fontSize: 14 }}>👔</span>, label: 'Executive Summary', sub: 'Strategic, concise, business-impact' },
        { id: 'ai_mode_technical', icon: <span style={{ fontSize: 14 }}>🧪</span>, label: 'Explain Technically', sub: 'Statistical and analytical depth' },
        { id: 'ai_mode_simple', icon: <span style={{ fontSize: 14 }}>💡</span>, label: 'Explain Simply', sub: 'Plain language, no jargon' },
        { id: 'ai_mode_financial', icon: <span style={{ fontSize: 14 }}>💼</span>, label: 'Financial View', sub: 'Revenue, cost, margin lens' },
        { id: 'ai_mode_sales', icon: <span style={{ fontSize: 14 }}>📈</span>, label: 'Sales View', sub: 'Pipeline, conversion, regions' },
    ];

    const AI_MODE_LABELS = {
        ceo: 'Executive',
        technical: 'Technical',
        simple: 'Simple',
        financial: 'Financial',
        sales: 'Sales',
    };

    const renderAIInsightsToolbar = () => (
        <>
            {/* ── Explain ── */}
            <Group label="Explain">
                <RibbonBtn
                    icon={<Sparkles size={32} color="#7a1e3a" />}
                    label="Explain this chart"
                    onClick={() => act('ai_explain')}
                    tooltip="Generate an AI explanation of the currently selected visual"
                />
                <RibbonBtn
                    icon={<TrendingUp size={32} color="#0ea5e9" />}
                    label="Explain trend"
                    onClick={() => act('ai_trend')}
                    tooltip="Compare current vs previous, growth/decline with percentages"
                />
                <RibbonBtn
                    icon={<AlertTriangle size={32} color="#f59e0b" />}
                    label="Detect anomalies"
                    onClick={() => act('ai_anomalies')}
                    tooltip="Flag abnormal spikes or dips in the chart data"
                />
                <RibbonBtn
                    icon={<Target size={32} color="#ef4444" />}
                    label="Root cause"
                    onClick={() => act('ai_root_cause')}
                    tooltip="Identify which dimension members are driving the result"
                />
            </Group>

            {/* ── AI Modes ── */}
            <Group label="AI mode">
                <div className="bi-dropdown-wrapper" style={{ height: 'auto' }}>
                    <RibbonBtn
                        icon={<Brain size={32} color="#5e172c" />}
                        label={AI_MODE_LABELS[aiMode] ? `Mode: ${AI_MODE_LABELS[aiMode]}` : 'AI mode'}
                        onClick={() => toggleDropdown('ai_modes')}
                        tooltip="Switch the persona / tone of the AI explanations"
                    >
                        <ChevronDown size={11} style={{ marginLeft: 2 }} />
                    </RibbonBtn>
                    {openDropdown === 'ai_modes' && (
                        <Dropdown options={aiModeOptions} onClose={closeDropdown} onSelect={act} />
                    )}
                </div>
            </Group>

            {/* ── Actions ── */}
            <Group label="Actions">
                <RibbonBtn
                    icon={<Compass size={32} color="#14b8a6" />}
                    label="Generate summary"
                    onClick={() => act('ai_summary')}
                    tooltip="Produce a tight executive summary of the visual"
                />
                <RibbonBtn
                    icon={<Lightbulb size={32} color="#22c55e" />}
                    label="Next steps"
                    onClick={() => act('ai_next_steps')}
                    tooltip="Suggested actions and follow-ups based on the analysis"
                />
                <RibbonBtn
                    icon={<BookOpen size={32} color="#a855f7" />}
                    label="Create AI story"
                    onClick={() => act('ai_story')}
                    tooltip="Generate a narrative, presentation-style story for this chart"
                />
                <RibbonBtn
                    icon={<Download size={32} color="#475569" />}
                    label="Export AI report"
                    onClick={() => act('ai_export')}
                    tooltip="Download the current AI insights as a Markdown report"
                />
            </Group>

            {/* ── AI Assistant ── */}
            <Group label="AI assistant">
                <RibbonBtn
                    icon={<MessageSquare size={32} color="#8c2546" />}
                    label="Ask this visual"
                    onClick={() => act('ai_ask')}
                    tooltip="Open a Q&A composer focused on the selected visual"
                />
                <RibbonBtn
                    icon={<MessageCircle size={32} color="#8c2546" />}
                    label="Chat with chart"
                    onClick={() => act('ai_chat')}
                    tooltip="Have a back-and-forth conversation about this chart"
                />
            </Group>
        </>
    );

    const renderToolbar = () => {
        switch (activeTab) {
            case 'File': return renderFileToolbar();
            case 'Home': return renderHomeToolbar();
            case 'Insert': return renderInsertToolbar();
            case 'Modeling': return renderModelingToolbar();
            case 'View': return renderViewToolbar();
            case 'AI Insights': return renderAIInsightsToolbar();
            /* case 'Help': return renderHelpToolbar();
            case 'Table tools': return renderTableToolsToolbar();
            case 'External Tools': return renderExternalToolsToolbar(); */
            case 'Measure tools': return renderMeasureToolsToolbar();
            case 'Column tools': return renderColumnToolsToolbar();
            default: return renderHomeToolbar();
        }
    };

    return (
        <div className="bi-ribbon">
            {/* Title Bar */}
            {/* <div className="bi-title-bar">
                <div className="bi-title-left">
                    <Monitor size={14} className="bi-app-icon" />
                    <span className="bi-app-title">OneStopAnalytics Desktop</span>
                    <span className="bi-file-name">- {fileName || 'Untitled Report'}</span>
                </div>
                <div className="bi-search-wrapper">
                    <div className="bi-search-input-container">
                        <Search size={14} className="bi-search-icon" />
                        <input type="text" placeholder="Search" className="bi-ribbon-search" />
                    </div>
                </div>
                <div className="bi-title-right">
                    <button className="bi-title-btn"><User size={15} /> Sign in</button>
                    <button className="bi-title-btn bi-share-btn"><Share2 size={15} /> Share</button>
                </div>
            </div> */}

            {/* Tabs */}
            <div className="bi-ribbon-tabs">
                {tabs.map(tab => {
                    const isContextTab = tab === 'Measure tools' || tab === 'Column tools';
                    const isAITab = tab === 'AI Insights';
                    return (
                        <button
                            key={tab}
                            className={`bi-ribbon-tab ${activeTab === tab ? 'active' : ''} ${tab === 'File' ? 'bi-file-tab' : ''} ${isContextTab ? 'bi-context-tab' : ''} ${(isContextTab && activeTab === tab) ? 'bi-context-tab-active' : ''} ${isAITab ? 'bi-ai-tab-pill' : ''}`}
                            onClick={() => handleTabClick(tab)}
                        >
                            {isAITab && <Sparkles size={12} className="bi-ai-tab-pill-icon" />}
                            {tab}
                        </button>
                    )
                })}
                <button
                    className="bi-ribbon-collapse-btn"
                    onClick={() => setRibbonCollapsed(prev => !prev)}
                    title={ribbonCollapsed ? 'Expand ribbon (Ctrl+F1)' : 'Collapse ribbon (Ctrl+F1)'}
                >
                    {ribbonCollapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
                </button>
            </div>

            {/* Dynamic Toolbar */}
            {activeTab !== 'File' && (
                <div className={`bi-ribbon-toolbar ${ribbonCollapsed ? 'bi-ribbon-collapsed' : ''}`}>
                    {renderToolbar()}
                </div>
            )}
            <InstallVisualModal 
                isOpen={installModalOpen} 
                onClose={() => setInstallModalOpen(false)} 
                mode={installModalMode} 
                onAddVisual={(id) => onAction('AddObject', id)}
            />
        </div>
    );
};

export default BIRibbon;
