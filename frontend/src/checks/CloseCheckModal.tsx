import { Button, Modal, Space } from 'antd';

export type CloseCheckModalProps = {
  open: boolean;
  onSaveAndLeave: () => void;
  onDiscardAndLeave: () => void;
  onStay: () => void;
};

export function CloseCheckModal({
  open,
  onSaveAndLeave,
  onDiscardAndLeave,
  onStay,
}: CloseCheckModalProps): React.JSX.Element {
  return (
    <Modal
      open={open}
      title="Закрыть проверку?"
      onCancel={onStay}
      footer={
        <Space wrap>
          <Button onClick={onStay} data-testid="close-check-stay">
            Остаться
          </Button>
          <Button onClick={onDiscardAndLeave} data-testid="close-check-discard">
            Не сохранять
          </Button>
          <Button type="primary" onClick={onSaveAndLeave} data-testid="close-check-save">
            Сохранить и выйти
          </Button>
        </Space>
      }
    >
      Есть изменения с момента открытия. Сохранить черновик проверки перед выходом?
    </Modal>
  );
}
