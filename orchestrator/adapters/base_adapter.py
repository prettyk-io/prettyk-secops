"""
Базовый адаптер с общими методами и контекстом.
"""


class BaseAdapter:
    def __init__(self, driver=None):
        self.driver = driver
        self.context = {}

    def set_context(self, context):
        self.context = context

    def resolve(self, value):
        # Legacy: context — плоский dict. Новые сценарии идут через DataStream.resolve.
        if not isinstance(value, str):
            return value
        text = value.strip()
        if text.startswith("${") and text.endswith("}"):
            key = text[2:-1].strip()
            return self.context.get(key, value)
        if text.startswith("{{") and text.endswith("}}"):
            key = text[2:-2].strip()
            return self.context.get(key, value)
        return value
