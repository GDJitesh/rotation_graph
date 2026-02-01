import requests
import yfinance as yf
import pandas as pd
import numpy as np
import json
import os
from datetime import datetime

# --- CONFIGURATION ---
TEST_MODE = False             
TEST_SECTOR = "Automobile"
OUTPUT_FILE = "public/market_data.json"
HISTORY_DAYS = 600
RRG_TAIL = 6
MIN_STOCKS_FOR_INDEX = 2     
WINDOW_LENGTH = 14 # Standard JdK lookback is often 10 or 14

# Benchmark
BENCHMARK_PRIMARY = "^CRSLDX" 
BENCHMARK_FALLBACK = "^NSEI"

# Endpoints
URL_SECTOR = "https://api-t1.fyers.in/indus/data/v1/get-sector"
URL_STOCKS = "https://api-t1.fyers.in/indus/data/v1/get-stocks"

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

# --- HELPER: FORCE DATE ALIGNMENT ---
def normalize_series(series):
    if series.empty: return series
    # 1. Convert index to Datetime
    series.index = pd.to_datetime(series.index)
    # 2. Strip Timezone
    if series.index.tz is not None:
        series.index = series.index.tz_localize(None)
    # 3. Normalize to Midnight
    series.index = series.index.normalize()
    # 4. Sort to be safe
    return series.sort_index()

# --- 1. DATA HARVESTING ---
def get_market_structure():
    log("1. Fetching Fyers Sector Hierarchy...")
    try:
        sectors = requests.get(URL_SECTOR).json()['data']
        structure = []
        for sec in sectors:
            if TEST_MODE and TEST_SECTOR not in sec['name']: continue
            sec_data = {"name": sec['name'], "code": sec['code'], "industries": []}
            if 'sub_sectors' in sec:
                for sub in sec['sub_sectors']:
                    params = {'sector': sec['code'], 'subsector': sub['code'], 'sort_by': 'market_cap', 'sort_type': 'dsc', 'page': 1}
                    stocks = requests.get(URL_STOCKS, params=params).json().get('data', [])
                    valid_stocks = []
                    for s in stocks:
                        yf_sym = s['ex_sym'].replace('NSE:', '').replace('-EQ', '') + ".NS"
                        mcap = s.get('market_cap', 0)
                        if mcap > 0:
                            valid_stocks.append({"symbol": yf_sym, "name": s['description'], "mcap": mcap})
                    if valid_stocks:
                        sec_data["industries"].append({"name": sub['name'], "stocks": valid_stocks})
            if sec_data["industries"]:
                structure.append(sec_data)
        return structure
    except Exception as e:
        log(f"Error fetching structure: {e}")
        return []

# --- 3. RRG MATH (Moved up so it can be called inside build_indices) ---
def calculate_rrg_metrics(price_series, benchmark_series, freq):
    try:
        if price_series.empty or benchmark_series.empty:
            return []

        # 1. Force both to be 1D Series and Normalize
        p = normalize_series(price_series.copy()).squeeze()
        b = normalize_series(benchmark_series.copy()).squeeze()
        
        # Intersection
        common = p.index.intersection(b.index)
        if len(common) < 20: return []
        p, b = p.loc[common], b.loc[common]

        # 2. Resample
        rule = 'W-FRI' if freq == 'weekly' else 'ME' if freq == 'monthly' else None
        if rule:
            p = p.resample(rule).last()
            b = b.resample(rule).last()
        
        # Align again
        combined = pd.DataFrame({'p': p, 'b': b}).dropna()
        if len(combined) < WINDOW_LENGTH: return []
        
        s_price = combined['p']
        s_bench = combined['b']

        # 3. JdK RRG Math
        rs = (s_price / s_bench) * 100
        
        # RS-Ratio (Trend) - Normalized using StdDev (JdK Style)
        # Note: Classic RRG uses 100 + ( (RS - MA) / STD )
        rs_mean = rs.rolling(window=WINDOW_LENGTH).mean()
        rs_std = rs.rolling(window=WINDOW_LENGTH).std(ddof=0)
        
        # Avoid division by zero
        jrs_ratio = 100 + ((rs - rs_mean) / rs_std.replace(0, np.nan))
        
        # RS-Momentum (ROC of the Ratio)
        # JdK calculates momentum of the Ratio, not the Price
        jrs_roc = jrs_ratio.diff(1) 
        jrs_roc_mean = jrs_roc.rolling(window=WINDOW_LENGTH).mean()
        jrs_roc_std = jrs_roc.rolling(window=WINDOW_LENGTH).std(ddof=0)
        
        jrs_momentum = 100 + ((jrs_roc - jrs_roc_mean) / jrs_roc_std.replace(0, np.nan))

        # 4. Final Structure
        rrg_df = pd.DataFrame({
            'RS_Ratio': jrs_ratio, 
            'RS_Momentum': jrs_momentum
        }).dropna()

        if rrg_df.empty: return []

        recent = rrg_df.tail(RRG_TAIL + 1) # +1 to show trajectory
        
        return [
            {
                "date": date.strftime('%Y-%m-%d'),
                "x": round(float(row['RS_Ratio']), 2), # x axis
                "y": round(float(row['RS_Momentum']), 2) # y axis
            }
            for date, row in recent.iterrows()
        ]

    except Exception as e:
        # log(f"Error in RRG ({freq}): {e}")
        return []

