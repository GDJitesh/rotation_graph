import React, { useState } from 'react';

const Sidebar = ({ data, onSelect }) => {
  const [expandedSector, setExpandedSector] = useState(null);
  const [expandedIndustry, setExpandedIndustry] = useState(null);

  const toggleSector = (secId) => {
    setExpandedSector(expandedSector === secId ? null : secId);
    setExpandedIndustry(null); // Close inner folders when switching sectors
  };

  const toggleIndustry = (indId) => {
    setExpandedIndustry(expandedIndustry === indId ? null : indId);
  };

  // Styles for the "Big Box"
  const styles = {
    container: {
      width: '20%',
      height: '100vh',
      overflowY: 'auto',
      backgroundColor: '#f8f9fa',
      borderRight: '1px solid #ddd',
      padding: '10px',
      fontFamily: 'Arial, sans-serif'
    },
    item: { cursor: 'pointer', padding: '8px', borderRadius: '4px' },
    sector: { fontWeight: 'bold', color: '#2c3e50', backgroundColor: '#e9ecef', marginBottom: '4px' },
    industry: { paddingLeft: '20px', color: '#495057', fontSize: '0.95em' },
    stock: { paddingLeft: '40px', color: '#6c757d', fontSize: '0.85em', display: 'flex', justifyContent: 'space-between' },
    active: { backgroundColor: '#007bff', color: 'white' }
  };

  return (
    <div style={styles.container}>
      <h3 style={{ paddingLeft: '8px' }}>Market Map</h3>
      
      {data.sectors.map((sector) => (
        <div key={sector.id}>
          {/* LEVEL 1: SECTOR */}
          <div 
            style={{ ...styles.item, ...styles.sector }}
            onClick={() => { toggleSector(sector.id); onSelect(sector, 'sector'); }}
          >
            {expandedSector === sector.id ? "▼ " : "▶ "} {sector.name}
          </div>

          {/* LEVEL 2: INDUSTRIES (Only if expanded) */}
          {expandedSector === sector.id && sector.industries.map((ind) => (
            <div key={ind.id}>
              <div 
                style={{ 
                  ...styles.item, ...styles.industry,
                  ...(expandedIndustry === ind.id ? {fontWeight: 'bold'} : {})
                }}
                onClick={(e) => { 
                  e.stopPropagation(); 
                  toggleIndustry(ind.id); 
                  onSelect(ind, 'industry'); 
                }}
              >
                {expandedIndustry === ind.id ? "▼ " : "▶ "} {ind.name}
              </div>

              {/* LEVEL 3: STOCKS (Only if expanded) */}
              {expandedIndustry === ind.id && ind.stocks.map((stock) => (
                <div 
                  key={stock.symbol} 
                  style={styles.item}
                  onClick={(e) => {
                    e.stopPropagation();
                    // Optional: You could allow selecting single stock here
                  }}
                >
                  <div style={styles.stock}>
                    <span>{stock.name}</span>
                    <span>{stock.mcap ? (stock.mcap / 10000000).toFixed(0) + 'Cr' : ''}</span>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

export default Sidebar;