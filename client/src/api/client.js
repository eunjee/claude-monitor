const API_BASE = '/api';

async function fetchJson(url) {
  const res = await fetch(`${API_BASE}${url}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export function fetchProjects() {
  return fetchJson('/projects');
}

export function fetchDailySessions(date, project = 'all') {
  return fetchJson(`/daily?date=${date}&project=${project}`);
}

export function fetchDates(project = 'all') {
  return fetchJson(`/daily/dates?project=${project}`);
}

export function createMonitorStream(onEvent) {
  const eventSource = new EventSource(`${API_BASE}/monitor/stream`);

  eventSource.addEventListener('snapshot', (e) => {
    onEvent('snapshot', JSON.parse(e.data));
  });

  eventSource.addEventListener('update', (e) => {
    onEvent('update', JSON.parse(e.data));
  });

  eventSource.onerror = () => {};

  return eventSource;
}
