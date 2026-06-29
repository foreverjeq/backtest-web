/* ============================================================
 * backtest.js
 * 백테스트 엔진 핵심. 가져온 가격 데이터로 자산 변화를 시뮬레이션하고
 * 수익률·리스크 지표를 계산한다. (순수 계산, 외부 호출 없음)
 * ============================================================ */

/**
 * @param {Object} cfg
 *   cfg.aligned      : Fetcher.fetchAndAlign 결과 {dates, series}
 *   cfg.weights      : {ticker: 0~1}  (합이 1)
 *   cfg.mode         : "lumpsum" | "dca" | "hybrid"
 *   cfg.initial      : 초기 투자금 ($)
 *   cfg.contribution : 정기 적립금 ($) (dca/hybrid)
 *   cfg.frequency    : "monthly" | "quarterly" | "yearly" (적립 주기)
 *   cfg.drip         : 배당 재투자 여부 (boolean)
 *   cfg.rebalance    : "none" | "yearly" | "quarterly"
 *   cfg.riskFree     : 무위험수익률 (연, 예: 0.04)
 * @returns {Object} 결과 + 지표
 */
function runBacktest(cfg) {
  const { dates, series } = cfg.aligned;
  const tickers = Object.keys(cfg.weights);
  const n = dates.length;

  // 종목별 보유 주식 수
  const shares = {};
  tickers.forEach((t) => (shares[t] = 0));

  let cash = 0;
  let totalInvested = 0;        // 실제로 넣은 돈 누적
  let totalDividends = 0;       // 받은 배당 누적
  const portfolioValues = [];   // 매월 말 자산 총액
  const investedSeries = [];    // 매월 누적 투자원금
  const dividendByYear = {};    // 연도별 배당 합계

  // 한 종목을 목표 비중만큼 매수
  const buy = (ticker, amount, price) => {
    if (amount <= 0 || price <= 0) return;
    shares[ticker] += amount / price;
  };

  // 현재 포트폴리오 총 가치
  const portfolioValue = (i) => {
    let v = cash;
    tickers.forEach((t) => (v += shares[t] * series[t].prices[i]));
    return v;
  };

  // 이번 달에 정기 적립을 하는가? (적립식/혼합만)
  const contributeAt = (i) => {
    if (cfg.mode === 'lumpsum') return false;
    if (i === 0) return true; // 첫 달은 무조건 적립
    const m = dates[i].getUTCMonth();
    if (cfg.frequency === 'monthly') return true;
    if (cfg.frequency === 'quarterly') return m % 3 === 0;
    if (cfg.frequency === 'yearly') return m === 0;
    return false;
  };

  const cashflows = []; // 매월 새로 투입한 돈 (TWR 계산용)

  for (let i = 0; i < n; i++) {
    let cfThisMonth = 0; // 이번 달 투입 금액

    // 1) 첫 달: 초기 투자금 (거치식/혼합)
    if (i === 0 && (cfg.mode === 'lumpsum' || cfg.mode === 'hybrid')) {
      cfThisMonth += cfg.initial || 0;
    }
    // 적립식인데 초기금이 있으면 그것도 첫 달에 투입
    if (i === 0 && cfg.mode === 'dca') {
      cfThisMonth += cfg.initial || 0;
    }

    // 2) 정기 적립 (적립식/혼합)
    if (contributeAt(i)) {
      cfThisMonth += cfg.contribution || 0;
    }

    // 투입금을 비중대로 매수
    if (cfThisMonth > 0) {
      totalInvested += cfThisMonth;
      tickers.forEach((t) => buy(t, cfThisMonth * cfg.weights[t], series[t].prices[i]));
    }
    cashflows.push(cfThisMonth);

    // 3) 배당 처리 (이번 달에 지급된 배당)
    // 기간을 (이전 달, 이번 달]로 잡아 이웃 달끼리 겹치지 않게 한다.
    // (예전엔 +31일 버퍼로 기간이 겹쳐 배당이 두 달에 중복 집계되는 버그가 있었음)
    const monthStart = i > 0 ? dates[i - 1].getTime() / 1000 : dates[0].getTime() / 1000 - 86400 * 31;
    const monthEnd = dates[i].getTime() / 1000;
    let monthDiv = 0;
    tickers.forEach((t) => {
      const divs = series[t].dividends;
      for (const ts in divs) {
        const tsNum = Number(ts);
        if (tsNum > monthStart && tsNum <= monthEnd) {
          const divCash = shares[t] * divs[ts];
          monthDiv += divCash;
          if (cfg.drip) {
            buy(t, divCash, series[t].prices[i]); // 같은 종목 재매수
          } else {
            cash += divCash; // 현금으로 보관
          }
        }
      }
    });
    totalDividends += monthDiv;
    const yr = dates[i].getUTCFullYear();
    dividendByYear[yr] = (dividendByYear[yr] || 0) + monthDiv;

    // 4) 리밸런싱
    if (cfg.rebalance !== 'none' && i > 0) {
      const m = dates[i].getUTCMonth();
      const doReb =
        (cfg.rebalance === 'yearly' && m === 0) ||
        (cfg.rebalance === 'quarterly' && m % 3 === 0);
      if (doReb) {
        const total = portfolioValue(i);
        tickers.forEach((t) => {
          shares[t] = (total * cfg.weights[t]) / series[t].prices[i];
        });
        cash = 0;
      }
    }

    portfolioValues.push(portfolioValue(i));
    investedSeries.push(totalInvested);
  }

  const metrics = calcMetrics({
    dates,
    portfolioValues,
    cashflows,
    totalInvested,
    totalDividends,
    riskFree: cfg.riskFree ?? 0.04,
  });

  return {
    dates,
    portfolioValues,
    investedSeries,
    totalInvested,
    totalDividends,
    dividendByYear,
    finalValue: portfolioValues[n - 1],
    metrics,
  };
}

