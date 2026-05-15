# Claude Code Session Dashboard - Phase 1 MVP 구현 계획

## Context
Claude Code로 작업한 내역을 하루 단위로 파악하는 로컬 웹 대시보드를 신규 구축한다.
`~/.claude/projects/` 하위 JSONL 세션 파일(32개 프로젝트, 1235개 파일, 211MB)을 파싱하여
프로젝트별/일자별 세션 요약을 보여주는 것이 핵심 목표.

## 프로젝트 구조
```
05.session_board/
├── package.json                    # 루트: dev 스크립트 (concurrently)
├── server/
│   ├── package.json                # express, cors, dayjs
│   └── src/
│       ├── index.js                # Express 진입점 (port 3001)
│       ├── routes/
│       │   ├── projects.js         # GET /api/projects
│       │   ├── sessions.js         # GET /api/sessions/:projectId
│       │   └── daily.js            # GET /api/daily?date=&project=
│       ├── services/
│       │   ├── projectScanner.js   # 프로젝트 디렉토리 스캔 + cwd 추출
│       │   ├── jsonlParser.js      # 스트림 기반 JSONL 파싱 + 세션 요약 빌드
│       │   └── cacheManager.js     # mtime 기반 인메모리 캐시
│       └── utils/
│           └── pathDecoder.js      # 프로젝트 경로 디코딩 (cwd 기반)
├── client/
│   ├── package.json                # react, vite, tailwindcss, dayjs
│   ├── index.html
│   ├── vite.config.js              # /api → localhost:3001 프록시
│   └── src/
│       ├── main.jsx
│       ├── App.jsx                 # 라우팅 (/ → 오늘 일자별 내역)
│       ├── api/
│       │   └── client.js           # fetch 래퍼
│       ├── components/
│       │   ├── Layout.jsx          # 헤더 + 프로젝트 셀렉터 + 콘텐츠
│       │   ├── ProjectSelector.jsx # 프로젝트 드롭다운 (localStorage 저장)
│       │   ├── DateNavigator.jsx   # 날짜 이동 (◀ 오늘 ▶)
│       │   ├── SessionCard.jsx     # 세션 카드 (프롬프트, 툴, 파일, 토큰)
│       │   └── ToolCallList.jsx    # 툴 호출 목록 (접기/펼치기)
│       └── pages/
│           └── DailyPage.jsx       # 일자별 내역 페이지
└── .gitignore
```

## 핵심 설계 결정

### 1. 프로젝트 경로 디코딩
디렉토리명 `C--Exception-0-STUDY-04-stock-diary`는 문자열 치환으로 역변환 불가(손실 인코딩).
**해법**: 각 프로젝트의 첫 JSONL 파일에서 `cwd` 필드를 읽어 실제 경로 확보. 32개 프로젝트만 스캔하므로 1초 이내.

### 2. JSONL 파싱 전략
1235개 파일을 모두 파싱하면 수 초 소요 → **Lazy Loading + 캐싱** 채택.
- 시작 시: 디렉토리 스캔 + cwd 추출만 수행
- 요청 시: 해당 프로젝트/날짜의 JSONL만 파싱
- `readline` + `createReadStream`으로 스트리밍 파싱
- 캐시 키: `filePath + mtimeMs` → mtime 변경 시만 재파싱
- 불완전한 마지막 라인은 JSON.parse try/catch로 무시

### 3. 날짜 필터링: startDate 인덱스
JSONL 파일명에 날짜 없음 → 전체 스캔 필요.
**해법**: 서버 시작 시 startDate 인덱스 구축
- 모든 JSONL 파일의 **첫 레코드 timestamp만** 읽어 `Map<filePath, startDate>` 생성
- 1235개 파일 × 첫 1줄 = 초기 2~3초 소요 (readline으로 첫 줄만 읽고 stream 닫기)
- 일자별 조회 시 인덱스에서 startDate 일치 파일만 전체 파싱
- 새 파일 감지: API 호출 시 디렉토리 목록을 다시 읽어 인덱스에 없는 파일 추가

### 4. 세션 날짜 표시 정책
**시작일 기준**: 세션이 여러 날에 걸쳐도 startedAt 날짜에만 표시.
- 5/13 23시 시작 → 5/14 2시 종료 = 5/13일자에만 노출
- 세션 카드에 종료 시각 표시하므로 다음날까지 이어진 것을 사용자가 인지 가능

### 5. 서브에이전트(agent-*.jsonl) 처리
**Phase 1에서는 무시**. 메인 세션 JSONL(UUID.jsonl)만 파싱.
- agent-*.jsonl은 `<uuid>/subagents/` 하위에 위치하므로 glob 패턴 `*.jsonl`로 루트만 잡으면 자연스럽게 제외
- Phase 2에서 메인 세션에 병합 표시 검토

### 6. 활성 세션 감지 (크로스플랫폼)
`~/.claude/sessions/<pid>.json`에서 PID 확인 → `process.kill(pid, 0)`로 프로세스 존재 확인.
- Node.js 네이티브 API로 Windows/Mac/Linux 모두 동작
- try/catch로 감싸서 프로세스 없으면 false 반환

