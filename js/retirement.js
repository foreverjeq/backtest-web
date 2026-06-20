/* ============================================================
 * retirement.js  (나만의 은퇴 계산기)
 * 포트폴리오를 과거 데이터로 백테스트해 연평균 성장률(CAGR)과
 * 배당수익률을 구한 뒤, 미래를 투영해 목표 자산 도달 기간과
 * 그때의 예상 배당 수입을 계산한다. (금액은 모두 원화)
 * ============================================================ */

let tickerCount = 0;

document.addEventListener('DOMContentLoaded', () => {
  addTickerRow('SPY', 60);
  addTickerRow('QQQ', 40);
  updateWeightSum();

  document.getElementById('addTickerBtn').addEventListener('click', () => {
    if (tickerCount >= 5) return alert('최대 5개까지 추가할 수 있습니다.');
    addTickerRow('', 0);
  });
  document.getElementById('calcBtn').addEventListener('click', run);
});

// ---------- 종목 행 ----------
function addTickerRow(ticker, weight) {
  tickerCount++;
  const row = document.createElement('div');
  row.className = 'flex gap-2 items-center ticker-row';
  row.innerHTML = `
    <input type="text" value="${ticker}" placeholder="티커"
      class="ticker-input flex-1 border border-slate-300 rounded-lg px-2 py-1.5 text-sm uppercase" />
    <input type="number" value="${weight}" min="0" max="100"
      class="weight-input w-16 border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
    <span class="text-sm text-slate-400">%</span>
    <button type="button" class="del-btn text-slate-400 hover:text-red-500 px-1">✕</button>`;
  document.getElementById('tickerList').appendChild(row);
  row.querySelector('.weight-input').addEventListener('input', updateWeightSum);
  row.querySelector('.del-btn').addEventListener('click', () => {
    if (document.querySelectorAll('.ticker-row').length <= 1) return;
    row.remove(); tickerCount--; updateWeightSum();
  });
}

function updateWeightSum() {
  let sum = 0;
  document.querySelectorAll('.weight-input').forEach((el) => (sum += Number(el.value) || 0));
  const el = document.getElementById('weightSum');
  el.textContent = `총 비중: ${sum}%`;
  el.className = sum === 100 ? 'mt-2 text-sm text-green-600 font-semibold' : 'mt-2 text-sm text-red-500';
}

const val = (id) => Number(document.getElementById(id).value) || 0;
const won = (n) => Math.round(n).toLocaleString() + '원';
const eok = (n) => (n / 100000000).toFixed(2) + '억원';

// ---------- 포트폴리오 배당수익률 (최근 12개월) ----------
function computeDividendYield(aligned, weights) {
  const { dates, series } = aligned;
  const lastSec = dates[dates.length - 1].getTime() / 1000;
  const yearAgo = lastSec - 365 * 86400;
  let y = 0;
  for (const t in weights) {
    const s = series[t];
    const price = s.prices[s.prices.length - 1];
    let div = 0;
    for (const ts in s.dividends) {
      const n = Number(ts);
      if (n > yearAgo && n <= lastSec + 7 * 86400) div += s.dividends[ts];
    }
    if (price > 0) y += weights[t] * (div / price);
  }
  return y; // 연 배당수익률 (예: 0.015 = 1.5%)
}

// ---------- 미래 투영: 목표 도달까지 몇 개월? ----------
function projectToTarget(cagr, initial, monthly, target, lumpMonth, lumpAmount) {
  const r = Math.pow(1 + cagr, 1 / 12) - 1; // 월 성장률
  let value = initial;
  if (value >= target) return { months: 0, value, invested: initial };
  const maxMonths = 80 * 12;
  let invested = initial;
  for (let m = 1; m <= maxMonths; m++) {
    value = value * (1 + r) + monthly;
    invested += monthly;
    if (lumpAmount > 0 && m === lumpMonth) {
      value += lumpAmount;
      invested += lumpAmount;
    }
    if (value >= target) return { months: m, value, invested };
  }
  return { months: Infinity, value, invested };
}

// ---------- 메인 ----------
async function run() {
  const errEl = document.getElementById('errorMsg');
  errEl.classList.add('hidden');

  // 입력 수집
  const tickers = [], weights = {};
  let wsum = 0;
  document.querySelectorAll('.ticker-row').forEach((row) => {
    const t = row.querySelector('.ticker-input').value.trim().toUpperCase();
    const w = Number(row.querySelector('.weight-input').value) || 0;
    if (t) { tickers.push(t); weights[t] = w / 100; wsum += w; }
  });

  try {
    if (tickers.length === 0) throw new Error('종목을 1개 이상 입력해 주세요.');
    if (Math.abs(wsum - 100) > 0.5) throw new Error('비중의 합이 100%가 되어야 합니다.');
  } catch (e) { return showError(e.message); }

  const initial = val('initial');
  const monthly = val('monthly');
  const target = val('target');
  const lumpYear = val('lumpYear');
  const lumpAmount = val('lumpAmount');
  const drip = document.getElementById('drip').checked;
  const lookback = Number(document.getElementById('lookback').value);

  if (target <= 0) return showError('목표 은퇴자산을 입력해 주세요.');
  if (monthly <= 0 && initial <= 0) return showError('매월 투자금 또는 현재 보유 자금을 입력해 주세요.');

  // 화면 전환
  document.getElementById('placeholder').classList.add('hidden');
  document.getElementById('results').classList.add('hidden');
  document.getElementById('loading').classList.remove('hidden');

  try {
    // 과거 분석 기간
    const endDate = new Date();
    const startDate = lookback === 0
      ? new Date('1990-01-01')
      : new Date(Date.now() - lookback * 365.25 * 86400 * 1000);

    const aligned = await Fetcher.fetchAndAlign(tickers, startDate, endDate);
    const bt = Backtest.runBacktest({ aligned, weights, mode: 'lumpsum', initial: 10000, drip, rebalance: 'none', riskFree: 0.04 });
    const cagr = bt.metrics.cagr;
    const divYield = computeDividendYield(aligned, weights);

    const proj = projectToTarget(cagr, initial, monthly, target, Math.round(lumpYear * 12), lumpAmount);

    renderResults({ cagr, divYield, proj, target, drip });
  } catch (e) {
    showError(e.message || '계산 중 오류가 발생했습니다.');
    document.getElementById('placeholder').classList.remove('hidden');
  } finally {
    document.getElementById('loading').classList.add('hidden');
  }
}

