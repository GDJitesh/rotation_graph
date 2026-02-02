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
RRG_TAIL = 10 
MIN_STOCKS_FOR_INDEX = 2     
WINDOW_LENGTH = 14 
USE_EQUAL_WEIGHT = True 

# Noise Filters
MIN_PRICE = 30           
MIN_MARKET_CAP_CR = 500  

BENCHMARK_PRIMARY = "^CRSLDX" 
BENCHMARK_FALLBACK = "^NSEI"

URL_SECTOR = "https://api-t1.fyers.in/indus/data/v1/get-sector"
URL_STOCKS = "https://api-t1.fyers.in/indus/data/v1/get-stocks"

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def normalize_series(series):
    if series.empty: return series
    series.index = pd.to_datetime(series.index)
    if series.index.tz is not None:
        series.index = series.index.tz_localize(None)
    series.index = series.index.normalize()
    return series.sort_index()

# --- NEW: MINERVINI TREND TEMPLATE CHECK ---
def check_trend_template(series):
    """
    Returns True if the series meets Minervini's Stage 2 Trend Criteria.
    """
    try:
        # Need at least 252 days (1 year) for valid 52w High/Low
        if len(series) < 252: return False 

        current_close = series.iloc[-1]

        # Calculate Moving Averages
        sma_50 = series.rolling(window=50).mean().iloc[-1]
        sma_150 = series.rolling(window=150).mean().iloc[-1]
        sma_200 = series.rolling(window=200).mean().iloc[-1]
        
        # 200 SMA Slope (Look back 20 days / ~1 month)
        sma_200_prev = series.rolling(window=200).mean().iloc[-21] 
        sma_200_trending_up = sma_200 > sma_200_prev

        # 52 Week High/Low
        high_52 = series.rolling(window=252).max().iloc[-1]
        low_52 = series.rolling(window=252).min().iloc[-1]

        # --- THE CONDITIONS ---
        # 1. Price > 150 SMA and > 200 SMA
        c1 = (current_close > sma_150) and (current_close > sma_200)
        
        # 2. 150 SMA > 200 SMA
        c2 = sma_150 > sma_200
        
        # 3. 200 SMA Trending Up
        c3 = sma_200_trending_up
        
        # 4. 50 SMA > 150 SMA and > 200 SMA
        c4 = (sma_50 > sma_150) and (sma_50 > sma_200)
        
        # 5. Price > 50 SMA (Momentum Condition - Optional but good for Leaders)
        c5 = current_close > sma_50
        
        # 6. Price >= 30% above 52-week Low
        c6 = current_close >= (low_52 * 1.30)
        
        # 7. Price within 25% of 52-week High (Near peaks)
        c7 = current_close >= (high_52 * 0.75)

        # Result
        return bool(c1 and c2 and c3 and c4 and c5 and c6 and c7)

    except Exception:
        return False

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
                        mcap_val = s.get('market_cap', 0)
                        if mcap_val < MIN_MARKET_CAP_CR: continue 

                        valid_stocks.append({
                            "symbol": yf_sym, "name": s['description'], "mcap": mcap_val
                        })
                        
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

        p = normalize_series(price_series.copy()).squeeze()
        b = normalize_series(benchmark_series.copy()).squeeze()
        
        common = p.index.intersection(b.index)
        if len(common) < 20: return []
        p, b = p.loc[common], b.loc[common]

        rule = 'W-FRI' if freq == 'weekly' else 'ME' if freq == 'monthly' else None
        if rule:
            p = p.resample(rule).last()
            b = b.resample(rule).last()
        
        combined = pd.DataFrame({'p': p, 'b': b}).dropna()
        if len(combined) < WINDOW_LENGTH: return []
        
        s_price = combined['p']
        s_bench = combined['b']

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