/** 수익률·리스크 지표 계산 (시간가중수익률 기반) */
function calcMetrics({ dates, portfolioValues, cashflows, totalInvested, totalDividends, riskFree }) {
  const n = portfolioValues.length;
  const finalValue = portfolioValues[n - 1];
  const years = (dates[n - 1] - dates[0]) / (365.25 * 24 * 3600 * 1000);

  // 총 수익률 (실제 넣은 돈 대비 최종 자산)
  const totalReturn = totalInvested > 0 ? (finalValue - totalInvested) / totalInvested : 0;

  // 시간가중 월간 수익률: 이번 달 새로 넣은 돈(cashflow)은 수익에서 제외해야
  // 거치식·적립식 모두 "순수 투자 성과"를 같은 잣대로 비교할 수 있다.
  //   r_i = (V_i - CF_i) / V_{i-1} - 1
  const monthlyReturns = [];
  for (let i = 1; i < n; i++) {
    const prev = portfolioValues[i - 1];
    if (prev > 0) {
      const cf = cashflows[i] || 0;
      monthlyReturns.push((portfolioValues[i] - cf) / prev - 1);
    }
  }

  // $1을 투자했다고 가정한 순수 성과 곡선 (contribution 효과 제거)
  const growthCurve = [1];
  monthlyReturns.forEach((r) => growthCurve.push(growthCurve[growthCurve.length - 1] * (1 + r)));

  // CAGR — 순수 성과 곡선 기반 연복리
  const totalGrowth = growthCurve[growthCurve.length - 1];
  const cagr = years > 0 ? Math.pow(totalGrowth, 1 / years) - 1 : 0;

  // MDD (최대 낙폭) + 최장 낙폭기간 — 순수 성과 곡선 기준
  // (적립식은 계속 입금해서 실제 잔고는 잘 안 줄지만, 전략 자체의 위험을 보려면 성과곡선으로 측정)
  let peak = growthCurve[0];
  let mdd = 0;
  let peakIdx = 0;
  let longestRecovery = 0;
  for (let i = 0; i < growthCurve.length; i++) {
    if (growthCurve[i] > peak) {
      peak = growthCurve[i];
      peakIdx = i;
    }
    const dd = (growthCurve[i] - peak) / peak;
    if (dd < mdd) mdd = dd;
    if (growthCurve[i] < peak) {
      const months = i - peakIdx;
      if (months > longestRecovery) longestRecovery = months;
    }
  }

  // 변동성 (월간 표준편차 * sqrt(12))
  const mean = monthlyReturns.reduce((a, b) => a + b, 0) / monthlyReturns.length;
  const variance =
    monthlyReturns.reduce((a, r) => a + (r - mean) ** 2, 0) / monthlyReturns.length;
  const volatility = Math.sqrt(variance) * Math.sqrt(12);

  // 하방 변동성 (음수 수익률만)
  const downside = monthlyReturns.filter((r) => r < 0);
  const downsideVar =
    downside.length > 0
      ? downside.reduce((a, r) => a + r * r, 0) / downside.length
      : 0;
  const downsideVol = Math.sqrt(downsideVar) * Math.sqrt(12);

  // 샤프 / 소르티노 / 칼마
  const sharpe = volatility > 0 ? (cagr - riskFree) / volatility : 0;
  const sortino = downsideVol > 0 ? (cagr - riskFree) / downsideVol : 0;
  const calmar = mdd < 0 ? cagr / Math.abs(mdd) : 0;

  // 승률
  const winCount = monthlyReturns.filter((r) => r > 0).length;
  const winRate = monthlyReturns.length > 0 ? winCount / monthlyReturns.length : 0;

  return {
    totalReturn,
    cagr,
    mdd,
    volatility,
    downsideVol,
    sharpe,
    sortino,
    calmar,
    longestRecovery,
    winRate,
    years,
    totalDividends,
  };
}

/** 연도별 수익률 표 데이터 만들기 */
function calcYearlyReturns(dates, portfolioValues, dividendByYear) {
  const byYear = {}; // year -> {start, end}
  for (let i = 0; i < dates.length; i++) {
    const y = dates[i].getUTCFullYear();
    if (!byYear[y]) byYear[y] = { start: portfolioValues[i], end: portfolioValues[i] };
    byYear[y].end = portfolioValues[i];
  }
  const rows = [];
  const years = Object.keys(byYear).map(Number).sort((a, b) => a - b);
  years.forEach((y, idx) => {
    // 직전 연도 말 대비 수익률 (더 정확)
    const prevEnd = idx > 0 ? byYear[years[idx - 1]].end : byYear[y].start;
    const ret = prevEnd > 0 ? byYear[y].end / prevEnd - 1 : 0;
    rows.push({
      year: y,
      return: ret,
      value: byYear[y].end,
      dividend: dividendByYear[y] || 0,
    });
  });
  return rows;
}

window.Backtest = { runBacktest, calcYearlyReturns };
