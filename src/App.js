import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import RRGChart from './RRGChart';
import './App.css';

function App() {
  const [marketData, setMarketData] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [nodeType, setNodeType] = useState(null); 
  const [timeFrame, setTimeFrame] = useState('weekly');
  // NEW STATE: Benchmark Toggle
  const [benchmarkMode, setBenchmarkMode] = useState('relative'); // 'relative' or 'broad'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const basePath = process.env.PUBLIC_URL || ''; 
    const jsonUrl = `${basePath}/market_data.json`;
    console.log("Fetching data from:", jsonUrl);

    fetch(jsonUrl)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) throw new TypeError("Not JSON");
        return res.json();
      })
      .then(jsonData => {
        setMarketData(jsonData);
        setSelectedNode({
            name: "Nifty 500 Market",
            industries: jsonData.sectors
        });
        setNodeType('sector');
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const resetToMarket = () => {
    if (!marketData) return;
    setSelectedNode({ name: "Nifty 500 Market", industries: marketData.sectors });
    setNodeType('sector');
  };

  if (loading) return <div className="loading">Loading Market Data...</div>;
  if (error) return <div className="error">Error: {error}</div>;

  return (
    <div className="App" style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar data={marketData} onSelect={(node, type) => { setSelectedNode(node); setNodeType(type); }} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        
        {/* HEADER */}
        <div style={{ padding: '15px', borderBottom: '1px solid #ddd', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8f9fa' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <h2 style={{ margin: 0, cursor: 'pointer' }} onClick={resetToMarket}>Rotation Graph</h2>
            <span style={{ color: '#666', fontSize: '0.9em' }}>
                {nodeType === 'sector' && selectedNode.name.includes("Market") ? "All Sectors" : selectedNode?.name}
            </span>
            <button onClick={resetToMarket} style={{ fontSize: '0.8em', padding: '4px 8px', cursor: 'pointer'}}>Reset</button>
          </div>
          
          <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
            
            {/* NEW: BENCHMARK TOGGLE (Only show if not in Market View) */}
            {!selectedNode.name.includes("Market") && (
                <div style={{ display: 'flex', border: '1px solid #ccc', borderRadius: '4px', overflow: 'hidden' }}>
                    <button 
                        onClick={() => setBenchmarkMode('relative')}
                        style={{
                            padding: '6px 10px', border: 'none', cursor: 'pointer',
                            backgroundColor: benchmarkMode === 'relative' ? '#6c757d' : '#fff',
                            color: benchmarkMode === 'relative' ? 'white' : '#333'
                        }}
                    >
                        Vs Parent
                    </button>
                    <button 
                        onClick={() => setBenchmarkMode('broad')}
                        style={{
                            padding: '6px 10px', border: 'none', cursor: 'pointer',
                            backgroundColor: benchmarkMode === 'broad' ? '#6c757d' : '#fff',
                            color: benchmarkMode === 'broad' ? 'white' : '#333'
                        }}
                    >
                        Vs Nifty500
                    </button>
                </div>
            )}

            {/* Timeframe */}
            <div>
                {['daily', 'weekly', 'monthly'].map(tf => (
                <button
                    key={tf}
                    onClick={() => setTimeFrame(tf)}
                    style={{
                    padding: '6px 14px', margin: '0 2px', border: '1px solid #007bff',
                    backgroundColor: timeFrame === tf ? '#007bff' : 'white',
                    color: timeFrame === tf ? 'white' : '#007bff',
                    borderRadius: '4px', cursor: 'pointer', textTransform: 'capitalize', fontWeight: 'bold'
                    }}
                >
                    {tf}
                </button>
                ))}
            </div>
          </div>
        </div>

        {/* CHART */}
        <div style={{ flex: 1, padding: '10px', position: 'relative', overflow: 'hidden' }}>
            <RRGChart 
              selectedNode={selectedNode} 
              nodeType={nodeType} 
              timeFrame={timeFrame} 
              benchmarkMode={benchmarkMode} // Pass the mode
            />
        </div>
        
        <div style={{ padding: '8px', fontSize: '0.75em', color: '#888', textAlign: 'center', backgroundColor: '#fafafa' }}>
          Last Updated: {marketData.last_updated}
        </div>
      </div>
    </div>
  );
}

export default App;