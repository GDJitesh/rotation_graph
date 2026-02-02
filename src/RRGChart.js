import React, { useState, useMemo } from 'react';
import Plot from 'react-plotly.js';

const RRGChart = ({ selectedNode, nodeType, timeFrame, benchmarkMode }) => {
  const [hoveredName, setHoveredName] = useState(null);
  // Track which items the user has hidden manually
  const [hiddenItems, setHiddenItems] = useState({}); // { "ItemName": true }
  const [showLegend, setShowLegend] = useState(true);

  if (!selectedNode) return <div style={{padding: 20}}>Select a Sector or Industry from the left.</div>;

  // --- 1. DATA PREPARATION ---
  let title = "";
  let itemsToPlot = [];
  let benchmarkLabel = "";

  if (nodeType === 'sector') {
    title = `Sector Breakdown: ${selectedNode.name}`;
    itemsToPlot = selectedNode.industries || [];
    benchmarkLabel = benchmarkMode === 'relative' 
        ? `Benchmark: ${selectedNode.name} Index` 
        : `Benchmark: Nifty 500`;
  } else if (nodeType === 'industry') {
    title = `Industry Breakdown: ${selectedNode.name}`;
    itemsToPlot = selectedNode.stocks || [];
    benchmarkLabel = benchmarkMode === 'relative' 
        ? `Benchmark: ${selectedNode.name} Index` 
        : `Benchmark: Nifty 500`;
  } else {
    title = "Market Overview";
    itemsToPlot = selectedNode.industries || [];
    benchmarkLabel = "Benchmark: Nifty 500";
  }

  // --- 2. GENERATE TRACES & LEGEND LIST ---
  // Memoize to prevent flicker
  const { traces, axisRanges, legendData } = useMemo(() => {
    const _traces = [];
    const _legendData = [];
    let minX = 100, maxX = 100, minY = 100, maxY = 100;
    let hasData = false;

    // Add items
    itemsToPlot.forEach((item) => {
      const mode = selectedNode.name.includes("Market") ? 'relative' : benchmarkMode;
      const history = (item.rrg_data && item.rrg_data[mode]) ? item.rrg_data[mode][timeFrame] : null;
      
      const isHidden = hiddenItems[item.name];

      // Trend Status Logic (Minervini)
      const isBullish = item.is_bullish; // From JSON
      const symbolShape = isBullish ? 'circle' : 'circle-open';
      const trendText = isBullish ? "✔ Stage 2 (Trend)" : "⚠ Weak Structure";
      
      // Add to Legend Data even if hidden
      _legendData.push({
          name: item.name,
          color: isBullish ? '#28a745' : '#dc3545', // Green for Bullish, Red for Weak structure in legend
          isHidden: isHidden,
          isBullish: isBullish
      });

      if (history && history.length > 0 && !isHidden) {
        hasData = true;
        const xVals = history.map(h => h.x);
        const yVals = history.map(h => h.y);
        const current = history[history.length - 1];

        minX = Math.min(minX, ...xVals);
        maxX = Math.max(maxX, ...xVals);
        minY = Math.min(minY, ...yVals);
        maxY = Math.max(maxY, ...yVals);

        const isHovered = hoveredName === item.name;
        const isDimmed = hoveredName && !isHovered;
        const tailOpacity = isHovered ? 1 : (isDimmed ? 0.05 : 0.6); 
        const headOpacity = isHovered ? 1 : (isDimmed ? 0.1 : 0.9);

        // RRG Quadrant Color Logic
        let color = '#7f8c8d'; 
        if (current.x > 100 && current.y > 100) color = '#28a745';      
        else if (current.x < 100 && current.y > 100) color = '#3498db'; 
        else if (current.x < 100 && current.y < 100) color = '#e74c3c'; 
        else color = '#f1c40f'; 

        // Tail
        _traces.push({
          x: xVals, y: yVals,
          mode: 'lines+markers', type: 'scatter', name: item.name,
          opacity: tailOpacity,
          line: { color: color, width: 1, shape: 'spline', smoothing: 1 },
          marker: { color: color, size: 4, symbol: 'circle' },
          hoverinfo: 'none'
        });

        // Head
        _traces.push({
          x: [current.x], y: [current.y],
          mode: 'markers', type: 'scatter', name: item.name,
          opacity: headOpacity,
          marker: { 
              color: color, 
              size: 9, 
              symbol: symbolShape, 
              line: { color: isBullish ? 'white' : color, width: isBullish ? 1 : 2 } 
          },
          hovertemplate: `<b>${item.name}</b><br>Ratio: %{x}<br>Mom: %{y}<br><i>${trendText}</i><extra></extra>` 
        });
      }
    });

    const padding = 1.5;
    const finalRanges = {
        x: hasData ? [minX - padding, maxX + padding] : [98, 102],
        y: hasData ? [minY - padding, maxY + padding] : [98, 102]
    };

    return { traces: _traces, axisRanges: finalRanges, legendData: _legendData };
  }, [itemsToPlot, timeFrame, benchmarkMode, selectedNode, hoveredName, hiddenItems]);


  // --- 3. UI LAYOUT ---
  const layout = {
    title: { text: title, font: { size: 16 } },
    autosize: true, margin: {l: 50, r: 20, t: 40, b: 40},
    hovermode: 'closest', showlegend: false,
    xaxis: { title: 'Relative Strength', range: axisRanges.x, fixedrange: true, zeroline: false, gridcolor: '#f0f0f0' },
    yaxis: { title: 'Momentum', range: axisRanges.y, fixedrange: true, zeroline: false, gridcolor: '#f0f0f0' },
    shapes: [
      { type: 'rect', x0: 100, y0: 100, x1: 1000, y1: 1000, fillcolor: 'rgba(40, 167, 69, 0.05)', line: {width: 0}, layer: 'below' },
      { type: 'rect', x0: 100, y0: 0, x1: 1000, y1: 100, fillcolor: 'rgba(255, 193, 7, 0.05)', line: {width: 0}, layer: 'below' },
      { type: 'rect', x0: 0, y0: 0, x1: 100, y1: 100, fillcolor: 'rgba(220, 53, 69, 0.05)', line: {width: 0}, layer: 'below' },
      { type: 'rect', x0: 0, y0: 100, x1: 100, y1: 1000, fillcolor: 'rgba(23, 162, 184, 0.05)', line: {width: 0}, layer: 'below' },
      { type: 'line', x0: 0, y0: 100, x1: 1000, y1: 100, line: {color: '#888', width: 1} },
      { type: 'line', x0: 100, y0: 0, x1: 100, y1: 1000, line: {color: '#888', width: 1} }
    ],
    annotations: [
        { x: axisRanges.x[1], y: axisRanges.y[1], text: "LEADING", showarrow: false, font: {color: 'green', size: 12}, opacity: 0.3, xanchor: 'right', yanchor: 'top' },
        { x: axisRanges.x[0], y: axisRanges.y[0], text: "LAGGING", showarrow: false, font: {color: 'red', size: 12}, opacity: 0.3, xanchor: 'left', yanchor: 'bottom' },
        { x: axisRanges.x[0], y: axisRanges.y[1], text: "IMPROVING", showarrow: false, font: {color: 'blue', size: 12}, opacity: 0.3, xanchor: 'left', yanchor: 'top' },
        { x: axisRanges.x[1], y: axisRanges.y[0], text: "WEAKENING", showarrow: false, font: {color: 'orange', size: 12}, opacity: 0.3, xanchor: 'right', yanchor: 'bottom' }
    ]
  };

  const config = { displayModeBar: false, scrollZoom: false, doubleClick: false, showTips: false };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', display: 'flex' }}>
        
        {/* CHART AREA */}
        <div style={{ flex: 1, position: 'relative' }}>
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

        {/* INTERACTIVE LEGEND PANEL */}
        <div style={{ 
            width: showLegend ? '220px' : '30px', 
            transition: 'width 0.3s',
            borderLeft: '1px solid #ddd', 
            backgroundColor: '#fdfdfd', 
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden'
        }}>
            {/* Toggle Button */}
            <div 
                onClick={() => setShowLegend(!showLegend)}
                style={{ padding: '10px', cursor: 'pointer', background: '#eee', textAlign: 'center', fontWeight: 'bold' }}
            >
                {showLegend ? "Legend (Click to Hide)" : "☰"}
            </div>

            {/* List */}
            {showLegend && (
                <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
                    <div style={{ fontSize: '0.8em', color: '#666', marginBottom: '10px' }}>
                        Click to Toggle Visibility<br/>
                        ● = Strong Trend<br/>
                        ○ = Weak Trend
                    </div>

                    {legendData.map((item) => (
                        <div 
                            key={item.name}
                            onClick={() => {
                                setHiddenItems(prev => ({ ...prev, [item.name]: !prev[item.name] }));
                            }}
                            style={{ 
                                display: 'flex', alignItems: 'center', gap: '8px', 
                                padding: '6px', cursor: 'pointer',
                                opacity: item.isHidden ? 0.4 : 1,
                                background: hoveredName === item.name ? '#f0f0f0' : 'transparent',
                                borderRadius: '4px', marginBottom: '2px'
                            }}
                            onMouseEnter={() => setHoveredName(item.name)}
                            onMouseLeave={() => setHoveredName(null)}
                        >
                            {/* Shape Indicator */}
                            <div style={{
                                width: 10, height: 10, 
                                borderRadius: '50%', 
                                border: `2px solid ${item.isHidden ? '#ccc' : '#555'}`,
                                backgroundColor: item.isBullish && !item.isHidden ? '#555' : 'transparent'
                            }}></div>
                            
                            <span style={{ fontSize: '0.85em', fontWeight: item.isBullish ? '600' : '400' }}>
                                {item.name}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    </div>
  );
};

export default RRGChart;