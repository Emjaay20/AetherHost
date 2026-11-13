import http from 'k6/http';
import { check, sleep } from 'k6';

const baseUrl = __ENV.WORDPRESS_URL;
if (!baseUrl) {
  throw new Error('WORDPRESS_URL is required, for example http://demo.localhost');
}

export const options = {
  scenarios: {
    anonymous: { executor: 'constant-vus', vus: 5, duration: '60s', exec: 'anonymous' },
    cache_bypass: { executor: 'constant-vus', vus: 3, duration: '60s', exec: 'cacheBypass', startTime: '70s' },
    worker_saturation: { executor: 'ramping-vus', startVUs: 1, stages: [{ duration: '30s', target: 5 }, { duration: '60s', target: 20 }, { duration: '30s', target: 0 }], exec: 'anonymous', startTime: '140s' },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000'],
  },
};

export function anonymous() {
  const response = http.get(`${baseUrl}/`);
  check(response, { 'anonymous request succeeded': (r) => r.status === 200 || r.status === 302 });
  sleep(0.2);
}

export function cacheBypass() {
  const response = http.get(`${baseUrl}/?aetherhost-cache-bypass=1`, {
    headers: { Cookie: 'wordpress_logged_in_test=1' },
  });
  check(response, { 'bypassed request succeeded': (r) => r.status === 200 || r.status === 302 });
  sleep(0.2);
}
