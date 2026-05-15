# Claude Code Session Dashboard

## 프로젝트 개요
Claude Code 세션 JSONL 파일을 파싱하여 일자별/프로젝트별 작업 내역을 보여주는 로컬 웹 대시보드.

## 구현 상태
- Phase 1 MVP 완료: 일자별 내역 뷰 + 프로젝트 필터
- Phase 2 완료: 실시간 모니터링 (SSE + chokidar)

## 기술 스택
- Backend: Node.js + Express (port 3001) + chokidar + SSE
- Frontend: React + Vite + TailwindCSS (port 5173) + EventSource
- DB 없음 — `~/.claude/projects/` JSONL 파일 직접 파싱 + 인메모리 캐싱

## 실행 방법
```bash
npm install
npm run dev
# http://localhost:5173 접속
```

## 프로젝트 구조
- `server/` — Express 백엔드 (라우트, 서비스, 유틸)
- `client/` — React 프론트엔드 (컴포넌트, 페이지)
- 상세 파일 구조는 `PLAN.md` 참조

## 코드 컨벤션
- 언어: JavaScript (TypeScript 미사용, MVP 속도 우선)
- UI 텍스트: 한국어
- 파일당 300줄 제한
- 서브에이전트 파일(agent-*.jsonl)은 Phase 1에서 무시
- 세션 날짜 표시: 시작일 기준
