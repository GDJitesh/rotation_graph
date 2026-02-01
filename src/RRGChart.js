import React, { useState } from 'react';
import Plot from 'react-plotly.js';

const RRGChart = ({ selectedNode, nodeType, timeFrame }) => {
  const [hoveredName, setHoveredName] = useState(null);

  if (!selectedNode) return <div style={{padding: 20}}>Select a Sector or Industry from the left.</div>;

  // --- 1. DATA PREPARATION ---
  let title = "";
  let itemsToPlot = [];

  if (nodeType === 'sector') {
    title = `Sector Rotation: ${selectedNode.name}`;
    itemsToPlot = [{ ...selectedNode, isParent: true }, ...selectedNode.industries];
  } else if (nodeType === 'industry') {
    title = `Industry Rotation: ${selectedNode.name}`;
    itemsToPlot = [{ ...selectedNode, isParent: true }, ...selectedNode.stocks];
  }

  // --- 2. GENERATE TRACES ---
  const traces = [];

  itemsToPlot.forEach((item) => {
    const history = item.rrg_data ? item.rrg_data[timeFrame] : null;
    
    if (history && history.length > 0) {
      const xVals = history.map(h => h.x);
      const yVals = history.map(h => h.y);
      const dates = history.map(h => h.date);
      const current = history[history.length - 1];

      // --- SPOTLIGHT LOGIC ---
      // If nothing is hovered, everyone is "normal".
      // If something is hovered, only the match is "bright", others are "dim".
      const isHovered = hoveredName === item.name;
      const isDimmed = hoveredName && !isHovered;

      // Opacity Settings
      const tailOpacity = isHovered ? 1 : (isDimmed ? 0.05 : 0.4); // Normal tails are semi-transparent
      const headOpacity = isHovered ? 1 : (isDimmed ? 0.1 : 0.9);

      // Determine Color (Quadrant Logic)
      let color = '#7f8c8d'; // Default gray
      if (current.x > 100 && current.y > 100) color = '#28a745';      // Leading (Green)
      else if (current.x < 100 && current.y > 100) color = '#3498db'; // Improving (Blue)
      else if (current.x < 100 && current.y < 100) color = '#e74c3c'; // Lagging (Red)
      else color = '#f1c40f'; // Weakening (Yellow)

      if (item.isParent) color = '#2c3e50'; // Parent is always dark slate

      // A. The "Tail" (Curved Line + Small Dots)
      traces.push({
        x: xVals,
        y: yVals,
        mode: 'lines+markers', // Added markers to tail
        type: 'scatter',
        name: item.name,
        opacity: tailOpacity,
        line: { 
          color: color, 
          width: item.isParent ? 3 : 1,
          shape: 'spline',
          smoothing: 1.3
        },
        marker: {
          color: color,
          size: 3, // Tiny dots for history
          symbol: 'circle'
        },
        hoverinfo: 'name+text',
        hovertemplate: `<b>${item.name}</b> (History)<extra></extra>`
      });

      // B. The "Head" (Current Day)
      traces.push({
        x: [current.x],
        y: [current.y],
        mode: 'markers', // Removed '+text' to reduce clutter
        type: 'scatter',
        name: item.name,
        opacity: headOpacity,
        marker: { 
          color: color, 
          size: item.isParent ? 12 : 7, // Reduced size (was 15/10)
          symbol: item.isParent ? 'diamond' : 'circle',
          line: { color: 'white', width: 1 } // White border for contrast
        },
        // Detailed Tooltip
        hovertemplate: `
          <b>${item.name}</b><br>
          Ratio: %{x:.2f}<br>
          Mom: %{y:.2f}<br>
          Date: ${current.date}
          <extra></extra>` 
      });
    }
  });

  // --- 3. LAYOUT (Quadrant Colors) ---
  const layout = {
    title: { text: title, font: { size: 18 } },
    autosize: true,
    height: 800,
    hovermode: 'closest',
    showlegend: false, // Hidden to save space, hover identifies items
    xaxis: { 
      title: 'Relative Strength (Ratio)', 
      range: [96, 104], // Tighter zoom for better visibility
      zeroline: false,
      gridcolor: '#eee'
    },
    yaxis: { 
      title: 'Momentum', 
      range: [96, 104],
      zeroline: false,
      gridcolor: '#eee'
    },
    // COLORED BACKGROUNDS (The Gradients)
    shapes: [
      // Leading (Green - TR)
      { type: 'rect', x0: 100, y0: 100, x1: 200, y1: 200, fillcolor: 'rgba(40, 167, 69, 0.05)', line: {width: 0}, layer: 'below' },
      // Weakening (Yellow - BR)
      { type: 'rect', x0: 100, y0: 0, x1: 200, y1: 100, fillcolor: 'rgba(255, 193, 7, 0.05)', line: {width: 0}, layer: 'below' },
      // Lagging (Red - BL)
      { type: 'rect', x0: 0, y0: 0, x1: 100, y1: 100, fillcolor: 'rgba(220, 53, 69, 0.05)', line: {width: 0}, layer: 'below' },
      // Improving (Blue - TL)
      { type: 'rect', x0: 0, y0: 100, x1: 100, y1: 200, fillcolor: 'rgba(23, 162, 184, 0.05)', line: {width: 0}, layer: 'below' },
      // Axis Lines
      { type: 'line', x0: 0, y0: 100, x1: 200, y1: 100, line: {color: '#888', width: 1} },
      { type: 'line', x0: 100, y0: 0, x1: 100, y1: 200, line: {color: '#888', width: 1} }
    ]
  };

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Plot
        data={traces}
        layout={layout}
        useResizeHandler={true}
        style={{ width: '100%', height: '100%' }}
        // EVENTS: Handle Hover to Trigger Spotlight
        onHover={(data) => {
            // Find the name of the trace being hovered
            if (data.points && data.points[0]) {
                const curveNumber = data.points[0].curveNumber;
                const traceName = traces[curveNumber].name;
                setHoveredName(traceName);
            }
        }}
        onUnhover={() => setHoveredName(null)}
      />
    </div>
  );
};

export default RRGChart;