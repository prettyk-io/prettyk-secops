/**
 * Встроенная нижняя панель с причиной невалидного манифеста или конструктора.
 */
import { CloseOutlined } from '@ant-design/icons';
import { Button, Typography } from 'antd';
import constructorNoPenguinIcon from '../assets/constructor-no-penguin.svg';
import validationErrorGearIcon from '../assets/validation-error-gear.svg';
import type { ConstructorBatchFail } from '../api/editorValidate';

export type ValidationFeedback = {
  title: string;
  description: string;
  errorCount: number;
  samples: readonly string[];
  samplesHint: string;
  fails?: readonly ConstructorBatchFail[];
};

export type ConstructorNoPenguinProps = ValidationFeedback & {
  onClose: () => void;
  onSelectFail?: (fail: ConstructorBatchFail) => void;
};

export function ConstructorNoPenguin({
  title,
  description,
  errorCount,
  samples,
  samplesHint,
  fails,
  onClose,
  onSelectFail,
}: ConstructorNoPenguinProps): React.JSX.Element {
  const hasFails = Boolean(fails && fails.length > 0 && onSelectFail);

  return (
    <section className="pk-studio-validation-panel" aria-label="Результат проверки">
      <div className="pk-studio-pane-head">
        <div className="pk-studio-pane-head-row">
          <Typography.Text className="pk-studio-pane-label">{title}</Typography.Text>
          <Button
            type="text"
            size="small"
            className="pk-studio-validation-close"
            aria-label="Закрыть результат проверки"
            icon={<CloseOutlined />}
            onClick={onClose}
          />
        </div>
      </div>
      <div className="pk-penguin-drawer-card">
        <div className="pk-penguin-stage" aria-hidden>
          <div className="pk-penguin-nod">
            <img
              className="pk-penguin-photo"
              src={constructorNoPenguinIcon}
              alt=""
              width={132}
              height={132}
              draggable={false}
            />
          </div>
        </div>
        <div className="pk-penguin-drawer-copy">
          <Typography.Paragraph className="pk-penguin-caption">
            {description} Найдено ошибок: <strong>{errorCount}</strong>. Исправьте и запустите
            проверку снова.
          </Typography.Paragraph>
          {samples.length > 0 && (
            <>
              <Typography.Text type="secondary" className="pk-penguin-samples-hint">
                {samplesHint}
              </Typography.Text>
              <ul className="pk-penguin-samples">
                {hasFails
                  ? fails!.map((fail, idx) => {
                      const loc = `${String(fail.line ?? 1)}:${String(fail.column ?? 1)}`;
                      return (
                        <li key={`${fail.id}:${idx}`} className="pk-penguin-sample-item">
                          <Button
                            type="link"
                            className="pk-penguin-fail-link"
                            onClick={() => onSelectFail!(fail)}
                          >
                            <img
                              className="pk-penguin-error-gear-icon"
                              src={validationErrorGearIcon}
                              alt=""
                              width={16}
                              height={16}
                              draggable={false}
                            />
                            <span className="pk-penguin-fail-link-text">
                              <strong>Ошибка валидации:</strong> {fail.objectId} {loc} — {fail.message}
                            </span>
                          </Button>
                        </li>
                      );
                    })
                  : samples.map((sample, idx) => (
                      <li key={`${sample}:${idx}`} className="pk-penguin-sample-item">
                        <span className="pk-penguin-fail-plain-text">
                          <img
                            className="pk-penguin-error-gear-icon"
                            src={`${import.meta.env.BASE_URL}validation-error-gear.svg`}
                            alt=""
                            width={16}
                            height={16}
                            draggable={false}
                          />
                          <span>
                            <strong>Ошибка валидации:</strong> {sample}
                          </span>
                        </span>
                      </li>
                    ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
