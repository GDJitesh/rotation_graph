import React, { useState } from 'react';
import Plot from 'react-plotly.js';

const RRGChart = ({ selectedNode, nodeType, timeFrame, benchmarkMode }) => {
  const [hoveredName, setHoveredName] = useState(null);

  if (!selectedNode) return <div style={{padding: 20}}>Select a Sector or Industry from the left.</div>;

  // --- 1. DATA PREPARATION ---
  let title = "";
  let itemsToPlot = [];
  let benchmarkLabel = "";

  if (nodeType === 'sector') {
    title = `Sector Breakdown: ${selectedNode.name}`;
    itemsToPlot = selectedNode.industries || [];
    // Dynamic Label based on mode
    benchmarkLabel = benchmarkMode === 'relative' 
        ? `Benchmark: ${selectedNode.name} Index` 
        : `Benchmark: Nifty 500`;
        
  } else if (nodeType === 'industry') {
    title = `Industry Breakdown: ${selectedNode.name}`;
    itemsToPlot = selectedNode.stocks || [];
    // Dynamic Label based on mode
    benchmarkLabel = benchmarkMode === 'relative' 
        ? `Benchmark: ${selectedNode.name} Index` 
        : `Benchmark: Nifty 500`;

  } else {
    // Market View
    title = "Market Overview";
    itemsToPlot = selectedNode.industries || [];
    benchmarkLabel = "Benchmark: Nifty 500";
  }

  // --- 2. GENERATE TRACES ---
  const traces = [];
  let minX = 100, maxX = 100, minY = 100, maxY = 100;
  let hasData = false;

  itemsToPlot.forEach((item) => {
    // LOGIC UPDATE: Access the correct data path (relative vs broad)
    // If top level "Market View", force 'relative' (which is mapped to Master Bench in Python)
    const mode = selectedNode.name.includes("Market") ? 'relative' : benchmarkMode;
    
    // Safety check for nested keys
    const history = (item.rrg_data && item.rrg_data[mode]) 
        ? item.rrg_data[mode][timeFrame] 
        : null;
    
    if (history && history.length > 0) {
      hasData = true;
      const xVals = history.map(h => h.x);
      const yVals = history.map(h => h.y);
      const current = history[history.length - 1];

      // Smart Zoom Math
      minX = Math.min(minX, ...xVals);
      maxX = Math.max(maxX, ...xVals);
      minY = Math.min(minY, ...yVals);
      maxY = Math.max(maxY, ...yVals);

      // Spotlight / Dimming
      const isHovered = hoveredName === item.name;
      const isDimmed = hoveredName && !isHovered;
      const tailOpacity = isHovered ? 1 : (isDimmed ? 0.05 : 0.6); 
      const headOpacity = isHovered ? 1 : (isDimmed ? 0.1 : 0.9);

      // Color
      let color = '#7f8c8d'; 
      if (current.x > 100 && current.y > 100) color = '#28a745';      
      else if (current.x < 100 && current.y > 100) color = '#3498db'; 
      else if (current.x < 100 && current.y < 100) color = '#e74c3c'; 
      else color = '#f1c40f'; 

      // A. Tail
      traces.push({
        x: xVals, y: yVals,
        mode: 'lines+markers', type: 'scatter', name: item.name,
        opacity: tailOpacity,
        line: { color: color, width: 1, shape: 'spline', smoothing: 1 },
        marker: { color: color, size: 4, symbol: 'circle' },
        hoverinfo: 'none'
      });

      // B. Head
      traces.push({
        x: [current.x], y: [current.y],
        mode: 'markers', type: 'scatter', name: item.name,
        opacity: headOpacity,
        marker: { color: color, size: 9, symbol: 'circle', line: { color: 'white', width: 1 } },
        hovertemplate: `<b>${item.name}</b><br>Ratio: %{x}<br>Mom: %{y}<extra></extra>` 
      });
    }
  });

  // --- 3. LAYOUT ---
  const padding = 1.5; 
  const finalXRange = hasData ? [minX - padding, maxX + padding] : [98, 102];
  const finalYRange = hasData ? [minY - padding, maxY + padding] : [98, 102];

  const layout = {
    title: { text: title, font: { size: 16 } },
    autosize: true, height: 750, hovermode: 'closest', showlegend: false,
    xaxis: { 
      title: 'Relative Strength (Ratio)', range: finalXRange, fixedrange: true, zeroline: false, gridcolor: '#f0f0f0'
    },
    yaxis: { 
      title: 'Momentum', range: finalYRange, fixedrange: true, zeroline: false, gridcolor: '#f0f0f0'
    },
    shapes: [
      { type: 'rect', x0: 100, y0: 100, x1: 1000, y1: 1000, fillcolor: 'rgba(40, 167, 69, 0.05)', line: {width: 0}, layer: 'below' },
      { type: 'rect', x0: 100, y0: 0, x1: 1000, y1: 100, fillcolor: 'rgba(255, 193, 7, 0.05)', line: {width: 0}, layer: 'below' },
      { type: 'rect', x0: 0, y0: 0, x1: 100, y1: 100, fillcolor: 'rgba(220, 53, 69, 0.05)', line: {width: 0}, layer: 'below' },
      { type: 'rect', x0: 0, y0: 100, x1: 100, y1: 1000, fillcolor: 'rgba(23, 162, 184, 0.05)', line: {width: 0}, layer: 'below' },
      { type: 'line', x0: 0, y0: 100, x1: 1000, y1: 100, line: {color: '#888', width: 1} },
      { type: 'line', x0: 100, y0: 0, x1: 100, y1: 1000, line: {color: '#888', width: 1} }
    ],
    annotations: [
        { x: finalXRange[1], y: finalYRange[1], text: "LEADING", showarrow: false, font: {color: 'green', size: 12}, opacity: 0.3, xanchor: 'right', yanchor: 'top' },
        { x: finalXRange[0], y: finalYRange[0], text: "LAGGING", showarrow: false, font: {color: 'red', size: 12}, opacity: 0.3, xanchor: 'left', yanchor: 'bottom' },
        { x: finalXRange[0], y: finalYRange[1], text: "IMPROVING", showarrow: false, font: {color: 'blue', size: 12}, opacity: 0.3, xanchor: 'left', yanchor: 'top' },
        { x: finalXRange[1], y: finalYRange[0], text: "WEAKENING", showarrow: false, font: {color: 'orange', size: 12}, opacity: 0.3, xanchor: 'right', yanchor: 'bottom' }
    ]
  };

  const config = { displayModeBar: false, scrollZoom: false, doubleClick: false, showTips: false };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
        
        {/* --- HERE IS WHERE THE LABEL IS USED --- */}
        <div style={{
            position: 'absolute', top: 10, right: 10, 
            background: 'rgba(255,255,255,0.8)', padding: '5px 10px', 
            fontSize: '0.8em', border: '1px solid #ccc', borderRadius: 4, zIndex: 10
        }}>
            {benchmarkLabel}
        </div>

        <Plot
            data={traces}
            layout={layout}
            config={config}
            useResizeHandler={true}
            style={{ width: '100%', height: '100%' }}
            onHover={(data) => {
                if (data.points && data.points[0]) {
                    setHoveredName(traces[data.points[0].curveNumber].name);
                }
            }}
            onUnhover={() => setHoveredName(null)}
        />
    </div>
  );
};

export default RRGChart;