"""COS-L12: Тесты Evidence Artifact Store."""
import json
import tempfile
from pathlib import Path

import pytest
from orchestrator.evidence.artifact_store import ArtifactStore


class TestArtifactStore:
    @pytest.fixture
    def tmp_store(self) -> ArtifactStore:
        with tempfile.TemporaryDirectory() as tmp:
            yield ArtifactStore(tmp)

    def test_store_screenshot(self, tmp_store: ArtifactStore):
        content = b"fake-png-bytes-12345"
        ref = tmp_store.store(content, "run-1/batch-1/step-1", "screenshot", "png")
        assert ref.content_type == "screenshot"
        assert ref.size_bytes == len(content)
        assert len(ref.sha256) == 64
        assert "run-1" in ref.path

    def test_store_and_retrieve(self, tmp_store: ArtifactStore):
        content = json.dumps({"status": "ok", "findings": 3}).encode()
        ref = tmp_store.store(content, "run-1/batch-2/step-5", "log", "json")
        retrieved = tmp_store.retrieve(ref)
        assert retrieved == content

    def test_store_request_response(self, tmp_store: ArtifactStore):
        req = b"GET / HTTP/1.1\r\nHost: example.com\r\n\r\n"
        res = b"HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n<html>ok</html>"

        req_ref = tmp_store.store(req, "run-1/batch-1/step-0", "request", "http")
        res_ref = tmp_store.store(res, "run-1/batch-1/step-0", "response", "http")

        assert req_ref.content_type == "request"
        assert res_ref.content_type == "response"
        assert tmp_store.retrieve(req_ref) == req
        assert tmp_store.retrieve(res_ref) == res

    def test_list_artifacts(self, tmp_store: ArtifactStore):
        import time
        tmp_store.store(b"log1", "run-1/batch-1", "log", "json")
        time.sleep(0.002)  # prevent identical millisecond timestamp
        tmp_store.store(b"log2", "run-1/batch-1", "log", "json")
        tmp_store.store(b"other", "run-2/batch-1", "log", "json")

        refs = tmp_store.list_artifacts("run-1/batch-1")
        assert len(refs) == 2

    def test_cleanup(self, tmp_store: ArtifactStore):
        tmp_store.store(b"data", "run-1/batch-1", "log", "json")
        tmp_store.store(b"data2", "run-1/batch-2", "log", "json")

        count = tmp_store.cleanup("run-1/batch-1")
        assert count == 1
        assert len(tmp_store.list_artifacts("run-1/batch-1")) == 0
        assert len(tmp_store.list_artifacts("run-1/batch-2")) == 1

    def test_file_not_found(self, tmp_store: ArtifactStore):
        from orchestrator.evidence.artifact_store import ArtifactRef
        fake_ref = ArtifactRef(
            ref_id="deadbeef", path="nonexistent/file.json",
            content_type="log", size_bytes=0, sha256="0" * 64,
            provenance="none",
        )
        with pytest.raises(FileNotFoundError):
            tmp_store.retrieve(fake_ref)