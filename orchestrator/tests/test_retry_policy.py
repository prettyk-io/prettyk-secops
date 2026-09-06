# RUN-CTL-6: Тесты classify_error / should_retry / RetryPolicy.
import json
import socket

import pytest

from orchestrator.infra.retry_policy import (
    ErrorClass,
    RetryPolicy,
    classify_error,
    should_retry,
)

try:
    import psycopg2
    HAS_PSYCOPG2 = True
except ImportError:
    psycopg2 = None

try:
    import requests.exceptions
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False


class TestClassifyError:
    def test_psycopg2_operational_error_is_infrastructure(self):
        """classify_error(psycopg2.OperationalError) → INFRASTRUCTURE."""
        if psycopg2 is None:
            pytest.skip("psycopg2 not installed")

        class FakeOperationalError(psycopg2.OperationalError):
            pass

        exc = psycopg2.OperationalError("connection to server at ... failed")
        assert classify_error(exc) == ErrorClass.INFRASTRUCTURE

    def test_connection_refused_is_target(self):
        """classify_error(ConnectionRefusedError) → TARGET (acceptance)."""
        assert classify_error(ConnectionRefusedError()) == ErrorClass.TARGET

    def test_connection_reset_is_target(self):
        assert classify_error(ConnectionResetError()) == ErrorClass.TARGET

    def test_timeout_error_is_infrastructure(self):
        assert classify_error(TimeoutError()) == ErrorClass.INFRASTRUCTURE

    def test_json_decode_error_is_validation(self):
        assert classify_error(json.JSONDecodeError("Expecting value", "doc", 1)) == ErrorClass.VALIDATION

    def test_value_error_is_validation(self):
        assert classify_error(ValueError("bad manifest")) == ErrorClass.VALIDATION

    def test_key_error_is_validation(self):
        assert classify_error(KeyError("missing_field")) == ErrorClass.VALIDATION

    def test_requests_connection_error_is_target(self):
        if not HAS_REQUESTS:
            pytest.skip("requests not installed")
        exc = requests.exceptions.ConnectionError("connection refused by target")
        assert classify_error(exc) == ErrorClass.TARGET

    def test_socket_gaierror_is_target(self):
        assert classify_error(socket.gaierror(8, "nodename nor servname provided")) == ErrorClass.TARGET

    def test_unknown_error_is_unknown(self):
        class WeirdError(Exception):
            pass
        assert classify_error(WeirdError("something else")) == ErrorClass.UNKNOWN

    def test_malformed_marker_is_validation(self):
        class ManifestError(Exception):
            pass
        assert classify_error(ManifestError("manifest is malformed")) == ErrorClass.VALIDATION


class TestShouldRetry:
    def test_infrastructure_attempt1_max3_true(self):
        assert should_retry(ErrorClass.INFRASTRUCTURE, 1, 3) is True

    def test_infrastructure_attempt2_max3_true(self):
        assert should_retry(ErrorClass.INFRASTRUCTURE, 2, 3) is True

    def test_infrastructure_attempt3_max3_false(self):
        assert should_retry(ErrorClass.INFRASTRUCTURE, 3, 3) is False

    def test_infrastructure_attempt_over_max_false(self):
        assert should_retry(ErrorClass.INFRASTRUCTURE, 4, 3) is False

    def test_validation_never_retries(self):
        assert should_retry(ErrorClass.VALIDATION, 1, 3) is False
        assert should_retry(ErrorClass.VALIDATION, 2, 3) is False

    def test_target_never_retries(self):
        assert should_retry(ErrorClass.TARGET, 1, 3) is False

    def test_unknown_never_retries_fail_closed(self):
        assert should_retry(ErrorClass.UNKNOWN, 1, 3) is False

    def test_should_retry_accepts_string(self):
        assert should_retry("INFRASTRUCTURE", 1, 3) is True
        assert should_retry("VALIDATION", 1, 3) is False


class TestRetryPolicyDataclass:
    def test_default_policy(self):
        pol = RetryPolicy()
        assert pol.max_attempts == 3
        assert pol.backoff_s == 30.0
        assert ErrorClass.INFRASTRUCTURE.value in pol.retryable_classes

    def test_policy_should_retry(self):
        pol = RetryPolicy()
        assert pol.should_retry(ErrorClass.INFRASTRUCTURE, 1) is True
        assert pol.should_retry(ErrorClass.INFRASTRUCTURE, 3) is False
        assert pol.should_retry(ErrorClass.VALIDATION, 1) is False

    def test_policy_classify(self):
        pol = RetryPolicy()
        assert pol.classify(TimeoutError()) == ErrorClass.INFRASTRUCTURE
        assert pol.classify(ValueError("bad")) == ErrorClass.VALIDATION
