import requests
import json
import os

# Configuration
OUTPUT_FILE = "public/market_data.json"
FYERS_SECTOR_URL = "https://api-t1.fyers.in/indus/data/v1/get-sector"
FYERS_STOCK_URL = "https://api-t1.fyers.in/indus/data/v1/get-stocks"

def fetch_market_data():
    print("Fetching Sector List...")
    try:
        # 1. Get Sectors
        response = requests.get(FYERS_SECTOR_URL)
        sectors = response.json().get('data', [])
        
        full_data = []

        # 2. Loop through each Sector
        for sector in sectors:
            sector_obj = {
                "name": sector['name'],
                "subsectors": []
            }
            
            # 3. Loop through Sub-sectors
            if 'sub_sectors' in sector:
                for sub in sector['sub_sectors']:
                    print(f"  Processing {sub['name']}...")
                    
                    # 4. Get Stocks for this Sub-sector
                    stock_params = {
                        'sector': sector['code'],
                        'subsector': sub['code'],
                        'sort_by': 'market_cap',
                        'sort_type': 'dsc',
                        'page': 1
                    }
                    stock_res = requests.get(FYERS_STOCK_URL, params=stock_params)
                    stock_data = stock_res.json().get('data', [])
                    
                    # Keep only relevant fields to keep file size small
                    clean_stocks = []
                    for s in stock_data[:10]: # LIMIT to Top 10 stocks per subsector for speed
                        clean_stocks.append({
                            "symbol": s['ex_sym'],
                            "name": s['description'],
                            "mcap": s.get('market_cap', 0),
                            "price": s.get('lp', 0)
                        })

                    sector_obj["subsectors"].append({
                        "name": sub['name'],
                        "stocks": clean_stocks
                    })
            
            full_data.append(sector_obj)

        # 5. Save to JSON
        os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
        with open(OUTPUT_FILE, 'w') as f:
            json.dump(full_data, f, indent=2)
        print(f"Success! Data saved to {OUTPUT_FILE}")

    except Exception as e:
        print(f"Error: {e}")
        exit(1)

if __name__ == "__main__":
    fetch_market_data()