"""Пауза: wire передаёт seconds строкой."""
from adapters.data_processor import DataProcessor


def test_sleep_accepts_string_seconds(monkeypatch):
    seen = []

    def fake_sleep(sec):
        seen.append(sec)

    monkeypatch.setattr("adapters.data_processor.time.sleep", fake_sleep)
    DataProcessor.sleep("2")
    assert seen == [2.0]


def test_sleep_accepts_float(monkeypatch):
    seen = []
    monkeypatch.setattr("adapters.data_processor.time.sleep", lambda s: seen.append(s))
    DataProcessor.sleep(1.5)
    assert seen == [1.5]
