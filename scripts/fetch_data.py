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
RRG_TAIL = 10                # Increased tail for better visibility
MIN_STOCKS_FOR_INDEX = 2     
WINDOW_LENGTH = 14 

# Master Benchmark
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
    series.index = pd.to_datetime(series.index)
    if series.index.tz is not None:
        series.index = series.index.tz_localize(None)
    series.index = series.index.normalize()
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

# --- 2. RRG MATH ---
def calculate_rrg_metrics(price_series, benchmark_series, freq):
    try:
        if price_series.empty or benchmark_series.empty: return []

        # Normalize and Align
        p = normalize_series(price_series.copy()).squeeze()
        b = normalize_series(benchmark_series.copy()).squeeze()
        
        common = p.index.intersection(b.index)
        if len(common) < 20: return []
        p, b = p.loc[common], b.loc[common]

        # Resample
        rule = 'W-FRI' if freq == 'weekly' else 'ME' if freq == 'monthly' else None
        if rule:
            p = p.resample(rule).last()
            b = b.resample(rule).last()
        
        combined = pd.DataFrame({'p': p, 'b': b}).dropna()
        if len(combined) < WINDOW_LENGTH: return []
        
        s_price = combined['p']
        s_bench = combined['b']

        # RRG Calc
        rs = (s_price / s_bench) * 100
        rs_mean = rs.rolling(window=WINDOW_LENGTH).mean()
        rs_std = rs.rolling(window=WINDOW_LENGTH).std(ddof=0)
        
        jrs_ratio = 100 + ((rs - rs_mean) / rs_std.replace(0, np.nan))
        
        jrs_roc = jrs_ratio.diff(1) 
        jrs_roc_mean = jrs_roc.rolling(window=WINDOW_LENGTH).mean()
        jrs_roc_std = jrs_roc.rolling(window=WINDOW_LENGTH).std(ddof=0)
        
        jrs_momentum = 100 + ((jrs_roc - jrs_roc_mean) / jrs_roc_std.replace(0, np.nan))

        rrg_df = pd.DataFrame({'RS_Ratio': jrs_ratio, 'RS_Momentum': jrs_momentum}).dropna()
        if rrg_df.empty: return []

        recent = rrg_df.tail(RRG_TAIL + 1)
        
        return [
            {
                "date": date.strftime('%Y-%m-%d'),
                "x": round(float(row['RS_Ratio']), 2),
                "y": round(float(row['RS_Momentum']), 2)
            }
            for date, row in recent.iterrows()
        ]
    except Exception:
        return []

# --- 3. BUILDER & PROCESSOR ---
def process_market():
    structure = get_market_structure()
    if not structure: return

    # A. FETCH MASTER BENCHMARK
    log(f"2. Fetching Master Benchmark ({BENCHMARK_PRIMARY})...")
    master_bench = yf.download(BENCHMARK_PRIMARY, period=f"{HISTORY_DAYS}d", progress=False, auto_adjust=True)['Close']
    if master_bench.empty:
        master_bench = yf.download(BENCHMARK_FALLBACK, period=f"{HISTORY_DAYS}d", progress=False, auto_adjust=True)['Close']
    master_bench = normalize_series(master_bench)

    final_output = {
        "last_updated": datetime.now().strftime('%Y-%m-%d'),
        "benchmark_name": BENCHMARK_PRIMARY if not master_bench.empty else BENCHMARK_FALLBACK,
        "sectors": []
    }

    frequencies = ['daily', 'weekly', 'monthly']

    for sector in structure:
        sec_name = sector['name']
        log(f"   Processing Sector: {sec_name}")

        # 1. Build Industry Histories First
        industry_indices = [] # List of Series
        industry_mcaps = []
        temp_industries = [] # Store data temporarily

        for industry in sector['industries']:
            tickers = [s['symbol'] for s in industry['stocks']]
            try:
                df = yf.download(tickers, period=f"{HISTORY_DAYS}d", progress=False, auto_adjust=True)['Close']
                if isinstance(df, pd.Series): df = df.to_frame()
                df = normalize_series(df)
                df = df.dropna(axis=1, how='all')
                
                valid_tickers = df.columns.intersection(tickers)
                if len(valid_tickers) == 0: continue

                # Create Industry Index
                subset_stocks = [s for s in industry['stocks'] if s['symbol'] in valid_tickers]
                total_mcap = sum(s['mcap'] for s in subset_stocks)
                weights = {s['symbol']: (s['mcap'] / total_mcap) for s in subset_stocks}
                
                weighted_df = pd.DataFrame()
                for sym in valid_tickers:
                    weighted_df[sym] = df[sym] * weights[sym]
                
                ind_index = weighted_df.sum(axis=1)
                if ind_index.sum() == 0: continue
                ind_index = ind_index / ind_index.iloc[0] * 100

                industry_indices.append(ind_index)
                industry_mcaps.append(total_mcap)
                
                temp_industries.append({
                    "meta": industry, 
                    "history": ind_index, 
                    "stock_data": df, # Keep raw prices for stock level RRG
                    "valid_tickers": valid_tickers
                })
            except Exception: continue

        # 2. Build Sector Index
        if not industry_indices: continue
        
        sec_df = pd.concat(industry_indices, axis=1)
        total_sec_mcap = sum(industry_mcaps)
        sec_weights = [m / total_sec_mcap for m in industry_mcaps]
        sec_index = sec_df.multiply(sec_weights, axis=1).sum(axis=1)

        # 3. CALCULATE RELATIVE RRG
        
        # Level 1: Sector vs Master Benchmark
        sec_rrg = {}
        for freq in frequencies:
            sec_rrg[freq] = calculate_rrg_metrics(sec_index, master_bench, freq)

        processed_industries = []
        for item in temp_industries:
            ind_meta = item['meta']
            ind_history = item['history']
            
            # Level 2: Industry vs SECTOR INDEX (Not Master)
            ind_rrg = {}
            for freq in frequencies:
                ind_rrg[freq] = calculate_rrg_metrics(ind_history, sec_index, freq)

            # Level 3: Stocks vs INDUSTRY INDEX
            processed_stocks = []
            for sym in item['valid_tickers']:
                stock_meta = next(s for s in ind_meta['stocks'] if s['symbol'] == sym)
                stock_price = item['stock_data'][sym]
                
                stock_rrg = {}
                for freq in frequencies:
                    stock_rrg[freq] = calculate_rrg_metrics(stock_price, ind_history, freq)
                
                if stock_rrg['daily']: # Only add if valid
                    processed_stocks.append({
                        "symbol": sym,
                        "name": stock_meta['name'],
                        "mcap": stock_meta['mcap'],
                        "rrg_data": stock_rrg
                    })

            processed_industries.append({
                "id": f"ind_{ind_meta['name']}",
                "name": ind_meta['name'],
                "rrg_data": ind_rrg,
                "stocks": processed_stocks
            })

        final_output['sectors'].append({
            "id": f"sec_{sec_name}",
            "name": sec_name,
            "rrg_data": sec_rrg,
            "industries": processed_industries
        })

    # Save
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(final_output, f, indent=2)
    log(f"SUCCESS! Relative RRG data saved to {OUTPUT_FILE}")

if __name__ == "__main__":
    process_market()