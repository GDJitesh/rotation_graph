import React from 'react';
import Plot from 'react-plotly.js';

const RRGChart = ({ selectedNode, nodeType, timeFrame }) => {
  if (!selectedNode) return <div style={{padding: 20}}>Select a Sector or Industry from the left.</div>;

  // --- 1. DATA PREPARATION ---
  // If Sector selected -> Plot its Industries
  // If Industry selected -> Plot its Stocks
  let itemsToPlot = [];
  let title = "";

  if (nodeType === 'sector') {
    title = `Sector View: ${selectedNode.name} (Constituent Industries)`;
    // Also add the Sector itself as a reference point (in black)
    itemsToPlot = [
      { ...selectedNode, isParent: true }, 
      ...selectedNode.industries
    ];
  } else if (nodeType === 'industry') {
    title = `Industry View: ${selectedNode.name} (Constituent Stocks)`;
    itemsToPlot = [
      { ...selectedNode, isParent: true },
      ...selectedNode.stocks
    ];
  }

  // --- 2. GENERATE TRACES (Lines & Dots) ---
  const traces = [];

  itemsToPlot.forEach((item) => {
    // Safety Check: Does this item have RRG data for the selected timeframe?
    const history = item.rrg_data ? item.rrg_data[timeFrame] : null;
    
    if (history && history.length > 0) {
      // Unpack data for Plotly
      const xVals = history.map(h => h.x);
      const yVals = history.map(h => h.y);
      //const dates = history.map(h => h.date);

      // A. The "Tail" (Line)
      traces.push({
        x: xVals,
        y: yVals,
        mode: 'lines',
        type: 'scatter',
        line: { 
          color: item.isParent ? 'black' : undefined, // Parent is black, others auto-colored
          width: item.isParent ? 3 : 1,
          shape: 'spline' // Smooth curves
        },
        opacity: 0.5,
        showlegend: false,
        hoverinfo: 'skip'
      });

      // B. The "Head" (Dot)
      const current = history[history.length - 1];
      
      // Determine Quadrant Color for the dot
      let color = 'gray';
      if (current.x > 100 && current.y > 100) color = 'green';      // Leading
      else if (current.x < 100 && current.y > 100) color = 'blue';  // Improving
      else if (current.x < 100 && current.y < 100) color = 'red';   // Lagging
      else color = 'orange'; // Weakening

      if (item.isParent) color = 'black'; // Override for parent

      traces.push({
        x: [current.x],
        y: [current.y],
        mode: 'markers+text',
        type: 'scatter',
        name: item.name,
        text: [item.isParent ? `<b>${item.name}</b>` : item.name], // Bold parent name
        textposition: 'top center',
        marker: { 
          color: color, 
          size: item.isParent ? 15 : 10,
          symbol: item.isParent ? 'diamond' : 'circle'
        },
        hovertemplate: `<b>${item.name}</b><br>Ratio: %{x}<br>Mom: %{y}<br>Date: ${current.date}<extra></extra>`
      });
    }
  });

  // --- 3. LAYOUT CONFIG ---
  const layout = {
    title: title,
    autosize: true,
    height: 800,
    xaxis: { 
      title: 'RS-Ratio (Trend)', 
      range: [90, 110], // Zoom level (Auto-adjusts usually, but safe default)
      zeroline: false 
    },
    yaxis: { 
      title: 'RS-Momentum (Velocity)', 
      range: [90, 110],
      zeroline: false
    },
    // The Quadrant Lines (Crosshair at 100,100)
    shapes: [
      { type: 'line', x0: 0, y0: 100, x1: 200, y1: 100, line: {color: 'gray', width: 1, dash: 'dot'} },
      { type: 'line', x0: 100, y0: 0, x1: 100, y1: 200, line: {color: 'gray', width: 1, dash: 'dot'} }
    ],
    // Colored Backgrounds for Quadrants (Optional, subtle hints)
    annotations: [
      { x: 108, y: 108, text: "LEADING", showarrow: false, font: {color: 'green', size: 14, weight: 'bold'}, opacity: 0.2 },
      { x: 92, y: 108, text: "IMPROVING", showarrow: false, font: {color: 'blue', size: 14, weight: 'bold'}, opacity: 0.2 },
      { x: 92, y: 92, text: "LAGGING", showarrow: false, font: {color: 'red', size: 14, weight: 'bold'}, opacity: 0.2 },
      { x: 108, y: 92, text: "WEAKENING", showarrow: false, font: {color: 'orange', size: 14, weight: 'bold'}, opacity: 0.2 }
    ]
  };

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Plot
        data={traces}
        layout={layout}
        useResizeHandler={true}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
};

export default RRGChart;