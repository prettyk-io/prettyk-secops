import { Switch } from 'antd';
import { useThemeMode } from '../theme/ThemeProvider';

export function ThemeToggle(props: { style?: React.CSSProperties }): React.JSX.Element {
  const { mode, setMode } = useThemeMode();
  return (
    <span className="pk-theme-toggle" style={props.style}>
      <Switch
        size="small"
        checked={mode === 'dark'}
        onChange={(checked) => {
          setMode(checked ? 'dark' : 'light');
        }}
        checkedChildren="Тьма"
        unCheckedChildren="Свет"
      />
    </span>
  );
}