### 7. 캐시 무효화: 새 파일 감지
Phase 1에서는 chokidar 미사용 → API 호출 시마다 디렉토리 목록 재스캔.
- `GET /api/daily` 호출 시 프로젝트 디렉토리 readdir → 인덱스에 없는 파일 발견 시 첫 줄 파싱하여 인덱스 추가
- 기존 파일은 mtime 변경 시만 재파싱 (기존 캐시 전략 유지)
- 디렉토리 readdir은 가볍고(ms 단위) 매 요청마다 해도 성능 문제 없음

## 데이터 모델 (세션 요약)
```javascript
{
  sessionId, projectDir, projectPath, projectLabel,
  startedAt, endedAt,
  model, version,
  firstPrompt,           // 첫 비메타 사용자 텍스트 (200자 제한)
  tokens: { totalInput, totalOutput, cacheCreation, cacheRead },
  toolCalls: [           // 시간순 tool_use 목록
    { timestamp, name, input, toolUseId }
  ],
  toolUsage: { Bash: 8, Write: 3, Edit: 5 },  // 툴별 카운트
  filesChanged: [        // Write/Edit 대상 파일 (중복 제거)
    { path, action: 'created'|'modified' }
  ],
  isActive: false
}
```

## 사용자 메시지 추출 로직
```
1. message.content가 string인 경우:
   - <command-name>, <command-message>, <local-command> 등 태그로 시작하면 스킵
   - 일반 텍스트면 채택
2. message.content가 array인 경우:
   - type:"text" 항목 중 <태그>로 시작하지 않는 것 채택
   - type:"tool_result"만 있으면 스킵 (도구 결과 응답)
3. isMeta: true인 레코드는 무조건 스킵
```

## 구현 순서 (9단계)

### Step 1: 프로젝트 스캐폴딩
- 루트 package.json (concurrently로 서버+클라이언트 동시 실행)
- server/ 초기화 (express, cors, dayjs)
- client/ 초기화 (Vite React, TailwindCSS, dayjs, react-router-dom)
- Vite 프록시 설정 (/api → localhost:3001)
- .gitignore

### Step 2: pathDecoder.js + cacheManager.js
- JSONL 첫 레코드에서 cwd 추출하는 유틸
- mtime 기반 인메모리 캐시 (Map 구조)

### Step 3: jsonlParser.js
- readline 스트림 기반 JSONL 파서
- parseSessionSummary(filePath) → 세션 요약 객체 반환
- 추출 대상: user 메시지, assistant usage, tool_use 블록, Write/Edit 파일 경로

### Step 4: projectScanner.js
- ~/.claude/projects/ 스캔 → 프로젝트 목록
- 각 프로젝트의 cwd 해석 → label 생성
- startDate 인덱스 구축 (전체 JSONL 첫 줄 읽기)
- 활성 세션 감지 (sessions/*.json + process.kill PID 체크)

### Step 5: Express 라우트 (projects, sessions, daily)
- GET /api/projects → 프로젝트 목록
- GET /api/sessions/:projectId → 프로젝트 전체 세션
- GET /api/daily?date=YYYY-MM-DD&project=all|id → 일자별 세션

### Step 6: Express 서버 진입점
- cors, json, 라우트 마운트, 에러 핸들러
- port 3001

### Step 7: 프론트엔드 기본 구조
- Layout, ProjectSelector, DateNavigator 컴포넌트
- API 클라이언트 (fetch 래퍼)

### Step 8: SessionCard + ToolCallList 컴포넌트
- 세션 카드 UI (프롬프트, 토큰, 시간, 모델)
- 툴 호출 목록 (접기/펼치기, 기본 5개)
- 변경 파일 목록 (+생성 / ~수정 표시)

### Step 9: DailyPage 조합 + 라우팅
- DateNavigator + DailyView 조합
- 날짜/프로젝트 변경 시 데이터 재요청
- localStorage로 프로젝트 선택 유지

## 검증 방법
1. `npm run dev`로 서버+클라이언트 동시 실행
2. http://localhost:5173 접속
3. 프로젝트 드롭다운에 32개 프로젝트 표시 확인
4. 오늘 날짜 세션 목록 표시 확인
5. 날짜 이동 시 해당 날짜 세션으로 변경 확인
6. 프로젝트 필터 적용 시 해당 프로젝트만 표시 확인
7. 세션 카드에 첫 프롬프트, 툴 호출, 파일 변경, 토큰 표시 확인

## 주요 파일 (수정/생성 대상)
- `server/src/services/jsonlParser.js` — 핵심 파싱 로직
- `server/src/services/projectScanner.js` — 프로젝트 스캔 + 경로 해석
- `server/src/routes/daily.js` — 일자별 API (날짜 필터링 최적화)
- `client/src/components/SessionCard.jsx` — 세션 카드 UI
- `client/src/pages/DailyPage.jsx` — 메인 페이지 조합
