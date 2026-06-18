# BacktestLab — 미국 ETF 백테스트

미국 ETF·주식을 과거 데이터로 검증하는 무료 백테스트 웹 도구입니다.

## 특징
- 거치식 / 적립식 / 혼합 투자 시뮬레이션
- CAGR, MDD, 샤프지수, 소르티노, 칼마 등 핵심 지표 자동 계산 (시간가중수익률 기반)
- 배당 재투자(DRIP), 리밸런싱 옵션
- 자산 성장 차트 (vs S&P500 벤치마크)
- 규칙 기반 포트폴리오 분석 코멘트

## 기술 스택
- 순수 HTML + Vanilla JavaScript (빌드 과정 없음)
- Tailwind CSS (CDN), Chart.js (CDN)
- 데이터: Yahoo Finance (무료)

## 로컬 실행
```
python -m http.server 8000
```
브라우저에서 http://localhost:8000 접속

## 페이지
- `index.html` — 백테스트 도구
- `guide.html` — 지표 가이드
- `about.html` — 사이트 소개
- `privacy.html` — 개인정보처리방침
