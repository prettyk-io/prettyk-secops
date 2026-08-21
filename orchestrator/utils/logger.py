# -*- coding: utf-8 -*-
"""
Логирование.
"""
import logging

logger = logging.getLogger("orchestrator")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
