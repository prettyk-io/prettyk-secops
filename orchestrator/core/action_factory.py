# -*- coding: utf-8 -*-
"""
Фабрика действий: маппинг ключевых слов на методы адаптеров.
"""


class ActionFactory:
    def __init__(self):
        self._registry = {}

    def register(self, component, action, method):
        self._registry[(component, action)] = method

    def get_method(self, component, action):
        return self._registry.get((component, action))

    def actions_for(self, component):
        """Ключевые слова компонента — для подсказок при опечатке в манифесте."""
        return sorted(action for comp, action in self._registry if comp == component)

    def components(self):
        return sorted({comp for comp, _ in self._registry})

    def execute(self, component, action, params, context):
        method = self.get_method(component, action)
        if method is None:
            raise ValueError(f"Unknown action: {component}.{action}")

        # Целая ${ref} или mid-string шаблон (URL / заголовки).
        resolve_arg = getattr(context, "resolve_arg", None)
        resolved_params = {}
        for key, value in params.items():
            if isinstance(value, str):
                if resolve_arg is not None:
                    resolved_params[key] = resolve_arg(value)
                else:
                    resolved_params[key] = context.resolve(value)
            else:
                resolved_params[key] = value

        return method(**resolved_params)
