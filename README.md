# MegaMega — 투자 계산기 모음 (megamega.kr)

주식·ETF 투자자를 위한 무료 계산기 모음 사이트. 정적 사이트(HTML/JS)로 Vercel에 배포.

- **배포**: GitHub(main 브랜치) push → Vercel 자동 배포
- **도메인**: megamega.kr (가비아, A레코드 @ → 216.198.79.1)
- **기술**: 순수 HTML + Vanilla JS + Tailwind(CDN) + Chart.js(CDN), 빌드 과정 없음
- **데이터**: Yahoo Finance (Vercel 서버리스 함수 `/api/yahoo` 경유)

---

## 📁 파일 구조

### 페이지 (HTML, 전부 루트에 위치 = 각자 URL)
| 파일 | 역할 | 사용 JS |
|------|------|---------|
| `index.html` | 홈 (계산기/투자정보 카드 목록) | — |
| `backtest.html` | ETF 백테스트 도구 | fetcher, backtest, comment, charts, main |
| `retirement.html` | 나만의 은퇴 계산기 | fetcher, backtest, retirement |
| `average-down.html` | 물타기(평단가) 계산기 | (인라인) |
| `tax-transfer.html` | 해외주식 양도소득세 계산기 | (인라인) |
| `tax-dividend.html` | 배당소득세 계산기 | (인라인) |
| `target-asset.html` | 목표자산 역산 계산기 | (인라인) |
| `guide.html` | 투자 지표 가이드 (콘텐츠) | — |
| `blog.html` | 투자 인사이트 (글 목록) | — |
| `article-*.html` | 개별 인사이트 글 | — |
| `about / contact / terms / disclaimer / privacy.html` | 정보·법적 페이지 | — |
| `404.html` | 없는 페이지 안내 | — |

### 공통 자산
- `js/fetcher.js` — 야후 데이터 수집·정렬, 환율(getUsdKrw). `/api/yahoo` 1순위 + CORS프록시 폴백
- `js/backtest.js` — 백테스트 엔진(runBacktest=시간가중수익률 기반), calcMetrics, calcYearlyReturns
- `js/comment.js` — 규칙 기반 분석 코멘트
- `js/charts.js` — Chart.js 자산 성장 차트
- `js/main.js` — backtest.html UI 연결 + 실시간 환율 배너
- `js/retirement.js` — retirement.html 로직
- `css/style.css` — Tailwind 위 최소 커스텀
- `api/yahoo.js` — Vercel 서버리스 함수 (야후 프록시, '='티커 허용=환율 KRW=X)
- `sitemap.xml`, `robots.txt` — SEO

### 모든 페이지 공통 (head/header/footer 동일 패턴)
- `<head>`: 파비콘(📊 SVG), JSON-LD(Organization+WebSite), 구글 인증 메타(index.html만)
- 헤더 nav: **홈 · 가이드 · 인사이트**
- 푸터: 회색 "전체 계산기" 박스(도구 6개) + 정보링크(소개·문의·면책조항·개인정보처리방침·이용약관)

---

## 🛠️ 유지보수 가이드

### 새 계산기 추가
1. `기존 계산기.html` 복제 → 내용 수정 (head의 title/description/canonical 교체)
2. `index.html` "투자 계산기" 섹션에 카드 1개 추가
3. `sitemap.xml`에 URL 추가
4. 푸터 "전체 계산기" 박스에 링크 추가 (전 페이지 → 아래 일괄수정 참고)

### 새 인사이트 글 추가
1. `article-spy-vs-qqq.html` 복제 → `article-새이름.html`, 내용 수정
2. `blog.html` 글 목록에 카드 1개 추가
3. `sitemap.xml`에 URL 추가
   → **홈(index.html)은 안 건드려도 됨** (블로그 카드가 목록으로 연결)

### 헤더/푸터 등 전 페이지 일괄 수정 (토큰 절약 핵심)
개별 파일을 하나씩 고치지 말고 PowerShell 정규식 일괄치환 사용:
```powershell
# 예: 모든 html의 <footer>...</footer> 교체
$enc = New-Object System.Text.UTF8Encoding($false)   # BOM 없이 저장
$new = [System.IO.File]::ReadAllText("_snippet.html", [Text.Encoding]::UTF8)  # 이모지는 임시파일로
foreach ($f in Get-ChildItem *.html) {
  $c = [IO.File]::ReadAllText($f.FullName, [Text.Encoding]::UTF8)
  $c = [regex]::Replace($c, '(?s)<footer\b.*?</footer>', { param($m) $new })
  [IO.File]::WriteAllText($f.FullName, $c, $enc)
}
```
- nav 일괄치환 패턴: `(?s)<nav class="flex gap-4 text-sm text-slate-600">.*?</nav>`
- **이모지 포함 스니펫은 임시 .html로 Write 후 ReadAllText로 불러오기** (PS 명령에 직접 이모지 넣으면 깨질 수 있음)

### ⚠️ 하지 말 것
- **기존 HTML 파일명/URL 변경·이동 금지** — 구글에 색인 중이라 URL 바뀌면 SEO 손해 + canonical/sitemap/링크 전부 깨짐
- index.html의 `google-site-verification` 메타태그 삭제 금지 (서치콘솔 인증 풀림)
- canonical/sitemap의 도메인은 항상 `https://megamega.kr`

---

## 로컬 실행 / 배포
```bash
# 로컬 미리보기 (단, /api/yahoo는 로컬 미작동 → 프록시 폴백 탐, 실서버에선 정상)
python -m http.server 8000        # http://localhost:8000

# 배포
git add -A && git commit -m "메시지" && git push   # → Vercel 자동 배포(1~2분)
```

## 진행 상태 (2026-06-21)
계산기 6종 + 콘텐츠/법적 페이지 + SEO + 도메인 + 구글 서치콘솔 등록 완료.
남은 것: 2~3주 운영(색인) → 애드센스 신청 + ads.txt.
