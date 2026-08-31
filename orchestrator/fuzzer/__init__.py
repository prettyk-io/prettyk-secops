# -*- coding: utf-8 -*-
"""Corpus Fuzzer Engine — production-grade fuzzing cycle (CF-B1/B2/B3)."""
from __future__ import annotations

from fuzzer.models import EndpointSpec, FindingRecord, FuzzParam, FuzzerProfile
from fuzzer.profiles import (
    DEVELOPER_SAFE,
    FULL_ACTIVE,
    INTRUSIVE_FUZZ,
    PROFILE_LABELS,
    filter_payloads_for_profile,
    requires_destructive_flag,
)
from fuzzer.payload_generator import PayloadGenerator
from fuzzer.detectors import (
    Detector,
    detect_all,
    detect_cmdi,
    detect_sqli,
    detect_ssrf,
    detect_xss,
)
from fuzzer.finding_pipeline import FindingPipeline
from fuzzer.corpus_fuzzer import ProductionCorpusFuzzer

__all__ = [
    "EndpointSpec",
    "FindingRecord",
    "FuzzParam",
    "FuzzerProfile",
    "DEVELOPER_SAFE",
    "FULL_ACTIVE",
    "INTRUSIVE_FUZZ",
    "PROFILE_LABELS",
    "filter_payloads_for_profile",
    "requires_destructive_flag",
    "PayloadGenerator",
    "Detector",
    "detect_all",
    "detect_cmdi",
    "detect_sqli",
    "detect_ssrf",
    "detect_xss",
    "FindingPipeline",
    "ProductionCorpusFuzzer",
]