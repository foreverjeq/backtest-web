/* ============================================================
 * main.js
 * 화면(UI)과 엔진을 연결한다. 입력값 읽기 → 백테스트 실행 → 결과 표시.
 * ============================================================ */

let currentMode = 'lumpsum';
let tickerCount = 0;
let usdKrw = null; // 실시간 USD/KRW 환율 (없으면 null)

// ---------- 초기화 ----------
document.addEventListener('DOMContentLoaded', () => {
  addTickerRow('SPY', 60);
  addTickerRow('QQQ', 40);
  updateWeightSum();
  loadExchangeRate();

  document.getElementById('addTickerBtn').addEventListener('click', () => {
    if (tickerCount >= 5) return alert('최대 5개까지 추가할 수 있습니다.');
    addTickerRow('', 0);
  });

  document.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => setMode(btn.dataset.mode));
  });

  document.getElementById('runBtn').addEventListener('click', runAnalysis);
});

// ---------- 실시간 환율 불러오기 ----------
async function loadExchangeRate() {
  const el = document.getElementById('fxValue');
  try {
    const rate = await Fetcher.getUsdKrw();
    if (rate) {
      usdKrw = rate;
      if (el) el.textContent = `$1 = ${rate.toLocaleString(undefined, { maximumFractionDigits: 1 })}원`;
    } else if (el) {
      el.textContent = '환율 정보를 불러오지 못했습니다';
    }
  } catch (_) {
    if (el) el.textContent = '환율 정보를 불러오지 못했습니다';
  }
}

// ---------- 종목 행 추가 ----------
function addTickerRow(ticker, weight) {
  tickerCount++;
  const row = document.createElement('div');
  row.className = 'flex gap-1.5 items-center ticker-row';
  row.innerHTML = `
    <input type="text" value="${ticker}" placeholder="티커"
      class="ticker-input flex-1 min-w-0 border border-slate-300 rounded-lg px-2 py-1.5 text-sm uppercase" />
    <input type="number" value="${weight}" min="0" max="100"
      class="weight-input w-14 shrink-0 border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
    <span class="text-sm text-slate-400 shrink-0">%</span>
    <button type="button" class="del-btn shrink-0 text-slate-400 hover:text-red-500 px-1" aria-label="종목 삭제">✕</button>
  `;
  document.getElementById('tickerList').appendChild(row);

  row.querySelector('.weight-input').addEventListener('input', updateWeightSum);
  row.querySelector('.del-btn').addEventListener('click', () => {
    if (document.querySelectorAll('.ticker-row').length <= 1) return;
    row.remove();
    tickerCount--;
    updateWeightSum();
  });
}

// ---------- 비중 합계 ----------
function updateWeightSum() {
  let sum = 0;
  document.querySelectorAll('.weight-input').forEach((el) => (sum += Number(el.value) || 0));
  const el = document.getElementById('weightSum');
  el.textContent = `총 비중: ${sum}%`;
  el.className = sum === 100 ? 'mt-2 text-sm text-green-600 font-semibold' : 'mt-2 text-sm text-red-500';
}

// ---------- 투자 방식 전환 ----------
function setMode(mode) {
  currentMode = mode;
  document.querySelectorAll('.mode-btn').forEach((b) => {
    const active = b.dataset.mode === mode;
    b.classList.toggle('bg-white', active);
    b.classList.toggle('shadow', active);
    b.classList.toggle('font-medium', active);
  });
  document.getElementById('dcaFields').classList.toggle('hidden', mode === 'lumpsum');
}

// ---------- 입력값 수집 ----------
function collectInputs() {
  const tickers = [];
  const weights = {};
  let weightSum = 0;

  document.querySelectorAll('.ticker-row').forEach((row) => {
    const t = row.querySelector('.ticker-input').value.trim().toUpperCase();
    const w = Number(row.querySelector('.weight-input').value) || 0;
    if (t) {
      tickers.push(t);
      weights[t] = w / 100;
      weightSum += w;
    }
  });

  if (tickers.length === 0) throw new Error('종목을 1개 이상 입력해 주세요.');
  if (Math.abs(weightSum - 100) > 0.5) throw new Error('비중의 합이 100%가 되어야 합니다.');

  const startStr = document.getElementById('startDate').value;
  const endStr = document.getElementById('endDate').value;
  if (!startStr || !endStr) throw new Error('시작일과 종료일을 입력해 주세요.');
  const startDate = new Date(startStr + '-01');
  const endDate = new Date(endStr + '-28');
  if (endDate <= startDate) throw new Error('종료일이 시작일보다 뒤여야 합니다.');

  return {
    tickers,
    weights,
    mode: currentMode,
    initial: Number(document.getElementById('initialAmount').value) || 0,
    contribution: Number(document.getElementById('contribution').value) || 0,
    frequency: document.getElementById('frequency').value,
    drip: document.getElementById('drip').checked,
    rebalance: document.getElementById('rebalance').value,
    startDate,
    endDate,
    riskFree: 0.04,
  };
}

