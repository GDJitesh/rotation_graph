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

  
  useEffect(() => {
    // 1. Construct the correct URL based on the environment
    // process.env.PUBLIC_URL is set automatically by React
    const basePath = process.env.PUBLIC_URL || ''; 
    const jsonUrl = `${basePath}/market_data.json`;

    console.log("Fetching data from:", jsonUrl);

    fetch(jsonUrl)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          throw new TypeError("Received HTML instead of JSON. Check Port Visibility or File Path.");
        }
        return res.json();
      })
      .then(jsonData => {
        setMarketData(jsonData);
        
        // Default Selection: First Sector
        if (jsonData.sectors && jsonData.sectors.length > 0) {
          setSelectedNode(jsonData.sectors[0]);
          setNodeType('sector');
        }
        setLoading(false);
      })
      .catch(err => {
        console.error("Fetch Error:", err);
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="loading">Loading Market Data...</div>;
  if (error) return <div className="error">Error: {error}</div>;
  if (!marketData) return <div className="error">No Data Found</div>;

  return (
    <div className="App" style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      
      {/* 1. LEFT SIDEBAR (20%) */}
      <Sidebar 
        data={marketData} 
        onSelect={(node, type) => {
          setSelectedNode(node);
          setNodeType(type);
        }} 
      />

      {/* 2. MAIN CONTENT (80%) */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        
        {/* Header / Controls */}
        <div style={{ 
            padding: '15px', 
            borderBottom: '1px solid #ddd', 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            backgroundColor: '#f8f9fa'
        }}>
          <h2 style={{ margin: 0 }}>Rotation Graph (RRG)</h2>
          
          {/* Timeframe Toggles */}
          <div>
            {['daily', 'weekly', 'monthly'].map(tf => (
              <button
                key={tf}
                onClick={() => setTimeFrame(tf)}
                style={{
                  padding: '8px 16px',
                  margin: '0 5px',
                  border: '1px solid #007bff',
                  backgroundColor: timeFrame === tf ? '#007bff' : 'white',
                  color: timeFrame === tf ? 'white' : '#007bff',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                  fontWeight: 'bold'
                }}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        {/* The Chart */}
        <div style={{ flex: 1, padding: '20px', position: 'relative' }}>
            <RRGChart 
              selectedNode={selectedNode} 
              nodeType={nodeType} 
              timeFrame={timeFrame} 
            />
        </div>
        
        {/* Footer Info */}
        <div style={{ 
            padding: '10px', 
            fontSize: '0.8em', 
            color: '#666', 
            textAlign: 'center',
            borderTop: '1px solid #eee'
        }}>
          Last Updated: {marketData.last_updated} | Benchmark: {marketData.benchmark}
        </div>
      </div>
    </div>
  );
}

export default App;