"""
Deriv Trading Agent — Statistical Backtest
==========================================
Run from project root:
    pip install requests pandas numpy scikit-learn
    python scripts/backtest.py

Steps:
  1. Naive baseline on large historical EUR/USD dataset
  2. Logistic regression on same dataset (80/20 train/test, no leakage)
  3. LLM agent secondary observation (n=36, with ±CI caveat)
  4. Honest summary + CV bullet
"""

import os, sys, math
from collections import Counter

try:
    import requests
    import pandas as pd
    import numpy as np
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import accuracy_score, classification_report
    from sklearn.preprocessing import StandardScaler
except ImportError:
    print("Run: pip install requests pandas numpy scikit-learn")
    sys.exit(1)

# ── Load credentials from .env.local ─────────────────────────────────────────
SUPABASE_URL = SUPABASE_ANON_KEY = TWELVE_KEY = ""
env_path = os.path.join(os.path.dirname(__file__), "..", ".env.local")
if os.path.exists(env_path):
    for line in open(env_path):
        line = line.strip()
        if line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        v = v.split("#")[0].strip()
        if k == "NEXT_PUBLIC_SUPABASE_URL":      SUPABASE_URL = v
        if k == "NEXT_PUBLIC_SUPABASE_ANON_KEY": SUPABASE_ANON_KEY = v
        if k == "TWELVE_DATA_API_KEY":           TWELVE_KEY = v

if not all([SUPABASE_URL, SUPABASE_ANON_KEY, TWELVE_KEY]):
    print("ERROR: Missing keys in .env.local"); sys.exit(1)

SB_HDR = {"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {SUPABASE_ANON_KEY}"}
LOG = []

def log(msg=""):
    print(msg)
    LOG.append(str(msg))

def section(title):
    log(); log("=" * 62)
    log(f"  {title}")
    log("=" * 62)

# ─────────────────────────────────────────────────────────────────────────────
# STEP 0 — Pull LLM decisions from Supabase (secondary, caveated)
# ─────────────────────────────────────────────────────────────────────────────
section("STEP 0 — Pulling LLM agent data from Supabase")

try:
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/agent_memory"
        "?select=action,confidence,outcome,created_at&limit=500&order=created_at.asc",
        headers=SB_HDR, timeout=10
    )
    r.raise_for_status()
    memory_raw = r.json()
    log(f"  agent_memory rows  : {len(memory_raw)}")

    r2 = requests.get(
        f"{SUPABASE_URL}/rest/v1/trades"
        "?select=action,entry_price,exit_price,pnl,status,created_at&limit=500",
        headers=SB_HDR, timeout=10
    )
    r2.raise_for_status()
    trades_raw = r2.json()
    log(f"  trades rows        : {len(trades_raw)}")

    closed_trades = [t for t in trades_raw if t.get("status") == "CLOSED"]
    log(f"  closed trades      : {len(closed_trades)}")
    ac = Counter(m["action"] for m in memory_raw)
    log(f"  action breakdown   : {dict(ac)}")

except Exception as e:
    log(f"  WARNING: Could not reach Supabase: {e}")
    log("  → Will skip LLM comparison. Continuing with statistical analysis.")
    memory_raw, trades_raw, closed_trades = [], [], []

N_DECISIONS = len(memory_raw)
N_TRADES    = len(trades_raw)
N_CLOSED    = len(closed_trades)

# ─────────────────────────────────────────────────────────────────────────────
# STEP 1 — Fetch large historical dataset from Twelve Data
#           Using 1-hour candles, outputsize=5000 → ~7 months of history
# ─────────────────────────────────────────────────────────────────────────────
section("STEP 1 — Fetching EUR/USD 1-hour candles (up to 5000 periods)")

log("  Interval: 1h (gives more history than 5-min on free tier)")
log("  Output size requested: 5000 candles (~7 months)")

try:
    resp = requests.get(
        "https://api.twelvedata.com/time_series",
        params=dict(symbol="EUR/USD", interval="1h",
                    outputsize=5000, apikey=TWELVE_KEY),
        timeout=20
    )
    resp.raise_for_status()
    td = resp.json()
    if td.get("status") == "error":
        raise ValueError(td.get("message", "Twelve Data error"))

    candles = td.get("values", [])
    log(f"  Candles returned   : {len(candles)}")

    df = pd.DataFrame(candles)
    df["datetime"] = pd.to_datetime(df["datetime"])
    df = df.sort_values("datetime").reset_index(drop=True)
    for col in ["open","high","low","close"]:
        df[col] = df[col].astype(float)

    log(f"  Date range         : {df['datetime'].iloc[0].date()} → {df['datetime'].iloc[-1].date()}")

except Exception as e:
    log(f"ERROR fetching Twelve Data: {e}"); sys.exit(1)

