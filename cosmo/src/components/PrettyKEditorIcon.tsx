import prettykEditorIcon from '../assets/prettyk-editor-icon.svg';

/**
 * App mark PrettyK — синяя K, без пестроты.
 * SVG из src/assets/prettyk-editor-icon.svg (favicon тот же).
 */
export function PrettyKEditorIcon({
  size = 22,
}: {
  size?: number;
}): React.JSX.Element {
  return (
    <img
      className="pk-prettyk-editor-icon"
      src={prettykEditorIcon}
      width={size}
      height={size}
      alt=""
      draggable={false}
    />
  );
}
