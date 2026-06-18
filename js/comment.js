/* ============================================================
 * comment.js
 * LLM 없이 규칙 기반으로 "AI 분석처럼" 보이는 코멘트를 생성한다.
 * ============================================================ */

function gradeReturn(cagr) {
  const p = cagr * 100;
  if (p >= 15) return '매우 우수';
  if (p >= 10) return '우수';
  if (p >= 7) return '양호';
  if (p >= 4) return '보통';
  return '부진';
}

function gradeRisk(mdd) {
  const p = mdd * 100;
  if (p <= -50) return '매우 고위험';
  if (p <= -35) return '고위험';
  if (p <= -20) return '중위험';
  return '저위험';
}

function gradeSharpe(s) {
  if (s >= 1.5) return '탁월';
  if (s >= 1.0) return '우수';
  if (s >= 0.5) return '보통';
  return '미흡';
}

/**
 * 결과 metrics를 받아 코멘트 텍스트 묶음 생성
 * @returns {{summary:string, pros:string[], cons:string[], suited:string}}
 */
function generateComment(m) {
  const gReturn = gradeReturn(m.cagr);
  const gRisk = gradeRisk(m.mdd);
  const gSharpe = gradeSharpe(m.sharpe);

  const cagrP = (m.cagr * 100).toFixed(1);
  const mddP = (m.mdd * 100).toFixed(1);
  const sharpe = m.sharpe.toFixed(2);
  const volP = (m.volatility * 100).toFixed(1);

  const summary =
    `이 포트폴리오의 연평균 수익률(CAGR)은 ${cagrP}%로 '${gReturn}' 수준입니다. ` +
    `최대 낙폭(MDD)은 ${mddP}%로 '${gRisk}'에 해당하며, 변동성은 연 ${volP}% 수준입니다. ` +
    `샤프지수 ${sharpe}는 '${gSharpe}' 등급으로, 감수한 위험 대비 ` +
    `${gSharpe === '미흡' ? '수익 효율이 다소 아쉬운' : '적절한 수익을 창출한'} 결과입니다.`;

  // 장점
  const pros = [];
  if (m.cagr >= 0.1) pros.push(`장기 복리 수익률이 연 ${cagrP}%로 시장 평균을 상회합니다.`);
  else if (m.cagr >= 0.07) pros.push(`연 ${cagrP}%의 꾸준한 복리 성장을 보여줍니다.`);
  if (m.sharpe >= 1.0) pros.push(`샤프지수 ${sharpe}로 위험 대비 효율이 우수합니다.`);
  if (m.mdd > -0.2) pros.push(`최대 낙폭이 ${mddP}%로 비교적 안정적입니다.`);
  if (m.winRate >= 0.6) pros.push(`월 단위 승률이 ${(m.winRate * 100).toFixed(0)}%로 높은 편입니다.`);
  if (pros.length === 0) pros.push('데이터 기반으로 검증 가능한 투자 전략입니다.');

  // 주의점
  const cons = [];
  if (m.mdd <= -0.35) cons.push(`MDD ${mddP}% 구간에서는 멘탈 관리와 장기 보유 의지가 중요합니다.`);
  else if (m.mdd <= -0.2) cons.push(`MDD ${mddP}% 수준의 하락을 견딜 수 있어야 합니다.`);
  if (m.volatility >= 0.2) cons.push(`연 변동성 ${volP}%로 가격 등락이 큰 편입니다.`);
  if (m.cagr < 0.04) cons.push('수익률이 낮아 인플레이션 대비 실질 수익이 제한적일 수 있습니다.');
  if (m.sharpe < 0.5) cons.push('위험 대비 수익 효율이 낮아 자산 배분 재검토가 필요할 수 있습니다.');
  if (cons.length === 0) cons.push('과거 성과가 미래 수익을 보장하지 않는다는 점에 유의하세요.');

  // 적합 투자자
  let suited;
  if (m.mdd <= -0.4 || m.volatility >= 0.25) {
    suited = '높은 변동성을 감내할 수 있는 공격적·장기(10년 이상) 투자자';
  } else if (m.mdd <= -0.2) {
    suited = '중간 수준의 위험을 수용하는 5년 이상 중장기 투자자';
  } else {
    suited = '안정성을 중시하는 보수적 투자자에게도 적합';
  }

  return { summary, pros, cons, suited };
}

window.Comment = { generateComment };
