/**
 * Results download action strip (S3776).
 */

export function ResultsActionsBar(props: {
  packageEnabled: boolean;
  /** false → кнопку акта не монтируем (generate_act off). */
  actDisplayed: boolean;
  actEnabled: boolean;
  savePackageIcon: string;
  downloadActIcon: string;
  onSavePackage?: () => void;
  onDownloadAct?: () => void;
  onPreviewAct?: () => void;
}): React.JSX.Element {
  const {
    packageEnabled,
    actDisplayed,
    actEnabled,
    savePackageIcon,
    downloadActIcon,
    onSavePackage,
    onDownloadAct,
    onPreviewAct,
  } = props;
  return (
    <>
      <button
        type="button"
        className={`pk-results-action-label${
          packageEnabled && onSavePackage ? '' : ' pk-results-action-label--muted'
        }`}
        data-testid="results-save-package"
        aria-disabled={!packageEnabled || !onSavePackage}
        aria-label={
          packageEnabled
            ? 'Сохранить пакет'
            : 'Сохранить пакет — ждём hooks URL Allure и DefectDojo'
        }
        onClick={() => {
          if (!packageEnabled || !onSavePackage) {
            return;
          }
          onSavePackage();
        }}
      >
        <img src={savePackageIcon} alt="" className="pk-results-action-icon" aria-hidden />
        <span>Сохранить пакет</span>
      </button>
      {actDisplayed ? (
        <>
          <button
            type="button"
            className={`pk-results-action-label${
              actEnabled ? '' : ' pk-results-action-label--muted'
            }`}
            data-testid="results-download-act"
            aria-disabled={!actEnabled}
            aria-label={
              actEnabled
                ? 'Сохранить акт'
                : 'Сохранить акт — нужна ось допуска и hooks URL Allure и DefectDojo'
            }
            onClick={() => {
              if (!actEnabled || !onDownloadAct) {
                return;
              }
              onDownloadAct();
            }}
          >
            <img src={downloadActIcon} alt="" className="pk-results-action-icon" aria-hidden />
            <span>Сохранить акт</span>
          </button>

          <button
            type="button"
            className={`pk-results-action-label${
              actEnabled ? '' : ' pk-results-action-label--muted'
            }`}
            data-testid="results-preview-act"
            aria-disabled={!actEnabled}
            aria-label={
              actEnabled
                ? 'Просмотр акта'
                : 'Просмотр акта — нужна ось допуска и hooks URL Allure и DefectDojo'
            }
            onClick={() => {
              if (!actEnabled || !onPreviewAct) {
                return;
              }
              onPreviewAct();
            }}
          >
            <img src={downloadActIcon} alt="" className="pk-results-action-icon" aria-hidden />
            <span>Просмотр акта</span>
          </button>
        </>
      ) : null}
    </>
  );
}
