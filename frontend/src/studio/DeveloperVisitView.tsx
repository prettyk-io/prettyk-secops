/**
 * VISIT-UI: DeveloperVisitView — облегчённый режим Studio для Cosmoport.
 *
 * Режим включается через URL: /studio?mode=developer-visit&session=pk-ses-xxx
 *
 * Что скрыто: терминал, сырой прокси, ручная смена URL, destructive-атаки,
 *              кнопки администрирования, левый Explorer.
 * Что показано: живой viewport браузера, список endpoint'ов, панель находок,
 *               плашка сессии, кнопка «Завершить проверку».
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Button, Badge as AntBadge, Tag, Typography, Card, Empty, Spin, Progress, Space } from 'antd';
import {
  ClockCircleOutlined, CheckCircleOutlined, LinkOutlined,
  BugOutlined, ProjectOutlined, StopOutlined,
} from '@ant-design/icons';
import { BrowserPanel } from './BrowserPanel';
import { EvidencePanel } from '../results/EvidencePanel';

// ── Session info ──

interface VisitSession {
  sessionId: string; projectName: string; releaseTag: string;
  ttlSeconds: number; createdAt: number;
}

function parseVisitParams(): VisitSession | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode');
  if (mode !== 'developer-visit') return null;
  return {
    sessionId: params.get('session') || 'pk-ses-unknown',
    projectName: params.get('project') || 'Проект',
    releaseTag: params.get('release') || 'latest',
    ttlSeconds: Number(params.get('ttl')) || 300,
    createdAt: Date.now(),
  };
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ── Mock findings + endpoints ──

interface FindingEntry { id: string; severity: string; title: string; endpoint: string; }

const DEMO_FINDINGS: FindingEntry[] = [
  { id: 'f1', severity: 'high', title: 'SQL Injection in /api/login', endpoint: 'POST /api/login' },
  { id: 'f2', severity: 'medium', title: 'XSS Reflected in /search', endpoint: 'GET /api/search' },
  { id: 'f3', severity: 'low', title: 'Missing CSP header', endpoint: 'GET /#' },
];

const DEMO_ENDPOINTS = ['POST /api/login', 'GET /api/search', 'GET /api/profile', 'GET /assets/bundle.js'];

// ── Props ──

export interface DeveloperVisitViewProps {
  onFinish?: () => void;
}

export function DeveloperVisitView({ onFinish }: DeveloperVisitViewProps) {
  const session = useMemo(parseVisitParams, []);
  const [timeLeft, setTimeLeft] = useState(session?.ttlSeconds ?? 0);
  const [finished, setFinished] = useState(false);

  // TTL countdown
  useEffect(() => {
    if (!session || finished) return;
    const startT = Date.now();
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startT) / 1000);
      const left = Math.max(0, session.ttlSeconds - elapsed);
      setTimeLeft(left);
      if (left <= 0) { setFinished(true); clearInterval(interval); }
    }, 250);
    return () => clearInterval(interval);
  }, [session, finished]);

  const handleFinish = useCallback(async () => {
    if (!session) return;
    try {
      await fetch('/api/session/finish', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.sessionId }),
      });
    } catch { /* best-effort */ }
    setFinished(true);
    onFinish?.();
  }, [session, onFinish]);

  if (!session) {
    return <Empty description="Неверный URL сессии" />;
  }

  if (finished || timeLeft <= 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: '100vh',
        background: '#070B14', fontFamily: 'Golos UI, sans-serif', overflow: 'auto' }}>
        {/* ── Finish header ── */}
        <div style={{ textAlign: 'center', padding: '32px 16px 0' }}>
          <CheckCircleOutlined style={{ fontSize: 48, color: '#22C55E', marginBottom: 16 }} />
          <Typography.Title level={4} style={{ color: '#E2E8F0', margin: 0 }}>Сессия завершена</Typography.Title>
          <Typography.Text style={{ color: '#94A3B8', marginTop: 8, display: 'block' }}>Спасибо за проверку</Typography.Text>
        </div>
        {/* ── Evidence артефакты ── */}
        <div style={{ width: '100%', maxWidth: 700, padding: '16px 16px 32px' }}>
          <EvidencePanel runId={session.sessionId} />
        </div>
      </div>
    );
  }

  const progress = Math.round((timeLeft / Math.max(session.ttlSeconds, 1)) * 100);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#070B14',
      color: '#E2E8F0', fontFamily: 'Golos UI, sans-serif' }}>

      {/* ── Top bar: project + timer + finish ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px',
        background: '#0A0E1A', borderBottom: '1px solid #1E293B', flexShrink: 0 }}>
        <ProjectOutlined style={{ color: '#A855F7', fontSize: 16 }} />
        <div>
          <Typography.Text strong style={{ color: '#E2E8F0', fontSize: 14 }}>{session.projectName}</Typography.Text>
          <Tag color="purple" style={{ marginLeft: 8, fontSize: 10 }}>{session.releaseTag}</Tag>
        </div>
        <div style={{ flex: 1 }} />
        <Tag color="cyan" style={{ fontSize: 11 }}>Developer Visit</Tag>
        <Space size={4}>
          <ClockCircleOutlined style={{ color: timeLeft < 60 ? '#EF4444' : '#38BDF8' }} />
          <Typography.Text style={{ color: timeLeft < 60 ? '#EF4444' : '#38BDF8', fontSize: 13, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>
            {formatTime(timeLeft)}
          </Typography.Text>
        </Space>
        <Button icon={<StopOutlined />} onClick={handleFinish} size="small"
          style={{ background: 'rgba(239,68,68,0.1)', borderColor: '#EF4444', color: '#EF4444' }}>
          Завершить проверку
        </Button>
      </div>

      {/* ── Body: browser 70% + sidebar 30% ── */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Left: live browser viewport */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <BrowserPanel />
        </div>

        {/* Right sidebar: endpoints + findings */}
        <div style={{ width: 300, borderLeft: '1px solid #1E293B', overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: 0 }}>
          {/* Session card */}
          <div style={{ padding: '8px 12px', borderBottom: '1px solid #1E293B' }}>
            <Typography.Text strong style={{ color: '#E2E8F0', fontSize: 12 }}>Сессия</Typography.Text>
            <div style={{ marginTop: 4 }}>
              <Tag style={{ fontSize: 10 }}>{session.sessionId.slice(0, 16)}…</Tag>
            </div>
            <Progress percent={progress} size="small" status={timeLeft < 60 ? 'exception' : 'active'}
              showInfo={false} style={{ marginTop: 6 }} />
          </div>

          {/* Endpoints */}
          <div style={{ padding: '8px 12px', borderBottom: '1px solid #1E293B' }}>
            <Typography.Text strong style={{ color: '#38BDF8', fontSize: 12 }}>
              <LinkOutlined style={{ marginRight: 4 }} />Endpoints ({DEMO_ENDPOINTS.length})
            </Typography.Text>
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
              {DEMO_ENDPOINTS.map((ep, i) => <Tag key={i} color="blue" style={{ fontSize: 10, fontFamily: 'monospace' }}>{ep}</Tag>)}
            </div>
          </div>

          {/* Findings */}
          <div style={{ padding: '8px 12px', flex: 1 }}>
            <Typography.Text strong style={{ color: '#F59E0B', fontSize: 12 }}>
              <BugOutlined style={{ marginRight: 4 }} />Findings ({DEMO_FINDINGS.length})
            </Typography.Text>
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {DEMO_FINDINGS.map((f) => (
                <div key={f.id} style={{ padding: '6px 8px', borderRadius: 4,
                  background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.12)' }}>
                  <Space size={4}>
                    <Tag color={f.severity === 'high' ? 'red' : f.severity === 'medium' ? 'orange' : 'blue'}
                      style={{ fontSize: 9, lineHeight: '14px' }}>{f.severity.toUpperCase()}</Tag>
                    <Typography.Text style={{ fontSize: 11, color: '#E2E8F0' }}>{f.title}</Typography.Text>
                  </Space>
                  <Typography.Text style={{ fontSize: 10, color: '#64748B', display: 'block', marginTop: 2, fontFamily: 'monospace' }}>
                    {f.endpoint}
                  </Typography.Text>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}