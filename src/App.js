import React, { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [data, setData] = useState([]);
  const [selectedSector, setSelectedSector] = useState(null);
  const [selectedSub, setSelectedSub] = useState(null);

  // 1. Load Data on Startup
  useEffect(() => {
    fetch('/market_data.json')
      .then(res => res.json())
      .then(jsonData => setData(jsonData))
      .catch(err => console.error("Failed to load data", err));
  }, []);

  // 2. Format Market Cap
  const formatMcap = (val) => {
    return (val / 10000000).toFixed(2) + " Cr";
  };

  return (
    <div className="App" style={{ padding: '20px', fontFamily: 'Arial' }}>
      <h1>Market Sector Explorer</h1>
      
      {/* SECTOR SELECTOR */}
      <div style={{ marginBottom: '20px' }}>
        <h3>1. Select Sector:</h3>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {data.map((sec, idx) => (
            <button 
              key={idx} 
              onClick={() => { setSelectedSector(sec); setSelectedSub(null); }}
              style={{
                padding: '10px', 
                background: selectedSector === sec ? '#007bff' : '#f0f0f0',
                color: selectedSector === sec ? 'white' : 'black',
                border: 'none', borderRadius: '5px', cursor: 'pointer'
              }}
            >
              {sec.name}
            </button>
          ))}
        </div>
      </div>

      {/* SUB-SECTOR SELECTOR */}
      {selectedSector && (
        <div style={{ marginBottom: '20px' }}>
          <h3>2. Select Industry ({selectedSector.name}):</h3>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {selectedSector.subsectors.map((sub, idx) => (
              <button 
                key={idx}
                onClick={() => setSelectedSub(sub)}
                style={{
                  padding: '8px', 
                  background: selectedSub === sub ? '#28a745' : '#e2e6ea',
                  color: selectedSub === sub ? 'white' : 'black',
                  border: 'none', borderRadius: '5px', cursor: 'pointer'
                }}
              >
                {sub.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* STOCK TABLE */}
      {selectedSub && (
        <div>
          <h3>3. Top Stocks in {selectedSub.name}:</h3>
          <table border="1" cellPadding="10" style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr style={{ background: '#343a40', color: 'white' }}>
                <th>Symbol</th>
                <th>Company Name</th>
                <th>Price (₹)</th>
                <th>Market Cap</th>
              </tr>
            </thead>
            <tbody>
              {selectedSub.stocks.map((stock, idx) => (
                <tr key={idx}>
                  <td>{stock.symbol.replace('NSE:', '').replace('-EQ', '')}</td>
                  <td>{stock.name}</td>
                  <td>{stock.price}</td>
                  <td>{formatMcap(stock.mcap)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default App;