/**
 * RES-2: оболочка «Результаты» + комната ожидания (Live /api/meta + report hooks).
 */

import { useMemo, useState } from 'react';
import { App, Alert, Button, Card, Typography } from 'antd';
import { getActiveCheckId, getCheck } from '../checks/checksStore';
import { diffLatestRuns } from '../checks/runDiff';
import allureLogo from '../assets/results/allure.png';
import defectDojoLogo from '../assets/results/defectdojo-tile.png';
import liveLogo from '../assets/results/live.png';
import savePackageIcon from '../assets/icons/pipeline-save-package.png';
import downloadActIcon from '../assets/icons/pipeline-download-act.png';
import {
  areReportHooksReady,
  isActDisplayed,
  isActDownloadEnabled,
  isAdmissionAxisReady,
  isResultsLaunchLocked,
  isResultsStopVisible,
} from './launchUi';
import {
  pipelineStatusFromMeta,
  type PipelineJobStatus,
} from './pipelineVerdict';
import { postRunStop } from './postRunStop';
import {
  hookReportUrl,
  isVncLive,
  mapLiveStatus,
  verdictLabel,
} from './resultsLiveMeta';
import { ResultsActionsBar } from './resultsActionsBar';
import { buildResultsHubTiles, hubToneForKey } from './resultsHubModel';
import { ResultsHubTiles } from './resultsHubTiles';
import { ResultsPipelineExtras } from './resultsPipelineExtras';
import { pipelineStatusLineContent } from './resultsPipelineLine';
import { LocatorHealStrip } from './LocatorHealStrip';
import { LocatorLabelStrip } from './LocatorLabelStrip';
import { ResultsJournalPanel } from './ResultsJournalPanel';
import { ResultsSummaryPanel } from './ResultsSummaryPanel';
import { BlankPanel } from './BlankPanel';
import type { LiveMetaSnapshot, ResultsHooksSnapshot } from './types';
import { useResultsLivePoll } from './useResultsLivePoll';

export type DownloadActContext = {
  meta: LiveMetaSnapshot | null;
  hooks: ResultsHooksSnapshot | null;
};

export type ResultsWorkspaceProps = {
  onDownloadAct?: (ctx: DownloadActContext) => void;
  /** RES-7 stub until zip pack lands. */
  onSavePackage?: () => void;
  /** Тот же старт, что header penguin / Studio baseline. */
  onLaunch?: () => void;
  launchStarting?: boolean;
  /** Deep-link в Live-монитор конкретного инстанса проверки. */
  monitorUrl?: string;
  /** Данные манифеста/формы для inline-превью акта */
  formData?: unknown;
};