# --- 2. INDICES & HISTORY ---
def build_indices(structure):
    log("2. Building History & Calculating Stock RRG...")
    
    # FETCH BENCHMARK
    log(f"   Fetching Benchmark: Nifty 500 ({BENCHMARK_PRIMARY})...")
    bench_df = yf.download(BENCHMARK_PRIMARY, period=f"{HISTORY_DAYS}d", progress=False, auto_adjust=True)['Close']
    
    if bench_df.empty:
        log(f"   ⚠️ Nifty 500 unavailable. Falling back to Nifty 50 ({BENCHMARK_FALLBACK})...")
        bench_df = yf.download(BENCHMARK_FALLBACK, period=f"{HISTORY_DAYS}d", progress=False, auto_adjust=True)['Close']
    
    bench_df = normalize_series(bench_df)
    
    final_data = []
    
    for sector in structure:
        sec_name = sector['name']
        log(f"   Processing Sector: {sec_name}")
        
        sector_indices = []
        sector_mcaps = []
        processed_industries = []
        
        for industry in sector['industries']:
            ind_name = industry['name']
            stocks = industry['stocks']
            tickers = [s['symbol'] for s in stocks]
            
            try:
                # Batch Download
                df = yf.download(tickers, period=f"{HISTORY_DAYS}d", progress=False, auto_adjust=True)['Close']
                if isinstance(df, pd.Series): df = df.to_frame()
                df = normalize_series(df)
                df = df.dropna(axis=1, how='all')
                
                valid_tickers = df.columns.intersection(tickers)
                if not len(valid_tickers): continue

                # ---------------------------------------------------------
                # NEW: PROCESS INDIVIDUAL STOCKS HERE
                # ---------------------------------------------------------
                processed_stocks = []
                frequencies = ['daily', 'weekly', 'monthly']

                for sym in valid_tickers:
                    # Get Metadata from Fyers List
                    meta = next((s for s in stocks if s['symbol'] == sym), None)
                    if not meta: continue

                    # Calculate Stock RRG
                    stock_rrg = {}
                    for freq in frequencies:
                        # Pass the single stock series vs benchmark
                        stock_rrg[freq] = calculate_rrg_metrics(df[sym], bench_df, freq)
                    
                    # Only add if we successfully calculated Daily RRG (implies valid data)
                    if stock_rrg['daily']:
                        processed_stocks.append({
                            "symbol": sym,
                            "name": meta['name'],
                            "mcap": meta['mcap'],
                            "rrg_data": stock_rrg
                        })

                # ---------------------------------------------------------
                # SYNTHETIC INDEX LOGIC (As Before)
                # ---------------------------------------------------------
                if len(valid_tickers) < MIN_STOCKS_FOR_INDEX:
                    single_sym = valid_tickers[0]
                    ind_history = df[single_sym]
                    stock_obj = [s for s in stocks if s['symbol'] == single_sym][0]
                    display_name = f"{stock_obj['name']} (Stock)"
                    is_index = False
                else:
                    subset_stocks = [s for s in stocks if s['symbol'] in valid_tickers]
                    total_mcap = sum(s['mcap'] for s in subset_stocks)
                    weights = {s['symbol']: (s['mcap'] / total_mcap) for s in subset_stocks}
                    
                    weighted_df = pd.DataFrame()
                    for sym in valid_tickers:
                        weighted_df[sym] = df[sym] * weights[sym]
                    
                    ind_history = weighted_df.sum(axis=1)
                    if ind_history.sum() == 0: ind_history = pd.Series()
                    
                    if not ind_history.empty:
                        ind_history = ind_history / ind_history.iloc[0] * 100
                    display_name = ind_name
                    is_index = True
                
                if not ind_history.empty:
                    sector_indices.append(ind_history)
                    mcap_sum = sum(s['mcap'] for s in stocks if s['symbol'] in valid_tickers)
                    sector_mcaps.append(mcap_sum)
                    
                    # Store Industry Data (History for RRG calc later, Stocks list for UI)
                    processed_industries.append({
                        "id": f"ind_{ind_name}",
                        "name": display_name,
                        "is_index": is_index,
                        "history": ind_history,
                        "stocks": processed_stocks  # <--- ATTACHED STOCKS
                    })

            except Exception as e:
                # log(f"     Failed {ind_name}: {e}")
                continue

        if sector_indices:
            sec_df = pd.concat(sector_indices, axis=1)
            total_sec_mcap = sum(sector_mcaps)
            sec_weights = [m / total_sec_mcap for m in sector_mcaps]
            weighted_sec = sec_df.multiply(sec_weights, axis=1).sum(axis=1)
            
            final_data.append({
                "id": f"sec_{sec_name}",
                "name": sec_name,
                "history": weighted_sec,
                "industries": processed_industries
            })
            
    return final_data, bench_df

