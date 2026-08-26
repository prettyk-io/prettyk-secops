import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionManager } from './SessionManager';

describe('Terminal Gateway — SessionManager', () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager();
  });

  afterEach(() => {
    manager.destroy();
  });

  it('creates workspace session with id, ws_url and ttl', () => {
    const res = manager.createSession({ mode: 'workspace', ttlMs: 60_000 });
    expect(res.ok).toBe(true);
    expect(res.session_id).toMatch(/^term_/);
    expect(res.ws_url).toContain('/ws');
    expect(res.mode).toBe('workspace');
    expect(res.ttl).toBe(60);
  });

  it('creates run-console session with run_id', () => {
    const res = manager.createSession({ mode: 'run-console', run_id: 'run-123' });
    expect(res.ok).toBe(true);
    expect(res.mode).toBe('run-console');
  });

  it('getSession returns status and quota', () => {
    const created = manager.createSession();
    const info = manager.getSession(created.session_id);
    expect(info).not.toBeNull();
    expect(info!.state).toBe('connected');
    expect(info!.quota.memoryLimitMb).toBe(512);
    expect(info!.ttl_remaining).toBeGreaterThan(0);
  });

  it('attachSession is idempotent and returns session', () => {
    const created = manager.createSession();
    const attached = manager.attachSession(created.session_id);
    expect(attached).not.toBeNull();
    expect(attached!.session_id).toBe(created.session_id);
    expect(attached!.state).toBe('connected');
  });

  it('execCommand executes and redacts secret output', () => {
    const created = manager.createSession();
    const res = manager.execCommand(created.session_id, {
      command: 'echo "Authorization: Bearer my-secret-token-123"',
    });
    expect(res.ok).toBe(true);
    expect(res.exit_code).toBe(0);

    const audit = manager.getAudit(created.session_id);
    expect(audit.length).toBe(1);
    expect(audit[0]!.command).toContain('Bearer ***');
    expect(audit[0]!.command).not.toContain('my-secret-token-123');
  });

  it('stop marks session terminated', () => {
    const created = manager.createSession();
    const res = manager.stop(created.session_id);
    expect(res.ok).toBe(true);
    const info = manager.getSession(created.session_id);
    expect(info!.state).toBe('terminated');
  });

  it('kill marks session terminated', () => {
    const created = manager.createSession();
    const res = manager.kill(created.session_id);
    expect(res.ok).toBe(true);
    const info = manager.getSession(created.session_id);
    expect(info!.state).toBe('terminated');
  });

  it('getQuota returns CPU, mem, disk, pids', () => {
    const created = manager.createSession();
    const quota = manager.getQuota(created.session_id);
    expect(quota).not.toBeNull();
    expect(quota!.memoryLimitMb).toBe(512);
    expect(quota!.pids).toBeGreaterThanOrEqual(1);
  });
});
