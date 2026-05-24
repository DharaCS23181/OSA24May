import React from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, Legend
} from 'recharts';
import { VIBRANT_PALETTE } from '../constants/chartPalette';
const PIE_COLORS = VIBRANT_PALETTE;

const MAIN_COLOR = VIBRANT_PALETTE[0]; // Premium Indigo

/**
 * Chart Component
 * Renders different chart types using recharts
 * @param {string} type - Chart type: 'line', 'bar', 'pie', 'area'
 * @param {array} data - Chart data array
 * @param {number} height - Chart container height in pixels
 */
function Chart({ type, data, options = {}, height = 300 }) {
  if (!data || data.length === 0) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height }}>No data available</div>;
  }

  const formatNumber = (num) => {
    if (typeof num !== 'number') return num;
    if (options.numberFormat === 'integer') return Math.round(num).toLocaleString();
    if (options.numberFormat === 'decimal') return num.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    if (options.numberFormat === 'currency') return '$' + num.toLocaleString();
    if (options.numberFormat === 'percentage') return num.toLocaleString() + '%';
    return num.toLocaleString();
  };

  const tooltipFormatter = (value) => [formatNumber(value), options.yLabel || 'Value'];
  const mainColor = options.color || MAIN_COLOR;

  // Sorting
  let chartData = [...data];
  if (options.sort === 'asc') chartData.sort((a, b) => a.value - b.value);
  if (options.sort === 'desc') chartData.sort((a, b) => b.value - a.value);

  const renderChart = () => {
    switch (type) {
      case 'bar':
        return (
          <BarChart data={chartData}>
            {options.showGrid && <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />}
            <XAxis dataKey="month" fontSize={12} tickLine={false} axisLine={false} label={options.xLabel ? { value: options.xLabel, position: 'insideBottom', offset: -5 } : undefined} />
            <YAxis fontSize={12} tickLine={false} axisLine={false} tickFormatter={formatNumber} label={options.yLabel ? { value: options.yLabel, angle: -90, position: 'insideLeft' } : undefined} />
            <Tooltip cursor={{ fill: 'transparent' }} formatter={tooltipFormatter} />
            {options.showLegend && <Legend />}
            <Bar dataKey="value" name={options.yLabel || 'Value'} radius={[4, 4, 0, 0]} fill={mainColor}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={options.color ? mainColor : VIBRANT_PALETTE[index % VIBRANT_PALETTE.length]} />
              ))}
            </Bar>
          </BarChart>
        );
      case 'line':
        return (
          <LineChart data={chartData}>
            {options.showGrid && <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />}
            <XAxis dataKey="month" fontSize={12} tickLine={false} axisLine={false} label={options.xLabel ? { value: options.xLabel, position: 'insideBottom', offset: -5 } : undefined} />
            <YAxis fontSize={12} tickLine={false} axisLine={false} tickFormatter={formatNumber} label={options.yLabel ? { value: options.yLabel, angle: -90, position: 'insideLeft' } : undefined} />
            <Tooltip formatter={tooltipFormatter} />
            {options.showLegend && <Legend />}
            <Line type="monotone" name={options.yLabel || 'Value'} dataKey="value" stroke={mainColor} strokeWidth={3} dot={{ r: 4, fill: mainColor, strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6, strokeWidth: 0 }} />
          </LineChart>
        );
      case 'pie':
        return (
          <PieChart>
            <Pie
              data={chartData}
              innerRadius={0}
              outerRadius={80}
              paddingAngle={2}
              dataKey="value"
              nameKey="month"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={options.color ? mainColor : PIE_COLORS[index % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={tooltipFormatter} />
            {options.showLegend && <Legend />}
          </PieChart>
        );
      case 'donut':
        return (
          <PieChart>
            <Pie
              data={chartData}
              innerRadius={60}
              outerRadius={80}
              paddingAngle={5}
              dataKey="value"
              nameKey="month"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={options.color ? mainColor : PIE_COLORS[index % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={tooltipFormatter} />
            {options.showLegend && <Legend />}
          </PieChart>
        );
      case 'area':
        return (
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={mainColor} stopOpacity={0.3} />
                <stop offset="95%" stopColor={mainColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            {options.showGrid && <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />}
            <XAxis dataKey="month" fontSize={12} tickLine={false} axisLine={false} label={options.xLabel ? { value: options.xLabel, position: 'insideBottom', offset: -5 } : undefined} />
            <YAxis fontSize={12} tickLine={false} axisLine={false} tickFormatter={formatNumber} label={options.yLabel ? { value: options.yLabel, angle: -90, position: 'insideLeft' } : undefined} />
            <Tooltip formatter={tooltipFormatter} />
            {options.showLegend && <Legend />}
            <Area type="monotone" name={options.yLabel || 'Value'} dataKey="value" stroke={mainColor} strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" />
          </AreaChart>
        );
      case 'table':
        const headers = data.length > 0 ? Object.keys(data[0]) : [];
        return (
          <div className="table-container" style={{ overflowX: 'auto', maxHeight: '100%', padding: '10px' }}>
            <table className="ai-data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid rgba(99, 102, 241, 0.1)' }}>
                  {headers.map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '12px', color: MAIN_COLOR, fontWeight: '600' }}>
                      {h.charAt(0).toUpperCase() + h.slice(1)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                    {headers.map(h => (
                      <td key={h} style={{ padding: '10px 12px', color: '#333' }}>
                        {typeof row[h] === 'number' ? row[h].toLocaleString() : row[h]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      default:
        return <div>Unsupported chart type: {type}</div>;
    }
  };

  return (
    <div className="chart-wrapper" style={{ width: '100%', height: height }}>
      <ResponsiveContainer width="100%" height="100%">
        {renderChart()}
      </ResponsiveContainer>
    </div>
  );
}

export default Chart;
