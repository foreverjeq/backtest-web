/* ============================================================
 * fetcher.js
 * Yahoo Finance에서 월별 주가(수정종가)와 배당 데이터를 가져온다.
 * 브라우저 CORS 제한을 우회하기 위해 여러 무료 프록시를 순서대로 시도한다.
 * ============================================================ */

// 시도할 CORS 프록시 목록 (앞에서부터 차례로 시도, 하나 실패하면 다음으로)
const CORS_PROXIES = [
  (url) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url) => `https://thingproxy.freeboard.io/fetch/${url}`,
];

// 같은 티커를 또 요청하면 캐시에서 꺼내 쓴다 (속도 + 프록시 부담 감소)
const _cache = new Map();

/**
 * Yahoo Finance에서 한 종목의 월별 데이터를 가져온다.
 * @param {string} ticker  예: "SPY"
 * @param {Date} startDate
 * @param {Date} endDate
 * @returns {Promise<{dates: Date[], prices: number[], dividends: Object}>}
 *   dates: 각 월의 시각, prices: 수정종가, dividends: {timestamp: amount}
 */
async function fetchTickerData(ticker, startDate, endDate) {
  ticker = ticker.trim().toUpperCase();
  const period1 = Math.floor(startDate.getTime() / 1000);
  const period2 = Math.floor(endDate.getTime() / 1000);

  const cacheKey = `${ticker}_${period1}_${period2}`;
  if (_cache.has(cacheKey)) return _cache.get(cacheKey);

  const yahooUrl =
    `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}` +
    `?period1=${period1}&period2=${period2}&interval=1mo&events=div`;

  let lastError = null;

  // 프록시를 하나씩 시도
  for (const makeProxyUrl of CORS_PROXIES) {
    try {
      const resp = await fetchWithTimeout(makeProxyUrl(yahooUrl), 15000);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const json = await resp.json();
      const parsed = parseYahooResponse(json, ticker);
      _cache.set(cacheKey, parsed);
      return parsed;
    } catch (err) {
      lastError = err;
      // 다음 프록시로 계속
    }
  }

  throw new Error(
    `'${ticker}' 데이터를 가져오지 못했습니다. ` +
    `티커가 올바른지 확인하거나 잠시 후 다시 시도해 주세요. (${lastError?.message || '네트워크 오류'})`
  );
}

/** 응답이 너무 오래 걸리면 끊어주는 fetch */
async function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

/** Yahoo 응답 JSON을 우리가 쓰기 쉬운 형태로 변환 */
function parseYahooResponse(json, ticker) {
  const result = json?.chart?.result?.[0];
  if (!result || !result.timestamp) {
    throw new Error(`'${ticker}' 유효하지 않은 티커이거나 해당 기간 데이터가 없습니다.`);
  }

  const timestamps = result.timestamp;
  // 수정종가가 없으면 일반 종가로 대체
  const adjclose =
    result.indicators?.adjclose?.[0]?.adjclose ||
    result.indicators?.quote?.[0]?.close;

  if (!adjclose) {
    throw new Error(`'${ticker}' 가격 데이터를 찾을 수 없습니다.`);
  }

  const dates = [];
  const prices = [];
  for (let i = 0; i < timestamps.length; i++) {
    if (adjclose[i] == null) continue; // 빈 값 건너뛰기
    dates.push(new Date(timestamps[i] * 1000));
    prices.push(adjclose[i]);
  }

  if (prices.length < 2) {
    throw new Error(`'${ticker}' 해당 기간에 충분한 데이터가 없습니다.`);
  }

  // 배당 이벤트: {timestamp(초): 금액}
  const dividends = {};
  const divEvents = result.events?.dividends || {};
  for (const key in divEvents) {
    const ev = divEvents[key];
    dividends[ev.date] = ev.amount;
  }

  return { dates, prices, dividends };
}

/**
 * 여러 종목을 동시에 가져온 뒤, 공통으로 존재하는 월만 남겨 정렬한다.
 * 백테스트는 모든 종목의 날짜 축이 같아야 계산이 맞기 때문.
 * @returns {Promise<{dates: Date[], series: Object}>}
 *   series[ticker] = { prices:[], dividends:{} }
 */
async function fetchAndAlign(tickers, startDate, endDate) {
  const raw = {};
  for (const t of tickers) {
    raw[t] = await fetchTickerData(t, startDate, endDate);
  }

  // 각 종목의 "연-월" 집합을 구해 교집합을 만든다
  const monthKey = (d) => `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
  let common = null;
  for (const t of tickers) {
    const keys = new Set(raw[t].dates.map(monthKey));
    common = common === null ? keys : new Set([...common].filter((k) => keys.has(k)));
  }

  if (!common || common.size < 2) {
    throw new Error('선택한 종목들이 공통으로 거래된 기간이 너무 짧습니다. 기간이나 종목을 조정해 주세요.');
  }

  // 공통 월을 시간순으로 정렬
  const sortedKeys = [...common].sort((a, b) => {
    const [ay, am] = a.split('-').map(Number);
    const [by, bm] = b.split('-').map(Number);
    return ay !== by ? ay - by : am - bm;
  });

  // 기준 날짜 축 만들기
  const dates = [];
  const series = {};
  tickers.forEach((t) => (series[t] = { prices: [], dividends: {} }));

  // 종목별로 month키 -> {price, date} 매핑
  const lookup = {};
  tickers.forEach((t) => {
    lookup[t] = {};
    raw[t].dates.forEach((d, i) => {
      lookup[t][monthKey(d)] = { price: raw[t].prices[i], date: d };
    });
  });

  sortedKeys.forEach((key) => {
    let refDate = null;
    tickers.forEach((t) => {
      const item = lookup[t][key];
      series[t].prices.push(item.price);
      if (!refDate) refDate = item.date;
    });
    dates.push(refDate);
  });

  // 배당은 그대로 보관 (월 단위 매칭은 backtest에서 처리)
  tickers.forEach((t) => (series[t].dividends = raw[t].dividends));

  return { dates, series };
}

window.Fetcher = { fetchTickerData, fetchAndAlign };
