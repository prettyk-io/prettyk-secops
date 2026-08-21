/**
 * Results hub tiles + tone map (S3776).
 */
import {
  hookTone,
  shellTone,
  type HubTone,
} from './resultsLiveMeta';
import type { ResultsHubTile } from './resultsHubTiles';
import type { LiveMetaSnapshot } from './types';

export function buildResultsHubTiles(opts: {
  allureReport: string | undefined;
  dojoReport: string | undefined;
  monitorUrl: string;
  liveLogo: string;
  allureLogo: string;
  defectDojoLogo: string;
}): ResultsHubTile[] {
  return [
    {
      key: 'live',
      label: 'SecOps Monitoring',
      href: opts.monitorUrl,
      logo: opts.liveLogo,
    },
    {
      key: 'allure',
      label: 'Allure',
      // Без hook URL — пусто (серый тайл); не подставляем stale lab default.
      href: opts.allureReport || '',
      logo: opts.allureLogo,
    },
    {
      key: 'dojo',
      label: 'DefectDojo',
      href: opts.dojoReport || '',
      logo: opts.defectDojoLogo,
    },
  ];
}

export function hubToneForKey(
  key: ResultsHubTile['key'],
  meta: LiveMetaSnapshot | null,
  allureReport: string | undefined,
  dojoReport: string | undefined,
): HubTone {
  if (key === 'live') {
    return shellTone(meta);
  }
  if (key === 'allure') {
    return hookTone(allureReport);
  }
  return hookTone(dojoReport);
}
