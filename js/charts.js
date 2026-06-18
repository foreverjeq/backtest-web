/* ============================================================
 * charts.js
 * Chart.js로 자산 성장 곡선을 그린다.
 * ============================================================ */

let _growthChart = null;

/**
 * 자산 성장 차트 (내 포트폴리오 vs 벤치마크 vs 투자원금)
 * @param {Date[]} dates
 * @param {number[]} portfolio
 * @param {number[]} invested
 * @param {number[]|null} benchmark
 */
function renderGrowthChart(dates, portfolio, invested, benchmark) {
  const ctx = document.getElementById('growthChart').getContext('2d');
  if (_growthChart) _growthChart.destroy();

  const labels = dates.map((d) => `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}`);

  const datasets = [
    {
      label: '내 포트폴리오',
      data: portfolio,
      borderColor: '#2563eb',
      backgroundColor: 'rgba(37,99,235,0.08)',
      borderWidth: 2,
      fill: true,
      tension: 0.1,
      pointRadius: 0,
      pointHoverRadius: 4,
    },
    {
      label: '투자원금',
      data: invested,
      borderColor: '#9ca3af',
      borderWidth: 1.5,
      borderDash: [5, 5],
      fill: false,
      tension: 0,
      pointRadius: 0,
    },
  ];

  if (benchmark) {
    datasets.push({
      label: 'S&P500 (SPY)',
      data: benchmark,
      borderColor: '#f59e0b',
      borderWidth: 1.5,
      fill: false,
      tension: 0.1,
      pointRadius: 0,
      pointHoverRadius: 4,
    });
  }

  _growthChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', labels: { font: { size: 12 } } },
        tooltip: {
          callbacks: {
            label: (c) => `${c.dataset.label}: $${Math.round(c.parsed.y).toLocaleString()}`,
          },
        },
      },
      scales: {
        x: { ticks: { maxTicksLimit: 12, font: { size: 11 } }, grid: { display: false } },
        y: {
          ticks: {
            font: { size: 11 },
            callback: (v) => '$' + (v >= 1000 ? (v / 1000).toFixed(0) + 'K' : v),
          },
        },
      },
    },
  });
}

window.Charts = { renderGrowthChart };
