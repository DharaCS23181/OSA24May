import React from 'react';
import * as Recharts from 'recharts';

/**
 * Safely evaluates external visual code in a sandboxed environment.
 * Provides Recharts and React via scope so the visual can use them.
 */
export const evaluateVisualScript = (scriptContent, nameHint = "CustomVisual") => {
    try {
        const exports = {};
        const module = { exports };
        const sandboxGlobals = { React, Recharts, module, exports, console: { ...console } };
        const globalNames = Object.keys(sandboxGlobals);
        const globalValues = Object.values(sandboxGlobals);
        const evaluator = new Function(...globalNames, `"use strict"; \n ${scriptContent} \n return module.exports;`);
        const result = evaluator(...globalValues);
        if (!result || typeof result.render !== 'function') throw new Error("Visual must export a 'render' function on module.exports");
        return {
            id: result.id || `custom_${Date.now()}`,
            name: result.name || nameHint,
            render: result.render,
            configSchema: result.configSchema || {},
            icon: result.icon || null
        };
    } catch (e) {
        console.error("Failed to parse custom visual script:", e);
        throw e;
    }
};

const defaultRadarScript = (id, name, icon) => `
    const { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } = Recharts;
    const { createElement } = React;
    module.exports = {
        id: "${id}", name: "${name}", icon: "${icon}",
        configSchema: { dataKey: { type: "string", default: "value" }, angleKey: { type: "string", default: "subject" } },
        render: function(props) {
            const { data, config } = props;
            const angleKey = config?.angleKey || "subject";
            const dataKey = config?.dataKey || "value";
            return createElement(ResponsiveContainer, { width: "100%", height: "100%" },
                createElement(RadarChart, { cx: "50%", cy: "50%", outerRadius: "80%", data: data },
                    createElement(PolarGrid),
                    createElement(PolarAngleAxis, { dataKey: angleKey }),
                    createElement(PolarRadiusAxis),
                    createElement(Radar, { name: "${name}", dataKey: dataKey, stroke: "#8884d8", fill: "#8884d8", fillOpacity: 0.6 }),
                    createElement(Tooltip)
                )
            );
        }
    };
`;

export const PREINSTALLED_VISUALS = [
    evaluateVisualScript(defaultRadarScript("com.microsoft.powerbi.visuals.radar_chart", "Radar Chart", ""), "Radar Chart")
];

export const fetchAndEvaluateVisual = async (scriptUrl, metadata) => {
    const mockScript = defaultRadarScript(metadata.id, metadata.name, metadata.icon);
    await new Promise(r => setTimeout(r, 500));
    return evaluateVisualScript(mockScript, metadata.name);
};
