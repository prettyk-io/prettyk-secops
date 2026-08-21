import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Empty, Result, Select, Table, Tag, Typography } from 'antd';
import { ProCard } from '@ant-design/pro-components';
import type { BankDeploy } from '../types';
import type { DojoFinding, DojoFindingsEnvelope } from '../fetchDojoFindings';
import { fetchDojoFindings } from '../fetchDojoFindings';

const SEV_COLOR: Record<string, string> = {
  critical: 'red',
  high: 'volcano',
  medium: 'orange',
  low: 'blue',
  info: 'default',
};

function sevSortValue(sev: string): number {
  const order = ['critical', 'high', 'medium', 'low', 'info'];
  const idx = order.indexOf(sev);
  return idx === -1 ? order.length : idx;
}

export type DojoFindingsTableProps = {
  deploys: readonly BankDeploy[];
  onOpenDeploy?: (deployId: string) => void;
};

export function DojoFindingsTable({
  deploys,
}: DojoFindingsTableProps): React.JSX.Element {
  const [selectedDeployId, setSelectedDeployId] = useState<string>();
  const [envelope, setEnvelope] = useState<DojoFindingsEnvelope | null>(null);
  const [loading, setLoading] = useState(false);

  const selected = useMemo(
    () => deploys.find((d) => d.deploy_id === selectedDeployId) ?? deploys[0],
    [deploys, selectedDeployId],
  );

  useEffect(() => {
    if (!deploys.length) {
      setEnvelope(null);
      return;
    }
    const deploy = deploys.find((d) => d.deploy_id === selectedDeployId) ?? deploys[0];
    const pid = (deploy?.project_id || '').trim();
    if (!pid) {
      setEnvelope({
        ok: false,
        status: 'bad_request',
        project_id: '',
        findings: null,
        error: 'project_id_required',
      });
      return;
    }
    let alive = true;
    setLoading(true);
    fetchDojoFindings(pid)
      .then((env) => {
        if (alive) {
          setEnvelope(env);
        }
      })
      .finally(() => {
        if (alive) {
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [deploys, selectedDeployId]);

  const onRetry = useCallback(() => {
    const pid = (selected?.project_id || '').trim();
    if (!pid) {
      return;
    }
    setLoading(true);
    fetchDojoFindings(pid)
      .then(setEnvelope)
      .finally(() => setLoading(false));
  }, [selected]);

  const status = envelope?.status ?? 'down';
  const ok = Boolean(envelope?.ok);

  const findings = useMemo(() => {
    const list = envelope?.findings ?? [];
    return [...list].sort(
      (a, b) => sevSortValue(a.severity) - sevSortValue(b.severity),
    );
  }, [envelope]);

  const columns = [
    {
      title: 'Severity',
      dataIndex: 'severity',
      width: 110,
      sorter: (a: DojoFinding, b: DojoFinding) =>
        sevSortValue(a.severity) - sevSortValue(b.severity),
      render: (sev: string) => (
        <Tag color={SEV_COLOR[sev] ?? 'default'}>{sev.toUpperCase()}</Tag>
      ),
    },
    {
      title: 'Находка',
      dataIndex: 'title',
      ellipsis: true,
      render: (title: string) => (
        <Typography.Text ellipsis title={title}>
          {title}
        </Typography.Text>
      ),
    },
    {
      title: 'CWE',
      dataIndex: 'cwe',
      width: 90,
      render: (cwe: number | string | null | undefined) =>
        cwe != null ? (
          <Typography.Text code>{String(cwe)}</Typography.Text>
        ) : (
          '—'
        ),
    },
    {
      title: 'Дата',
      dataIndex: 'date',
      width: 110,
      render: (d?: string) => d || '—',
    },
    {
      title: 'Статус',
      key: 'status',
      width: 150,
      render: (_: unknown, f: DojoFinding) => {
        const tags: string[] = [];
        if (f.verified) tags.push('verified');
        if (f.false_p) tags.push('false_p');
        if (f.is_mitigated) tags.push('mitigated');
        if (!tags.length) tags.push('active');
        return tags.map((t) => (
          <Tag
            key={t}
            color={t === 'verified' ? 'green' : t === 'false_p' ? 'orange' : 'default'}
          >
            {t}
          </Tag>
        ));
      },
    },
  ];

  return (
    <ProCard
      title="Находки (ACTIVE)"
      bordered
      data-testid="evidence-tab-findings"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {deploys.length === 0 ? (
          <Empty description="Нет деплоев — добавь приложение в Реестре" />
        ) : (
          <>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <Select
                value={selected?.deploy_id}
                onChange={setSelectedDeployId}
                style={{ minWidth: 280 }}
                options={deploys.map((d) => ({
                  value: d.deploy_id,
                  label: `${d.application_name} · ${d.project_id}`,
                }))}
              />
              <Tag
                color={
                  ok
                    ? 'success'
                    : status === 'unconfigured'
                      ? 'default'
                      : status === 'not_found'
                        ? 'warning'
                        : 'error'
                }
                data-testid="dojo-findings-status"
              >
                Dojo: {status}
                {envelope?.findings_n != null && ok ? ` · ${envelope.findings_n}` : ''}
              </Tag>
            </div>

            {!ok && status !== 'unconfigured' ? (
              <Result
                status={status === 'not_found' ? 'warning' : 'error'}
                title={`Dojo: ${status}`}
                subTitle={envelope?.error || 'Нет данных по проекту'}
                extra={
                  <Typography.Link
                    onClick={onRetry}
                    data-testid="dojo-findings-retry"
                  >
                    Повторить
                  </Typography.Link>
                }
              />
            ) : null}

            {ok ? (
              <>
                {(envelope?.verified || envelope?.false_p) && (
                  <Alert
                    type="info"
                    showIcon
                    message={`verified ${String(
                      Object.values(envelope?.verified ?? {}).reduce(
                        (a, b) => a + Number(b || 0),
                        0,
                      ),
                    )} · false_p ${String(
                      Object.values(envelope?.false_p ?? {}).reduce(
                        (a, b) => a + Number(b || 0),
                        0,
                      ),
                    )}`}
                  />
                )}
                <Table
                  size="small"
                  rowKey={(f) => String(f.id ?? f.title)}
                  loading={loading}
                  dataSource={findings}
                  columns={columns}
                  pagination={findings.length > 10 ? { pageSize: 10 } : false}
                />
              </>
            ) : null}
          </>
        )}
      </div>
    </ProCard>
  );
}