# ─────────────────────────────────────────────────────────────────────────────
# Feature engineering
# ─────────────────────────────────────────────────────────────────────────────
log("\n  Building features...")

df["return"] = df["close"].pct_change()

# Current candle direction (1=up, 0=down/flat) — used ONLY as naive baseline predictor.
# "direction[t]" is the direction of the candle we just closed; it is known at time t
# and is the simplest possible predictor for what the NEXT candle will do.
df["direction"] = (df["return"] > 0).astype(int)

# ── Target: NEXT candle direction (not current) ───────────────────────────
# IMPORTANT: We predict direction[t+1] using features known at time t.
# Predicting direction[t] with features that include close[t] (RSI, SMA, etc.)
# causes data leakage — the model can trivially infer close[t] > close[t-1]
# from features containing close[t]. The first run of this script produced
# 95.88% accuracy due to exactly this leakage via momentum5, RSI, and SMA.
# Fix: shift target back by 1 so we always predict the NEXT unseen candle.
df["next_direction"] = (df["return"].shift(-1) > 0).astype(float)  # 1=up next candle

# Features at time t — all use data known BEFORE the next candle opens
for lag in range(1, 6):
    df[f"ret_lag_{lag}"] = df["return"].shift(lag)

# RSI-14 at time t (uses close[t] and earlier — fine, candle t is closed)
delta = df["close"].diff()
gain  = delta.clip(lower=0).rolling(14).mean()
loss  = (-delta.clip(upper=0)).rolling(14).mean()
df["rsi"] = 100 - (100 / (1 + gain / loss.replace(0, np.nan)))
df["rsi_norm"] = (df["rsi"] - 50) / 50

# Distance of close[t] from SMA-20 (also fine — candle t is closed)
df["sma20"]     = df["close"].rolling(20).mean()
df["close_sma"] = (df["close"] - df["sma20"]) / df["sma20"]

# H-L range at time t (volatility proxy, candle t is closed)
df["hl_range"] = (df["high"] - df["low"]) / df["close"]

# 5-period momentum at time t: close[t] - close[t-5] (fine, t is closed)
df["momentum5"] = df["close"] - df["close"].shift(5)

# Drop NaN from shifts + the last row (no next_direction for final candle)
df.dropna(inplace=True)
df.reset_index(drop=True, inplace=True)
log(f"  Rows after dropping NaN : {len(df)}")
log("  ⚠ NOTE: Target is next-candle direction to prevent data leakage.")

FEATURES = ["ret_lag_1","ret_lag_2","ret_lag_3","ret_lag_4","ret_lag_5",
            "rsi_norm","close_sma","hl_range","momentum5"]

SPLIT = int(len(df) * 0.80)
df_train = df.iloc[:SPLIT].copy()
df_test  = df.iloc[SPLIT:].copy()
log(f"  Train rows: {len(df_train)}  |  Test rows: {len(df_test)}  (80/20 split)")

# ─────────────────────────────────────────────────────────────────────────────
# STEP 2 — Naive baseline (direction persistence) — LOCKED before model build
# ─────────────────────────────────────────────────────────────────────────────
section("STEP 2 — Naive baseline (direction persistence) — PRIMARY BENCHMARK")

log("  Strategy : predict next candle direction = current candle direction")
log("  Evaluated on TEST set only (last 20% of data, unseen during baseline definition)")

# Naive baseline: predict next candle direction = current candle direction
# naive_preds[t]  = direction[t]       (what we know now)
# naive_actual[t] = next_direction[t]  (what actually happened next)
naive_preds  = df_test["direction"].astype(int).values
naive_actual = df_test["next_direction"].astype(int).values
naive_acc    = accuracy_score(naive_actual, naive_preds)

majority_cls = int(pd.Series(naive_actual).mode()[0])
majority_acc = accuracy_score(naive_actual, [majority_cls]*len(naive_actual))

up_pct = pd.Series(naive_actual).mean() * 100
log(f"\n  Test set size            : {len(df_test)} candles")
log(f"  % of up-candles in test  : {up_pct:.1f}%")
log(f"  Majority class baseline  : {majority_acc*100:.2f}%  (always predict {'UP' if majority_cls else 'DOWN'})")
log(f"  Direction persistence    : {naive_acc*100:.2f}%  ← PRIMARY NAIVE BASELINE (LOCKED)")
log()
log("  ✓ Baseline locked. Building model now.")

# ─────────────────────────────────────────────────────────────────────────────
# STEP 3 — Logistic regression — fit on TRAIN, evaluate on TEST (no leakage)
# ─────────────────────────────────────────────────────────────────────────────
section("STEP 3 — Logistic regression model")

log(f"  Model    : LogisticRegression (L2, C=1.0, max_iter=1000)")
log(f"  Features : {FEATURES}")
log(f"  Scaling  : StandardScaler — fitted on TRAIN only, applied to TEST")
log(f"  NOTE     : Model fitted once. Test set NOT used for tuning.")

