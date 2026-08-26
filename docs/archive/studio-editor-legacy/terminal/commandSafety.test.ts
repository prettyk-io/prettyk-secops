import { describe, expect, it } from 'vitest';
import {
  redactTerminalOutput,
  countRedactedSecrets,
  assessCommandRisk,
  buildCommandAuditStart,
  buildCommandAuditFinish,
} from './commandSafety';
import { formatPrettykDocument } from '../monaco/prettykFormat';

describe('redactTerminalOutput', () => {
  it('маскирует Bearer токены', () => {
    const out = redactTerminalOutput('curl -H "Authorization: Bearer abc.def.ghi" https://x');
    expect(out).not.toContain('abc.def.ghi');
    expect(out).toContain('Bearer ***');
  });

  it('маскирует Cookie и Set-Cookie целиком', () => {
    const out = redactTerminalOutput('Set-Cookie: session=sekrit123; Path=/');
    expect(out).not.toContain('sekrit123');
    expect(out).toContain('Set-Cookie: ***');
  });

  it('маскирует JWT compact-токен', () => {
    const out = redactTerminalOutput('token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig');
    expect(out).not.toContain('eyJhbGci');
    expect(out).toContain('***');
  });

  it('маскирует pk_live_ PAT', () => {
    const out = redactTerminalOutput('pk_live_a1b2c3d4e5f6a7b8');
    expect(out).toContain('pk_live_***');
    expect(out).not.toContain('a1b2c3d4');
  });

  it('маскирует password=value и api_key=value', () => {
    const out = redactTerminalOutput('password=hunter2 api_key=deadbeef');
    expect(out).not.toContain('hunter2');
    expect(out).not.toContain('deadbeef');
  });

  it('не трогает безобидный текст', () => {
    const text = 'pk validate /checks/abc';
    expect(redactTerminalOutput(text)).toBe(text);
  });

  it('считает количество маскированных секретов', () => {
    const text = 'Authorization: Bearer a.b.c\npassword=x\npassword=y';
    expect(countRedactedSecrets(text)).toBeGreaterThanOrEqual(3);
  });
});

describe('assessCommandRisk', () => {
  it('read-only команда → safe', () => {
    const a = assessCommandRisk('pk validate /checks/x');
    expect(a.risk).toBe('safe');
    expect(a.capabilities).toEqual([]);
  });

  it('активная атака → dangerous', () => {
    const a = assessCommandRisk('pk fuzz --target http://juice-shop:3000');
    expect(a.risk).toBe('dangerous');
    expect(a.capabilities).toContain('fuzzer:execute');
  });

  it('docker/kubectl → dangerous', () => {
    expect(assessCommandRisk('docker exec rm -rf /').risk).toBe('dangerous');
  });

  it('git push → caution', () => {
    const a = assessCommandRisk('git push origin main');
    expect(a.risk).toBe('caution');
  });

  it('rm -rf → dangerous', () => {
    expect(assessCommandRisk('rm -rf /tmp/run').risk).toBe('dangerous');
  });
});

describe('audit events', () => {
  it('start аудит не содержит raw секретов в команде', () => {
    const start = buildCommandAuditStart('curl -H "Authorization: Bearer abc.def" http://x', 'admin');
    expect(start.command).not.toContain('abc.def');
    expect(start.actor).toBe('admin');
    expect(start.risk).toBe('dangerous');
  });

  it('finish аудит фиксирует exit code и число redacted', () => {
    const start = buildCommandAuditStart('pk fuzz', 'admin');
    const finish = buildCommandAuditFinish(start, 0, 'Authorization: Bearer x.y.z\nok');
    expect(finish.exitCode).toBe(0);
    expect(finish.redactedSecrets).toBeGreaterThanOrEqual(1);
    expect(finish.finishedAt).toBeTruthy();
  });
});

describe('formatPrettykDocument', () => {
  it('нормализует CRLF и обрезает хвостовые пробелы', () => {
    const { formatted, changed } = formatPrettykDocument('Нажать css .ok   \r\nВвод x   ');
    expect(formatted).toBe('Нажать css .ok\nВвод x');
    expect(changed).toBe(true);
  });

  it('language-блоки получают canonical отступы', () => {
    const { formatted } = formatPrettykDocument('Если $ok {\nНажать css .a\n}\n');
    const lines = formatted.split('\n').filter(Boolean);
    expect(lines[1]).toContain('  Нажать');
  });

  it('без изменений → changed=false', () => {
    const { changed } = formatPrettykDocument('Нажать css .ok\nВвод x');
    expect(changed).toBe(false);
  });
});