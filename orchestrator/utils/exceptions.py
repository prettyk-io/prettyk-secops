# -*- coding: utf-8 -*-
"""
Кастомные исключения.
"""


class OrchestratorError(Exception):
    pass


class ActionNotFoundError(OrchestratorError):
    pass


class AdapterError(OrchestratorError):
    pass
