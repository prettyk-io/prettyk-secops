/**
 * Единый wordmark «Pretty< SecOps Lab» — канонический брендовый лок-ап.
 * Обёртка над PrettyKMark (вариант 'secops') для Admin/Home/History.
 */
import { PrettyKMark } from '../components/PrettyKMark';

export type WordmarkProps = {
  onClick?: () => void;
};

export const WORDMARK_TEXT = 'Pretty< SECOPS LAB';

export function Wordmark({ onClick }: WordmarkProps = {}): React.JSX.Element {
  return <PrettyKMark variant="secops" onClick={onClick} />;
}
