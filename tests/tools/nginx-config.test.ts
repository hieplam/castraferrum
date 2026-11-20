// The nginx configuration of the local name (local-name spec D3 and D4, goal G7): each directive is its own case.
// Comments are stripped first, so a directive that only appears in a comment does not count.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const FILE = resolve(__dirname, '../../deploy/local-name/nginx.conf');
const config = readFileSync(FILE, 'utf8')
  .split('\n')
  .map((line) => line.replace(/#.*$/, '').trim())
  .filter((line) => line !== '')
  .join('\n');

/** Every line (without the trailing semicolon) that holds a directive. */
const directives = config
  .split('\n')
  .map((l) => l.replace(/\s+/g, ' ').replace(/;$/, ''));

const REQUIRED = [
  'listen 443 ssl',
  'server_name LOCAL_NAME',
  'listen 80',
  'return 301 https://LOCAL_NAME$request_uri',
  'proxy_pass http://127.0.0.1:7070',
  'proxy_http_version 1.1',
  'proxy_set_header Connection ""',
  'proxy_set_header Host $host',
  'proxy_set_header X-Forwarded-Proto https',
  'proxy_set_header X-Real-IP $remote_addr',
  'proxy_set_header CF-Connecting-IP ""',
  'proxy_buffering off',
  'proxy_read_timeout 1h',
];

describe('deploy/local-name/nginx.conf', () => {
  for (const directive of REQUIRED) {
    it(`has the directive: ${directive}`, () => {
      expect(directives).toContain(directive);
    });
  }

  it('never appends to X-Forwarded-For (a device cannot add a false value)', () => {
    expect(config).not.toContain('proxy_add_x_forwarded_for');
  });

  it('never switches buffering on (SSE lines would be held back)', () => {
    expect(directives).not.toContain('proxy_buffering on');
  });

  it('is a complete main file: an events block and an http block', () => {
    expect(config).toMatch(/^events\s*\{/m);
    expect(config).toMatch(/^http\s*\{/m);
  });

  it('has the two certificate placeholders that the machine setup fills in', () => {
    expect(directives).toContain('ssl_certificate CERT_DIR/LOCAL_NAME-chain.pem');
    expect(directives).toContain('ssl_certificate_key CERT_DIR/LOCAL_NAME-key.pem');
  });
});