# --- 3. BUILDER ---
def process_market():
    structure = get_market_structure()
    if not structure: return

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

        industry_indices = [] 
        temp_industries = [] 

        for industry in sector['industries']:
            tickers = [s['symbol'] for s in industry['stocks']]
            try:
                df = yf.download(tickers, period=f"{HISTORY_DAYS}d", progress=False, auto_adjust=True)['Close']
                if isinstance(df, pd.Series): df = df.to_frame()
                df = normalize_series(df)
                df = df.dropna(axis=1, how='all')
                
                last_prices = df.iloc[-1]
                valid_tickers_by_price = last_prices[last_prices >= MIN_PRICE].index
                valid_tickers = df.columns.intersection(valid_tickers_by_price)
                
                if len(valid_tickers) == 0: continue

                subset_stocks = [s for s in industry['stocks'] if s['symbol'] in valid_tickers]
                mcaps = np.array([s['mcap'] for s in subset_stocks])
                sqrt_mcaps = np.sqrt(mcaps)
                total_sqrt_mcap = np.sum(sqrt_mcaps)
                weights_dict = {}
                for idx, s in enumerate(subset_stocks):
                    weights_dict[s['symbol']] = sqrt_mcaps[idx] / total_sqrt_mcap

                normalized_df = df[valid_tickers] / df[valid_tickers].iloc[0] * 100
                weighted_df = pd.DataFrame()
                for sym in valid_tickers:
                    weighted_df[sym] = normalized_df[sym] * weights_dict[sym]
                
                ind_index = weighted_df.sum(axis=1)
                if ind_index.sum() == 0: continue
                industry_indices.append(ind_index)
                
                # --- APPLY TREND TEMPLATE TO INDUSTRY ---
                is_ind_bullish = check_trend_template(ind_index)

                temp_industries.append({
                    "meta": industry, 
                    "history": ind_index, 
                    "stock_data": df, 
                    "valid_tickers": valid_tickers,
                    "is_bullish": is_ind_bullish
                })
            except Exception: continue

        if not industry_indices: continue
        
        sec_df = pd.concat(industry_indices, axis=1)
        sec_index = sec_df.mean(axis=1)
        
        # --- APPLY TREND TEMPLATE TO SECTOR ---
        is_sec_bullish = check_trend_template(sec_index)

        sec_rrg = { "relative": {}, "broad": {} }
        for freq in frequencies:
            res = calculate_rrg_metrics(sec_index, master_bench, freq)
            sec_rrg["relative"][freq] = res
            sec_rrg["broad"][freq] = res

        processed_industries = []
        for item in temp_industries:
            ind_meta = item['meta']
            ind_history = item['history']
            
            ind_rrg = { "relative": {}, "broad": {} }
            for freq in frequencies:
                ind_rrg["relative"][freq] = calculate_rrg_metrics(ind_history, sec_index, freq)
                ind_rrg["broad"][freq] = calculate_rrg_metrics(ind_history, master_bench, freq)

            processed_stocks = []
            for sym in item['valid_tickers']:
                stock_meta = next(s for s in ind_meta['stocks'] if s['symbol'] == sym)
                stock_price = item['stock_data'][sym]
                
                # --- APPLY TREND TEMPLATE TO STOCK ---
                is_stock_bullish = check_trend_template(stock_price)

                stock_rrg = { "relative": {}, "broad": {} }
                valid_calc = False
                for freq in frequencies:
                    stock_rrg["relative"][freq] = calculate_rrg_metrics(stock_price, ind_history, freq)
                    stock_rrg["broad"][freq] = calculate_rrg_metrics(stock_price, master_bench, freq)
                    if stock_rrg["relative"][freq]: valid_calc = True
                
                if valid_calc: 
                    processed_stocks.append({
                        "symbol": sym,
                        "name": stock_meta['name'],
                        "mcap": stock_meta['mcap'],
                        "is_bullish": is_stock_bullish,
                        "rrg_data": stock_rrg
                    })

            processed_industries.append({
                "id": f"ind_{ind_meta['name']}",
                "name": ind_meta['name'],
                "is_bullish": item['is_bullish'],
                "rrg_data": ind_rrg,
                "stocks": processed_stocks
            })

        final_output['sectors'].append({
            "id": f"sec_{sec_name}",
            "name": sec_name,
            "is_bullish": is_sec_bullish,
            "rrg_data": sec_rrg,
            "industries": processed_industries
        })

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(final_output, f, indent=2)
    log(f"SUCCESS! Minervini Trend Template Data Saved.")

if __name__ == "__main__":
    process_market()