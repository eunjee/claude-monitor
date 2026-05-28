// 최소 서비스워커 — PWA 설치 가능 조건 충족용.
// 백엔드 API/SSE 가 필수라 오프라인 캐싱은 하지 않고 네트워크로 통과시킨다.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {
  // respondWith 를 호출하지 않으면 브라우저 기본 동작(네트워크)으로 처리됨
});