// ---------- 메인 실행 ----------
async function runAnalysis() {
  const errEl = document.getElementById('errorMsg');
  errEl.classList.add('hidden');

  let cfg;
  try {
    cfg = collectInputs();
  } catch (e) {
    errEl.textContent = e.message;
    errEl.classList.remove('hidden');
    return;
  }

  // 화면 상태 전환
  document.getElementById('placeholder').classList.add('hidden');
  document.getElementById('results').classList.add('hidden');
  document.getElementById('loading').classList.remove('hidden');

  try {
    // 1) 데이터 수집 + 정렬
    const aligned = await Fetcher.fetchAndAlign(cfg.tickers, cfg.startDate, cfg.endDate);

    // 2) 백테스트 실행
    const result = Backtest.runBacktest({ ...cfg, aligned });

    // 3) 벤치마크(SPY) — 포트폴리오에 SPY가 없으면 별도로 가져와 비교
    let benchmark = null;
    try {
      benchmark = await buildBenchmark(cfg, aligned, result);
    } catch (_) {
      /* 벤치마크 실패는 무시 */
    }

    // 4) 결과 렌더링
    renderResults(cfg, result, benchmark);
  } catch (e) {
    errEl.textContent = e.message || '알 수 없는 오류가 발생했습니다.';
    errEl.classList.remove('hidden');
    document.getElementById('placeholder').classList.remove('hidden');
  } finally {
    document.getElementById('loading').classList.add('hidden');
  }
}

// ---------- 벤치마크 곡선 만들기 (동일 조건 SPY 100%) ----------
async function buildBenchmark(cfg, aligned, result) {
  let spy;
  if (aligned.series['SPY']) {
    spy = { dates: aligned.dates, series: { SPY: aligned.series['SPY'] } };
  } else {
    spy = await Fetcher.fetchAndAlign(['SPY'], cfg.startDate, cfg.endDate);
  }
  const bench = Backtest.runBacktest({
    ...cfg,
    weights: { SPY: 1 },
    aligned: spy,
  });
  // 날짜 길이가 다르면 비교 생략
  if (bench.portfolioValues.length !== result.portfolioValues.length) return null;
  return bench.portfolioValues;
}

// ---------- 결과 렌더링 ----------
function renderResults(cfg, result, benchmark) {
  const m = result.metrics;
  document.getElementById('results').classList.remove('hidden');

  // 핵심 카드
  const pct = (x) => (x * 100).toFixed(1) + '%';
  const cards = [
    { label: '총 수익률', value: (m.totalReturn >= 0 ? '+' : '') + pct(m.totalReturn), color: m.totalReturn >= 0 ? 'text-blue-600' : 'text-red-600' },
    { label: 'CAGR (연복리)', value: pct(m.cagr), color: 'text-slate-800' },
    { label: 'MDD (최대낙폭)', value: pct(m.mdd), color: 'text-red-600' },
    { label: '샤프지수', value: m.sharpe.toFixed(2), color: 'text-slate-800' },
  ];
  document.getElementById('metricCards').innerHTML = cards
    .map(
      (c) => `
    <div class="bg-white rounded-xl border border-slate-200 p-4 text-center">
      <p class="text-xs text-slate-500 mb-1">${c.label}</p>
      <p class="text-xl font-bold ${c.color}">${c.value}</p>
    </div>`
    )
    .join('');

  // 차트
  Charts.renderGrowthChart(result.dates, result.portfolioValues, result.investedSeries, benchmark);

  // 코멘트
  const cm = Comment.generateComment(m);
  document.getElementById('commentBox').innerHTML = `
    <p>${cm.summary}</p>
    <div>
      <p class="font-semibold text-green-700">✅ 강점</p>
      <ul class="list-disc list-inside text-slate-600">${cm.pros.map((p) => `<li>${p}</li>`).join('')}</ul>
    </div>
    <div>
      <p class="font-semibold text-amber-700">⚠️ 주의점</p>
      <ul class="list-disc list-inside text-slate-600">${cm.cons.map((p) => `<li>${p}</li>`).join('')}</ul>
    </div>
    <p class="text-slate-600"><span class="font-semibold">🎯 적합 투자자:</span> ${cm.suited}</p>
  `;

  // 달러 + (환율 있으면) 원화 환산 2줄 표기
  const money = (usd) => {
    const d = '$' + Math.round(usd).toLocaleString();
    return usdKrw
      ? `${d}<br><span class="text-xs text-slate-400 font-normal">₩${Math.round(usd * usdKrw).toLocaleString()}</span>`
      : d;
  };

  // 상세 지표
  const details = [
    ['최종 자산', money(result.finalValue)],
    ['총 투자원금', money(result.totalInvested)],
    ['누적 배당금', money(result.totalDividends)],
    ['변동성 (연)', pct(m.volatility)],
    ['소르티노 지수', m.sortino.toFixed(2)],
    ['칼마 지수', m.calmar.toFixed(2)],
    ['월 승률', pct(m.winRate)],
    ['최장 낙폭기간', m.longestRecovery + '개월'],
    ['투자 기간', m.years.toFixed(1) + '년'],
  ];
  document.getElementById('detailTable').innerHTML = details
    .map(([k, v]) => `<div class="flex justify-between border-b border-slate-100 pb-1"><span class="text-slate-500">${k}</span><span class="font-semibold">${v}</span></div>`)
    .join('');

  // 연도별
  const yearly = Backtest.calcYearlyReturns(result.dates, result.portfolioValues, result.dividendByYear);
  const head = `<thead><tr class="text-left text-slate-500 border-b"><th class="py-2">연도</th><th>수익률</th><th>자산</th><th>배당</th></tr></thead>`;
  const body = yearly
    .map(
      (r) => `<tr class="border-b border-slate-100">
      <td class="py-1.5">${r.year}</td>
      <td class="${r.return >= 0 ? 'text-blue-600' : 'text-red-600'}">${(r.return >= 0 ? '+' : '') + (r.return * 100).toFixed(1)}%</td>
      <td>$${Math.round(r.value).toLocaleString()}</td>
      <td class="text-slate-500">$${Math.round(r.dividend).toLocaleString()}</td>
    </tr>`
    )
    .join('');
  document.getElementById('yearlyTable').innerHTML = head + '<tbody>' + body + '</tbody>';

  document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