export function ResultsWorkspace({
  onDownloadAct,
  onSavePackage,
  onLaunch,
  launchStarting = false,
  monitorUrl,
  formData,
}: ResultsWorkspaceProps): React.JSX.Element {
  const { message } = App.useApp();
  const { meta, hooks, launchFault, awaitingStart, labRunPhase } =
    useResultsLivePoll();
  const [stopping, setStopping] = useState(false);
  const [showBlankPreview, setShowBlankPreview] = useState(false);

  const runStatus = mapLiveStatus(
    typeof meta?.status === 'string' ? meta.status : undefined,
  );
  const shellOnline = Boolean(meta);
  const showVncLive = shellOnline && isVncLive(runStatus);
  const activeCheckId = getActiveCheckId();
  const checkHasOwnRuns = useMemo(() => {
    if (!activeCheckId) return false;
    const item = getCheck(activeCheckId);
    return Array.isArray(item?.runs) && item!.runs!.length > 0;
  }, [activeCheckId, meta?.run_id, meta?.last_export_run_id]);
  const runsRunId = useMemo(() => {
    if (!activeCheckId) return null;
    return getCheck(activeCheckId)?.runs?.[0]?.run_id ?? null;
  }, [activeCheckId, meta?.run_id, meta?.last_export_run_id]);
  const staleMeta = useMemo(() => {
    if (!meta || checkHasOwnRuns) return false;
    const verdict = pipelineStatusFromMeta(meta).verdict;
    return verdict !== 'running' && verdict !== 'idle';
  }, [meta, checkHasOwnRuns]);
  const pipeline: PipelineJobStatus = staleMeta ? { verdict: 'idle' } : pipelineStatusFromMeta(meta);
  const jobUrl = staleMeta ? undefined : pipeline.job_url || pipeline.html_url;
  const session = staleMeta
    ? '—'
    : typeof meta?.session_name === 'string' && meta.session_name.trim()
      ? meta.session_name
      : '—';
  const runDiffSummary = useMemo(() => {
    const id = getActiveCheckId();
    if (!id) return null;
    return diffLatestRuns(getCheck(id)?.runs)?.summary ?? null;
  }, [meta?.session_name, meta?.ci_verdict, meta?.status]);
  const allureReport = hookReportUrl(hooks, 'allure');
  const dojoReport = hookReportUrl(hooks, 'dojo');
  const hooksReady = areReportHooksReady(allureReport, dojoReport);
  const generateAct = meta?.generate_act === true;
  const actDisplayed = isActDisplayed(generateAct);
  const admissionAxisReady = isAdmissionAxisReady({
    verdict: pipeline.verdict,
    exitCode: typeof meta?.ci_exit_code === 'number' ? meta.ci_exit_code : null,
    admissionVoid:
      pipeline.risk_hints?.admission_void === true ||
      pipeline.risk_hints?.debug_mode === true,
    launchFault,
  });
  const actEnabled = isActDownloadEnabled({
    onDownloadAct,
    allureReportUrl: allureReport,
    dojoReportUrl: dojoReport,
    generateAct,
    admissionAxisReady,
  });
  const packageEnabled = hooksReady;
  const statusCss =
    launchFault === 'start_failed' || launchFault === 'timeout'
      ? launchFault
      : pipeline.verdict;
  const launchLocked = isResultsLaunchLocked({
    launchStarting,
    awaitingStart,
    verdict: pipeline.verdict,
    labRunPhase,
  });
  const stopVisible = isResultsStopVisible({
    launchStarting,
    awaitingStart,
    verdict: pipeline.verdict,
    labRunPhase,
  });
  const canLaunch = Boolean(onLaunch) && !launchLocked && !stopping;

  const tiles = buildResultsHubTiles({
    allureReport,
    dojoReport,
    monitorUrl: monitorUrl ?? '',
    liveLogo,
    allureLogo,
    defectDojoLogo,
  });

  const handleStop = () => {
    if (stopping) {
      return;
    }
    setStopping(true);
    postRunStop()
      .then((result) => {
        setStopping(false);
        if (result.ok) {
          message.info('Запуск остановлен');
          return;
        }
        if (result.idle) {
          message.warning('Запуск уже не идёт');
          return;
        }
        message.error(result.error);
      })
      .catch(() => {
        setStopping(false);
      });
  };

  return (
    <div className="pk-results">
      <div className="pk-results-inner">
        <Typography.Title level={3} className="pk-results-title">
          Результаты проверки
        </Typography.Title>

        <Card
          size="small"
          title="Статус запуска"
          className="pk-results-status"
          extra={
            onLaunch ? (
              <div className="pk-results-status-actions">
                <Button
                  type="primary"
                  size="small"
                  className="pk-results-run-btn"
                  data-testid="results-card-launch"
                  loading={launchStarting}
                  disabled={!canLaunch}
                  onClick={() => {
                    Promise.resolve(onLaunch()).catch(() => undefined);
                  }}
                >
                  Запустить
                </Button>
                <Button
                  size="small"
                  danger
                  className="pk-results-stop-btn"
                  data-testid="results-card-stop"
                  style={{ display: stopVisible ? undefined : 'none' }}
                  loading={stopping}
                  disabled={!stopVisible || stopping}
                  onClick={handleStop}
                >
                  Остановить
                </Button>
              </div>
            ) : null
          }
        >
          <div
            className={`pk-results-pipeline pk-results-pipeline--${statusCss}`}
            data-verdict={pipeline.verdict}
            data-fault={launchFault ?? undefined}
            data-exit-code={
              typeof pipeline.exit_code === 'number' ? pipeline.exit_code : undefined
            }
          >
            <button
              type="button"
              className="pk-results-pipeline-dot"
              aria-label={verdictLabel(pipeline.verdict, launchFault)}
              title={verdictLabel(pipeline.verdict, launchFault)}
            />
            <div className="pk-results-pipeline-body">
              <Typography.Text className="pk-results-pipeline-line">
                {pipelineStatusLineContent(pipeline, launchFault)}
              </Typography.Text>
              <ResultsPipelineExtras
                pipeline={pipeline}
                launchFault={launchFault}
                jobUrl={jobUrl}
                session={session}
              />
            </div>
          </div>
        </Card>

        <ResultsHubTiles
          tiles={tiles}
          toneFor={(key) => hubToneForKey(key, meta, allureReport, dojoReport)}
          shellOnline={shellOnline}
          showVncLive={showVncLive}
        />

        {runDiffSummary ? (
          <Alert
            type="info"
            showIcon
            className="pk-results-run-diff"
            data-testid="results-run-diff"
            message={runDiffSummary}
          />
        ) : null}

        {checkHasOwnRuns ? (
          <div
            className="pk-results-locator-strips"
            style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
          >
            <LocatorHealStrip
              meta={meta as Record<string, unknown> | null}
              onCopy={() => message.info('Локатор в буфере — вставь в PrettyK')}
            />
            <LocatorLabelStrip
              meta={meta as Record<string, unknown> | null}
              onCopy={() => message.info('Локатор в буфере — вставь в PrettyK')}
            />
          </div>
        ) : null}

        {checkHasOwnRuns ? <ResultsSummaryPanel meta={meta} hooks={hooks} /> : null}

        <ResultsJournalPanel monitorUrl={monitorUrl} runId={checkHasOwnRuns ? runsRunId : null} />

        <div className="pk-results-actions">
          <ResultsActionsBar
            packageEnabled={packageEnabled}
            actDisplayed={actDisplayed}
            actEnabled={actEnabled}
            savePackageIcon={savePackageIcon}
            downloadActIcon={downloadActIcon}
            onSavePackage={onSavePackage}
            onDownloadAct={
              onDownloadAct
                ? () => {
                    onDownloadAct({ meta, hooks });
                  }
                : undefined
            }
            onPreviewAct={() => setShowBlankPreview((v) => !v)}
          />
        </div>

        {showBlankPreview && formData ? (
          <BlankPanel
            kind="act"
            formData={formData}
            meta={meta}
            hooks={hooks}
            open={showBlankPreview}
            onClose={() => setShowBlankPreview(false)}
          />
        ) : null}
      </div>
    </div>
  );
}
