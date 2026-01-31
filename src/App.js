import React, { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [data, setData] = useState([]); // This will hold the sectors array
  const [benchmark, setBenchmark] = useState(null);
  const [selectedSector, setSelectedSector] = useState(null);
  const [selectedSub, setSelectedSub] = useState(null);
  const [timeframe, setTimeframe] = useState('daily'); // daily, weekly, monthly

  useEffect(() => {
    // 1. Construct the correct URL based on the environment
    // process.env.PUBLIC_URL is set automatically by React
    const basePath = process.env.PUBLIC_URL || ''; 
    const jsonUrl = `${basePath}/market_data.json`;

    console.log("Fetching data from:", jsonUrl); // Debug log

    fetch(jsonUrl)
      .then(res => {
        // 2. Check if we actually got a valid response
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        
        // 3. Check the content type before parsing
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          // This catches the HTML/Login page error
          throw new TypeError("Received HTML instead of JSON. Check Port Visibility or File Path.");
        }

        return res.json();
      })
      .then(jsonData => {
        setData(jsonData.sectors || []);
        setBenchmark(jsonData.benchmark_rrg || null);
      })
      .catch(err => {
        console.error("Fetch Error:", err);
        // Optional: Set an error state here to show in the UI
      });
  }, []);

  // Helper to get color based on RRG Quadrant
  const getQuadrantColor = (ratio, mom) => {
    if (ratio >= 100 && mom >= 100) return '#28a745'; // Leading (Green)
    if (ratio >= 100 && mom < 100) return '#ffc107';  // Weakening (Yellow)
    if (ratio < 100 && mom < 100) return '#dc3545';  // Lagging (Red)
    return '#17a2b8'; // Improving (Blue)
  };

  return (
    <div className="App" style={{ padding: '20px', fontFamily: 'Arial', backgroundColor: '#f8f9fa' }}>
      <h1>Market RRG Explorer</h1>

      {/* TIMEFRAME SELECTOR */}
      <div style={{ marginBottom: '20px' }}>
        <label><b>Timeframe: </b></label>
        {['daily', 'weekly', 'monthly'].map(tf => (
          <button key={tf} onClick={() => setTimeframe(tf)}
            style={{ margin: '0 5px', padding: '5px 15px', textTransform: 'capitalize', 
                     backgroundColor: timeframe === tf ? '#333' : '#ddd', color: timeframe === tf ? '#fff' : '#000' }}>
            {tf}
          </button>
        ))}
      </div>
      
      {/* SECTOR SELECTOR */}
      <div style={{ marginBottom: '20px' }}>
        <h3>1. Sectors:</h3>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {data.map((sec, idx) => {
            const latestRRG = sec.rrg_values[timeframe]?.slice(-1)[0];
            return (
              <button 
                key={idx} 
                onClick={() => { setSelectedSector(sec); setSelectedSub(null); }}
                style={{
                  padding: '10px', borderRadius: '5px', cursor: 'pointer', border: '1px solid #ccc',
                  background: selectedSector?.id === sec.id ? '#007bff' : 'white',
                  color: selectedSector?.id === sec.id ? 'white' : 'black',
                  borderBottom: latestRRG ? `4px solid ${getQuadrantColor(latestRRG.RS_Ratio, latestRRG.RS_Momentum)}` : 'none'
                }}
              >
                {sec.name} <br/>
                <small>{latestRRG ? `${latestRRG.RS_Ratio.toFixed(1)} / ${latestRRG.RS_Momentum.toFixed(1)}` : 'No Data'}</small>
              </button>
            );
          })}
        </div>
      </div>

      {/* SUB-SECTOR / INDUSTRY SELECTOR */}
      {selectedSector && (
        <div style={{ marginBottom: '20px' }}>
          <h3>2. Industries in {selectedSector.name}:</h3>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {selectedSector.industries.map((sub, idx) => {
              const latestRRG = sub.rrg_values[timeframe]?.slice(-1)[0];
              return (
                <button 
                  key={idx}
                  onClick={() => setSelectedSub(sub)}
                  style={{
                    padding: '8px', borderRadius: '5px', cursor: 'pointer', border: '1px solid #ccc',
                    background: selectedSub?.id === sub.id ? '#28a745' : '#e2e6ea',
                    color: selectedSub?.id === sub.id ? 'white' : 'black',
                    borderBottom: latestRRG ? `4px solid ${getQuadrantColor(latestRRG.RS_Ratio, latestRRG.RS_Momentum)}` : 'none'
                  }}
                >
                  {sub.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* RRG DATA TABLE */}
      {selectedSub && (
        <div>
          <h3>3. RRG Tail Data for {selectedSub.name}:</h3>
          <table border="1" cellPadding="10" style={{ borderCollapse: 'collapse', width: '100%', backgroundColor: 'white' }}>
            <thead>
              <tr style={{ background: '#343a40', color: 'white' }}>
                <th>Date</th>
                <th>RS Ratio</th>
                <th>RS Momentum</th>
                <th>Quadrant</th>
              </tr>
            </thead>
            <tbody>
              {(selectedSub.rrg_values[timeframe] || []).map((point, idx) => (
                <tr key={idx}>
                  <td>{point.date}</td>
                  <td>{point.RS_Ratio}</td>
                  <td>{point.RS_Momentum}</td>
                  <td style={{ 
                    fontWeight: 'bold', 
                    color: getQuadrantColor(point.RS_Ratio, point.RS_Momentum) 
                  }}>
                    {point.RS_Ratio >= 100 ? (point.RS_Momentum >= 100 ? 'Leading' : 'Weakening') : (point.RS_Momentum >= 100 ? 'Improving' : 'Lagging')}
                  </td>
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
