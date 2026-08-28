"""COS-L4: Тесты Run & Batch модели."""
import pytest
from pydantic import ValidationError
from orchestrator.models.run_model import Batch, Run


class TestBatch:
    def test_default_status(self):
        b = Batch(id="b1", plan_id="p1", type="sast")
        assert b.status == "pending"

    def test_all_statuses(self):
        for status in ["pending", "running", "passed", "failed", "blocked"]:
            b = Batch(id="b1", plan_id="p1", type="sast", status=status)  # type: ignore[arg-type]
            assert b.status == status


class TestRun:
    def test_minimal(self):
        r = Run(
            id="run1", plan_id="p1", trigger="manual",
            domain_id="d1",
        )
        assert r.status == "pending"
        assert r.initiator == "system"

    def test_with_batches(self):
        b1 = Batch(id="b1", plan_id="p1", type="sast")
        b2 = Batch(id="b2", plan_id="p1", type="dast")
        r = Run(
            id="run1", plan_id="p1", trigger="scheduled",
            domain_id="d1", batches=[b1, b2],
        )
        assert len(r.batches) == 2

    def test_batch_wrong_plan_id(self):
        b = Batch(id="b1", plan_id="other_plan", type="sast")
        with pytest.raises(ValidationError):
            Run(
                id="run1", plan_id="p1", trigger="manual",
                domain_id="d1", batches=[b],
            )

    def test_invalid_trigger(self):
        with pytest.raises(ValidationError):
            Run(
                id="run1", plan_id="p1", trigger="on_push",  # type: ignore[arg-type]
                domain_id="d1",
            )

    def test_invalid_status(self):
        with pytest.raises(ValidationError):
            Run(
                id="run1", plan_id="p1", trigger="manual",
                domain_id="d1", status="cancelled",  # type: ignore[arg-type]
            )