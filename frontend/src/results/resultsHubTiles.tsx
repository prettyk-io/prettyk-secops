/**
 * Results hub tile strip (S3776).
 */
import type { HubTone } from './resultsLiveMeta';

export type ResultsHubTile = {
  key: 'live' | 'allure' | 'dojo';
  label: string;
  href: string;
  logo: string;
};

type ToneFor = (key: ResultsHubTile['key']) => HubTone;

function liveShellAttr(shellOnline: boolean): 'online' | 'offline' {
  return shellOnline ? 'online' : 'offline';
}

function liveVncAttr(showVncLive: boolean): 'live' | 'idle' {
  return showVncLive ? 'live' : 'idle';
}

export function ResultsHubTiles(props: {
  tiles: ResultsHubTile[];
  toneFor: ToneFor;
  shellOnline: boolean;
  showVncLive: boolean;
}): React.JSX.Element {
  const { tiles, toneFor, shellOnline, showVncLive } = props;
  return (
    <div className="pk-results-hub" aria-label="Пульты результатов">
      {tiles.map((tile) => {
        const tone = toneFor(tile.key);
        const vncLive = tile.key === 'live' && showVncLive;
        const shellAttr = tile.key === 'live' ? liveShellAttr(shellOnline) : undefined;
        const vncAttr = tile.key === 'live' ? liveVncAttr(showVncLive) : undefined;
        const linkReady =
          tile.key === 'live'
            ? Boolean(tile.href)
            : tone === 'ready' && Boolean(tile.href);
        return (
          <a
            key={tile.key}
            className={`pk-results-tile pk-results-tile--${tone}`}
            href={linkReady ? tile.href : undefined}
            target={linkReady ? '_blank' : undefined}
            rel={linkReady ? 'noreferrer' : undefined}
            aria-label={tile.label}
            aria-disabled={linkReady ? undefined : true}
            data-tone={tone}
            data-shell={shellAttr}
            data-vnc={vncAttr}
            onClick={(event) => {
              if (!linkReady) {
                event.preventDefault();
              }
            }}
          >
            <span className="pk-results-tile-logo-wrap">
              <img src={tile.logo} alt="" className="pk-results-tile-logo" />
            </span>
            <span className="pk-results-tile-label">
              {vncLive ? (
                <span className="pk-results-live-chip" title="VNC / запуск">
                  <span className="pk-results-live-dot" aria-hidden="true" />
                  <span className="pk-results-live-chip-text">Live</span>
                </span>
              ) : null}
              <span className="pk-results-tile-label-text">{tile.label}</span>
            </span>
          </a>
        );
      })}
    </div>
  );
}