function showError(msg) {
  const errEl = document.getElementById('errorMsg');
  errEl.textContent = msg;
  errEl.classList.remove('hidden');
  document.getElementById('loading').classList.add('hidden');
}

function renderResults({ cagr, divYield, proj, target }) {
  document.getElementById('results').classList.remove('hidden');

  const pct = (x) => (x * 100).toFixed(2) + '%';

  // 도달 기간 텍스트
  let periodText, reached = true;
  if (proj.months === Infinity) {
    periodText = '80년 내 도달 어려움';
    reached = false;
  } else if (proj.months === 0) {
    periodText = '이미 달성!';
  } else {
    const y = Math.floor(proj.months / 12), mo = proj.months % 12;
    periodText = (y > 0 ? y + '년 ' : '') + (mo > 0 ? mo + '개월' : '');
    if (y === 0 && mo === 0) periodText = '1개월 이내';
  }

  document.getElementById('r_period').textContent = periodText;
  document.getElementById('r_finalValue').textContent = reached ? eok(proj.value) : '-';

  // 적용된 가정
  document.getElementById('r_assumptions').innerHTML = `
    <div class="flex justify-between border-b border-slate-100 pb-1.5"><span class="text-slate-500">과거 연평균 성장률(CAGR)</span><span class="font-semibold">${pct(cagr)}</span></div>
    <div class="flex justify-between border-b border-slate-100 pb-1.5"><span class="text-slate-500">포트폴리오 배당수익률</span><span class="font-semibold">${pct(divYield)}</span></div>
    <div class="flex justify-between border-b border-slate-100 pb-1.5"><span class="text-slate-500">목표 은퇴자산</span><span class="font-semibold">${won(target)}</span></div>
  `;

  // 배당 수입 + 투자 요약
  const divBox = document.getElementById('r_dividend');
  const sumBox = document.getElementById('r_summary');
  if (reached) {
    const annualDiv = proj.value * divYield;
    divBox.innerHTML = `
      <p class="text-sm text-slate-600 mb-3">목표 도달 시점에 이 포트폴리오를 그대로 보유한다면, 예상 배당 수입은 다음과 같습니다.</p>
      <div class="grid grid-cols-3 gap-3 text-center">
        <div class="bg-green-50 rounded-lg p-3"><p class="text-xs text-slate-500 mb-1">연 배당</p><p class="font-bold text-green-700">${won(annualDiv)}</p></div>
        <div class="bg-slate-50 rounded-lg p-3"><p class="text-xs text-slate-500 mb-1">분기 평균</p><p class="font-bold">${won(annualDiv / 4)}</p></div>
        <div class="bg-slate-50 rounded-lg p-3"><p class="text-xs text-slate-500 mb-1">월 평균</p><p class="font-bold">${won(annualDiv / 12)}</p></div>
      </div>
      <p class="text-xs text-slate-400 mt-3">※ 미국 ETF는 대부분 분기(3개월)마다 배당합니다. 월 평균은 참고용 환산치입니다.</p>`;
    divBox.classList.remove('hidden');

    const profit = proj.value - proj.invested;
    sumBox.innerHTML = `
      <div class="flex justify-between border-b border-slate-100 pb-1.5"><span class="text-slate-500">총 투자원금</span><span>${won(proj.invested)}</span></div>
      <div class="flex justify-between border-b border-slate-100 pb-1.5"><span class="text-slate-500">투자로 불어난 수익</span><span class="text-blue-600 font-semibold">${won(profit)}</span></div>
      <div class="flex justify-between border-b border-slate-100 pb-1.5"><span class="text-slate-500">최종 예상 자산</span><span class="font-bold">${won(proj.value)}</span></div>`;
    sumBox.classList.remove('hidden');
  } else {
    divBox.classList.add('hidden');
    sumBox.innerHTML = `<p class="text-sm text-amber-700 bg-amber-50 rounded-lg p-3">현재 조건으로는 80년 안에 목표에 도달하기 어렵습니다. 매월 투자금을 늘리거나 목표 금액을 조정해 보세요.</p>`;
    sumBox.classList.remove('hidden');
  }

  document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