X_train = df_train[FEATURES].values
y_train = df_train["next_direction"].astype(int).values   # ← NEXT candle, no leakage
X_test  = df_test[FEATURES].values
y_test  = df_test["next_direction"].astype(int).values    # ← NEXT candle, no leakage

scaler   = StandardScaler().fit(X_train)
X_tr_s   = scaler.transform(X_train)
X_te_s   = scaler.transform(X_test)

model    = LogisticRegression(C=1.0, max_iter=1000, random_state=42)
model.fit(X_tr_s, y_train)

lr_preds = model.predict(X_te_s)
lr_acc   = accuracy_score(y_test, lr_preds)

delta_vs_naive    = (lr_acc - naive_acc) * 100
delta_vs_majority = (lr_acc - majority_acc) * 100

log(f"\n  Logistic regression accuracy (test) : {lr_acc*100:.2f}%")
log(f"  Naive baseline accuracy (test)      : {naive_acc*100:.2f}%")
log(f"  Majority class baseline             : {majority_acc*100:.2f}%")
log(f"\n  LR vs naive baseline  : {delta_vs_naive:+.2f} percentage points")
log(f"  LR vs majority class  : {delta_vs_majority:+.2f} percentage points")

if abs(delta_vs_naive) < 1.0:
    log("\n  HONEST FINDING: LR does not meaningfully beat the naive baseline.")
    log("  This is the expected result for short-horizon FX data under EMH.")
    log("  Not a failure — it means the market is efficiently priced at this timeframe.")
elif delta_vs_naive > 0:
    log(f"\n  LR beats naive baseline by {delta_vs_naive:.2f}pp. Modest improvement — interpret carefully.")
else:
    log(f"\n  LR underperforms naive baseline by {abs(delta_vs_naive):.2f}pp. Report as-is.")

log("\n  Classification report (test set):")
log(classification_report(y_test, lr_preds, target_names=["DOWN/FLAT","UP"]))

log("  Feature importances (by absolute coefficient):")
for feat, coef in sorted(zip(FEATURES, model.coef_[0]), key=lambda x: abs(x[1]), reverse=True):
    bar = "█" * int(abs(coef) * 40)
    log(f"    {feat:<16} {coef:+.4f}  {bar}")

# ─────────────────────────────────────────────────────────────────────────────
# STEP 4 — LLM agent secondary observation (CAVEATED, n is small)
# ─────────────────────────────────────────────────────────────────────────────
section("STEP 4 — LLM agent secondary observation (small-sample, caveated)")

log(f"  Total agent decisions : {N_DECISIONS}")
log(f"  Total trades logged   : {N_TRADES}  (closed: {N_CLOSED})")
log()

# Confidence interval for binary proportion at 95%
def wilson_ci(wins, n, z=1.96):
    if n == 0: return (0.0, 0.0)
    p = wins / n
    denom = 1 + z**2/n
    centre = (p + z**2/(2*n)) / denom
    half   = (z * math.sqrt(p*(1-p)/n + z**2/(4*n**2))) / denom
    return max(0.0, centre - half), min(1.0, centre + half)

directional = [m for m in memory_raw if m.get("action") in ("BUY","SELL")]
N_DIR = len(directional)
log(f"  BUY/SELL decisions only (HOLD excluded — not directional) : {N_DIR}")

if N_DIR > 0:
    buy_n  = sum(1 for m in directional if m["action"] == "BUY")
    sell_n = N_DIR - buy_n
    log(f"    BUY  : {buy_n}  |  SELL : {sell_n}")

resolved = [m for m in memory_raw if m.get("outcome") in ("WIN","LOSS")]
N_RES = len(resolved)
log(f"\n  Resolved outcomes (WIN/LOSS, not PENDING) : {N_RES}")

if N_RES > 0:
    wins    = sum(1 for m in resolved if m["outcome"] == "WIN")
    llm_wr  = wins / N_RES
    lo, hi  = wilson_ci(wins, N_RES)
    log(f"  Win rate              : {llm_wr*100:.1f}%  ({wins}/{N_RES})")
    log(f"  95% Wilson CI         : [{lo*100:.1f}%, {hi*100:.1f}%]  (width: {(hi-lo)*100:.1f}pp)")
    log()
    log("  ⚠  CAVEAT: With n={}, the 95% CI spans {:.0f}pp.".format(N_RES, (hi-lo)*100))
    log("     Any win-rate claim from this sample has very wide uncertainty.")
    log("     This is an EXPLORATORY OBSERVATION only, not a statistically")
    log("     confident finding. Do not present it as a headline result.")
    # Rough magnitude comment
    if N_RES < 30:
        log(f"     You need ~{30-N_RES} more resolved trades for even basic significance.")
