/**
 * AuditView — F-3 mode 2: dual 50/50 log columns, synchronized scroll.
 */
import { useExecutionSSE } from '../useExecutionSSE';
import { LogViewer } from '../logs/LogViewer';
import { useExecutionStore } from '../useExecutionStore';

interface AuditViewProps {
  highlightedEventId?: string | null;
}

export function AuditView({ highlightedEventId }: AuditViewProps) {
  const { currentTime, duration } = useExecutionStore();
  const stream = useExecutionSSE();
  return (
    <div className="flex-1">
      <LogViewer
        logs={stream.logs}
        currentTime={currentTime}
        duration={duration}
        highlightedEventId={highlightedEventId}
      />
    </div>
  );
}