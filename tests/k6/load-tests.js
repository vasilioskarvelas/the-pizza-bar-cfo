// Phase 14 — k6 load-test scenarios. Run externally with k6 (https://k6.io).
// Do NOT run from the Base44 builder.
//
//   k6 run -e BASE_URL=https://APP_URL tests/k6/load-tests.js
//   k6 run -e BASE_URL=https://APP_URL -e STAGE=smoke tests/k6/load-tests.js
//
// STAGE: smoke | normal | peak | stress

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Counter } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'https://example.com';
const STAGE = __ENV.STAGE || 'normal';
const FUNCTIONS = __ENV.FUNCTIONS_PATH || '/_functions'; // confirm against your deployed Base44 app

const readTrend = new Trend('read_latency', true);
const dashTrend = new Trend('dashboard_latency', true);
const reportTrend = new Trend('report_latency', true);
const failCounter = new Counter('failures');

const STAGES = {
  smoke: { stages: [{ duration: '2m', target: 5 }] },
  normal: { stages: [{ duration: '2m', target: 20 }, { duration: '8m', target: 20 }] },
  peak: { stages: [{ duration: '3m', target: 100 }, { duration: '12m', target: 100 }] },
  stress: { stages: [{ duration: '2m', target: 50 }, { duration: '5m', target: 150 }, { duration: '3m', target: 250 }, { duration: '5m', target: 0 }] },
};

export const options = {
  stages: STAGES[STAGE].stages,
  thresholds: {
    read_latency: ['p(95)<2000'],
    dashboard_latency: ['p(95)<4000'],
    report_latency: ['p(95)<8000'],
    http_req_failed: ['rate<0.01'],
    failures: ['count<10'],
  },
};

function post(fn, body) {
  const res = http.post(`${BASE}${FUNCTIONS}/${fn}`, JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
  check(res, { 'status 2xx': (r) => r.status >= 200 && r.status < 300 });
  if (res.status >= 400) failCounter.add(1);
  return res;
}

export default function () {
  group('dashboard read', () => { const r = post('getExecutiveDashboard', {}); readTrend.add(r.timings.duration); });
  group('enterprise dashboard', () => { const r = post('getEnterpriseDashboard', {}); dashTrend.add(r.timings.duration); });
  group('enterprise analytics', () => { const r = post('getEnterpriseAnalytics', {}); dashTrend.add(r.timings.duration); });
  group('compliance listing', () => { const r = post('getComplianceCentre', {}); readTrend.add(r.timings.duration); });
  group('document vault', () => { const r = post('getDocumentVault', {}); readTrend.add(r.timings.duration); });
  group('organisation listing', () => { const r = post('getOrganisations', {}); readTrend.add(r.timings.duration); });
  group('site listing', () => { const r = post('getSites', {}); readTrend.add(r.timings.duration); });
  group('forecast', () => { const r = post('getForecast', { horizon: 12 }); reportTrend.add(r.timings.duration); });
  group('weekly report', () => { const r = post('generateWeeklyReport', {}); reportTrend.add(r.timings.duration); });
  group('ai summary', () => { const r = post('generateAISummary', {}); reportTrend.add(r.timings.duration); });
  sleep(1);
}