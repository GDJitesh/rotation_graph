import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import RRGChart from './RRGChart';
import './App.css';

function App() {
  const [marketData, setMarketData] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [nodeType, setNodeType] = useState(null); // 'sector' or 'industry'
  const [timeFrame, setTimeFrame] = useState('weekly'); // 'daily', 'weekly', 'monthly'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // --- 1. FETCH DATA ON LOAD ---
  useEffect(() => {
    // URL Fix for GitHub Pages vs Localhost
    const basePath = process.env.PUBLIC_URL || ''; 
    const jsonUrl = `${basePath}/market_data.json`;

    console.log("Fetching data from:", jsonUrl);

    fetch(jsonUrl)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          throw new TypeError("Received HTML instead of JSON. Check Port Visibility.");
        }
        return res.json();
      })
      .then(jsonData => {
        setMarketData(jsonData);
        
        // --- INITIAL VIEW: MARKET OVERVIEW ---
        // We construct a "Virtual Node" representing the whole market.
        // We trick the chart by treating 'Sectors' as the 'Industries' of the Market.
        setSelectedNode({
            name: "Nifty 500 Market",
            industries: jsonData.sectors // This allows the chart to plot all sectors
        });
        setNodeType('sector'); // Tells chart to look for 'industries' key
        
        setLoading(false);
      })
      .catch(err => {
        console.error("Fetch Error:", err);
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // --- 2. HANDLE SELECTIONS (Drill Down) ---
  const handleSelect = (node, type) => {
    // If user clicks the header "Market Map" in Sidebar (you might add a button later),
    // we could reset to Market View. For now, Sidebar handles specific items.
    setSelectedNode(node);
    setNodeType(type);
  };

  const resetToMarket = () => {
    if (!marketData) return;
    setSelectedNode({
        name: "Nifty 500 Market",
        industries: marketData.sectors
    });
    setNodeType('sector');
  };

  // --- 3. RENDER STATES ---
  if (loading) return <div className="loading">Loading Market Data...</div>;
  if (error) return <div className="error">Error: {error}</div>;
  if (!marketData) return <div className="error">No Data Found</div>;

  return (
    <div className="App" style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      
      {/* LEFT SIDEBAR (20%) */}
      <Sidebar 
        data={marketData} 
        onSelect={handleSelect} 
      />

      {/* MAIN CONTENT (80%) */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        
        {/* HEADER / CONTROLS */}
        <div style={{ 
            padding: '15px', 
            borderBottom: '1px solid #ddd', 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            backgroundColor: '#f8f9fa'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <h2 style={{ margin: 0, cursor: 'pointer' }} onClick={resetToMarket}>
                Rotation Graph (RRG)
            </h2>
            {/* Breadcrumb-ish indicator */}
            <span style={{ color: '#666', fontSize: '0.9em' }}>
                {nodeType === 'sector' && selectedNode.name.includes("Market") 
                    ? "Viewing: All Sectors" 
                    : `Viewing: ${selectedNode?.name}`
                }
            </span>
            <button onClick={resetToMarket} style={{ fontSize: '0.8em', padding: '4px 8px', cursor: 'pointer'}}>
                Reset to Market
            </button>
          </div>
          
          {/* TIMEFRAME TOGGLES */}
          <div>
            {['daily', 'weekly', 'monthly'].map(tf => (
              <button
                key={tf}
                onClick={() => setTimeFrame(tf)}
                style={{
                  padding: '6px 14px',
                  margin: '0 5px',
                  border: '1px solid #007bff',
                  backgroundColor: timeFrame === tf ? '#007bff' : 'white',
                  color: timeFrame === tf ? 'white' : '#007bff',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                  fontWeight: '600',
                  fontSize: '0.9rem'
                }}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        {/* THE CHART */}
        <div style={{ flex: 1, padding: '10px', position: 'relative', overflow: 'hidden' }}>
            <RRGChart 
              selectedNode={selectedNode} 
              nodeType={nodeType} 
              timeFrame={timeFrame} 
            />
        </div>
        
        {/* FOOTER */}
        <div style={{ 
            padding: '8px', 
            fontSize: '0.75em', 
            color: '#888', 
            textAlign: 'center',
            borderTop: '1px solid #eee',
            backgroundColor: '#fafafa'
        }}>
          Last Updated: {marketData.last_updated} | 
          Benchmark: {nodeType === 'industry' ? `${selectedNode.name} Index` : marketData.benchmark_name}
        </div>
      </div>
    </div>
  );
}

export default App;