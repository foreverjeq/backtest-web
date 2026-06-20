/* ============================================================
 * /api/yahoo  (Vercel 서버리스 함수)
 * 브라우저 대신 서버에서 Yahoo Finance 데이터를 가져와 돌려준다.
 * 같은 도메인(megamega.kr/api/yahoo)에서 호출하므로 CORS 문제가 없고,
 * 외부 무료 프록시에 의존하지 않아 안정적이다.
 * ============================================================ */

module.exports = async (req, res) => {
  const { ticker, period1, period2, interval } = req.query;

  if (!ticker) {
    res.status(400).json({ error: 'ticker 파라미터가 필요합니다.' });
    return;
  }

  // 티커는 영문/숫자/일부 기호만 허용 (서버를 임의 요청에 악용하지 못하게)
  // '='는 환율 티커(예: KRW=X)를 위해 허용
  const safeTicker = String(ticker).toUpperCase().replace(/[^A-Z0-9.\-^=]/g, '');
  const p1 = Number(period1) || 0;
  const p2 = Number(period2) || Math.floor(Date.now() / 1000);
  const itv = ['1d', '1wk', '1mo'].includes(interval) ? interval : '1mo';

  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${safeTicker}` +
    `?period1=${p1}&period2=${p2}&interval=${itv}&events=div`;

  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    });
    const text = await r.text();
    // 1시간 캐시 (같은 요청은 Vercel CDN이 빠르게 응답)
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.status(r.status).send(text);
  } catch (e) {
    res.status(502).json({ error: '데이터 서버에 연결하지 못했습니다.', detail: String(e) });
  }
};