else:
    log("  No resolved outcomes yet — LLM win rate cannot be computed.")
    llm_wr, lo, hi = None, None, None

# ─────────────────────────────────────────────────────────────────────────────
# STEP 5 — Methodology log
# ─────────────────────────────────────────────────────────────────────────────
section("STEP 5 — Full methodology log")

log("""  WHAT WAS TRIED
  ──────────────────────────────────────────────────────────
  Data source   : Twelve Data REST API, EUR/USD 1-hour candles
  Sample size   : ~5000 candles requested (varies by plan/availability)
  Train/test    : 80% chronological train / 20% held-out test
                  (chronological split — no look-ahead bias)
  Baseline      : Direction persistence (predict next = current direction)
                  Locked BEFORE model was built.
  Model         : Logistic Regression, L2 regularisation, C=1.0
  Features      : 5 lagged returns, RSI-14 (normalised), close vs SMA-20,
                  H-L range, 5-period momentum
  Scaling       : StandardScaler fitted on train only. Applied to test.
  Tuning        : None. Model was fitted once and evaluated once.

  WHY LOGISTIC REGRESSION (NOT ARIMA)
  ──────────────────────────────────────────────────────────
  ARIMA predicts the price level, not direction.
  Converting ARIMA output to a directional prediction adds noise.
  Logistic regression directly predicts the binary outcome (up/down)
  and is simpler to explain in an interview without sacrificing rigour.

  HONEST EXPECTED RESULT
  ──────────────────────────────────────────────────────────
  EUR/USD 1-hour returns are very close to a random walk.
  Accuracy near 50% is the theoretical expectation under the
  Efficient Market Hypothesis. Not beating the naive baseline
  is a legitimate, common result — not a failure of methodology.""")

# ─────────────────────────────────────────────────────────────────────────────
# STEP 6 — Final summary
# ─────────────────────────────────────────────────────────────────────────────
section("STEP 6 — Final Summary (bring this to your next conversation)")

llm_line = "N/A — no resolved outcomes yet"
ci_line  = ""
if llm_wr is not None:
    llm_line = f"{llm_wr*100:.1f}%  (n={N_RES}, 95% CI: [{lo*100:.1f}%, {hi*100:.1f}%])"
    ci_line  = f"n={N_RES}, 95% Wilson CI [{lo*100:.1f}%–{hi*100:.1f}%], {(hi-lo)*100:.0f}pp width"

log(f"""
  SUPABASE DATA
  Agent decisions logged : {N_DECISIONS}
  Trades logged          : {N_TRADES}  (closed: {N_CLOSED})

  PRIMARY RESULT — Statistical model on full historical dataset
  Dataset                : EUR/USD 1-hour candles, Twelve Data
  Candles (after NaN drop): {len(df)}
  Date range             : {df['datetime'].iloc[0].date()} → {df['datetime'].iloc[-1].date()}
  Train / test split     : 80% / 20% (chronological, no leakage)
  Majority class baseline: {majority_acc*100:.2f}%
  Direction persistence  : {naive_acc*100:.2f}%  ← naive baseline (LOCKED first)
  Logistic regression    : {lr_acc*100:.2f}%  ({delta_vs_naive:+.2f}pp vs naive baseline)
  Features               : lagged returns (×5), RSI-14, SMA-20 deviation,
                           H-L range, 5-period momentum
  Tuning                 : None — single fit, single evaluation

  SECONDARY OBSERVATION — LLM agent (small sample, CAVEATED)
  LLM win rate           : {llm_line}
  Note                   : {ci_line if ci_line else "insufficient resolved trades"}
  Status                 : Exploratory only — NOT a statistically confident claim

  CV BULLET (factually accurate, interview-defensible)
  ──────────────────────────────────────────────────────────
  "Built an autonomous EUR/USD paper trading agent (Next.js 14, Groq
  llama-3.3-70b-versatile, Twelve Data, Supabase) and implemented a
  rigorous statistical backtesting layer to evaluate forecasting approaches.
  Trained a logistic regression model on {len(df)} hours of EUR/USD price
  history ({df['datetime'].iloc[0].date()} – {df['datetime'].iloc[-1].date()})
  with lagged returns, RSI, and SMA features, achieving {lr_acc*100:.1f}%
  directional accuracy on a held-out test set vs. a naive persistence
  baseline of {naive_acc*100:.1f}% — consistent with the near-random-walk
  behaviour expected under the Efficient Market Hypothesis at this timeframe.
  Applied proper ML methodology: chronological train/test split, no test-set
  tuning, and StandardScaler fitted on training data only."
""")

# Save
out = os.path.join(os.path.dirname(__file__), "backtest_results.txt")
with open(out, "w") as f: f.write("\n".join(LOG))
print(f"\n[Full log saved → scripts/backtest_results.txt]")