# --- 4. INTEGRATION & OUTPUT ---
def process_all_rrg_values(final_data, bench_df):
    log("3. Calculating Sector/Industry RRG values...")
    output_structure = []
    frequencies = ['daily', 'weekly', 'monthly']

    for item in final_data:
        # 1. Sector RRG
        item_rrg_data = {}
        for freq in frequencies:
            item_rrg_data[freq] = calculate_rrg_metrics(item['history'], bench_df, freq)
        
        processed_industries_output = []
        for industry in item['industries']:
            # 2. Industry RRG
            ind_rrg_data = {}
            for freq in frequencies:
                ind_rrg_data[freq] = calculate_rrg_metrics(industry['history'], bench_df, freq)
            
            # Construct Final Industry Object
            industry_output = {
                "id": industry['id'],
                "name": industry['name'],
                "is_index": industry['is_index'],
                "rrg_data": ind_rrg_data, # Consistent Naming
                "stocks": industry['stocks'] # Already calculated in build_indices
            }
            processed_industries_output.append(industry_output)
        
        sector_output = {
            "id": item['id'],
            "name": item['name'],
            "rrg_data": item_rrg_data,
            "industries": processed_industries_output
        }
        output_structure.append(sector_output)
    
    final_json_output = {
        "last_updated": datetime.now().strftime('%Y-%m-%d'),
        "benchmark": BENCHMARK_PRIMARY if not bench_df.empty else BENCHMARK_FALLBACK,
        "sectors": output_structure
    }

    # Output to JSON
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(final_json_output, f, indent=2) # indent=2 saves space vs 4
    
    log(f"SUCCESS! RRG data (Sectors, Industries, Stocks) saved to {OUTPUT_FILE}")


# --- MAIN EXECUTION ---
if __name__ == "__main__":
    structure = get_market_structure()
    if structure:
        final_data, bench_df = build_indices(structure)
        if not bench_df.empty and final_data:
            process_all_rrg_values(final_data, bench_df)