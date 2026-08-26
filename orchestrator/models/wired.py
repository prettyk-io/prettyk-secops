"""
Pydantic-модели манифеста.

Источник правды — docs/Wired.json (JSON Schema / Форма / Редактор).
Чего нет в схеме — не держим как поле модели. Legacy-ключи из старых JSON
глотаем в before-валидаторах и выбрасываем (не возвращаем в SoT).
Runtime-производные pages.elements/actions остаются: materialize из constructor.
"""
from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


StrictModel = ConfigDict(extra="ignore")


def strip_legacy_wired_dict(data: Any) -> Any:
    """Нормализует входящий манифест:
    - Плоский {regulation, editor} → legacy-структура
    - base_url/allowed_extra_domains из security_configuration → infrastructure
    """
    if not isinstance(data, dict):
        return data
    result = dict(data)

    # RK-SPLIT: конвертировать плоский JSON → legacy
    regulation = result.get("regulation")
    editor = result.get("editor")
    if isinstance(regulation, dict) and isinstance(editor, dict):
        converted: Dict[str, Any] = {}
        converted["meta"] = regulation.get("meta", {})
        converted["infrastructure"] = regulation.get("infrastructure", {})
        if "security_configuration" in regulation:
            converted["security_configuration"] = regulation["security_configuration"]

        ts: Dict[str, Any] = {}
        for key in ("scenarios", "imports"):
            val = editor.get(key)
            if isinstance(val, list) and len(val) > 0:
                ts[key] = val
        # pages: flat format has [], legacy expects {}
        pages = editor.get("pages")
        if isinstance(pages, list) and len(pages) > 0:
            ts["pages"] = pages
        elif isinstance(pages, dict) and len(pages) > 0:
            ts["pages"] = pages
        modules = editor.get("modules")
        if isinstance(modules, dict):
            for mk, mv in modules.items():
                if isinstance(mv, list) and len(mv) > 0:
                    ts[mk] = mv
        for key in ("editor_folders", "fuzzer_targets"):
            val = editor.get(key)
            if val is not None:
                ts[key] = val
        converted["test_suites"] = ts

        ft = editor.get("fuzzer_targets")
        if isinstance(ft, list):
            converted["scanning_and_fuzzing_targets"] = ft

        result = converted

    # Hoist base_url/allowed_extra_domains из security_configuration → infrastructure
    sec = result.get("security_configuration")
    if isinstance(sec, dict):
        infra = result.get("infrastructure")
        if not isinstance(infra, dict):
            infra = {}
            result["infrastructure"] = infra
        for key in ("base_url_override", "allowed_extra_domains"):
            if isinstance(infra.get(key), str) and infra[key].strip():
                continue
            if isinstance(sec.get(key), str):
                infra[key] = sec[key]
    return result


def _legacy_page_step_action(data: Any) -> Any:
    """Если передано старое имя page_step_action и нет description — используем его как description."""
    if isinstance(data, dict) and "page_step_action" in data and not data.get("description"):
        data = dict(data)
        data["description"] = data["page_step_action"]
    return data


class Meta(BaseModel):
    assessment_purpose: Literal["scheduled", "pre_release", "emergency", "manual"] = Field(
        ..., title="Назначение проверки"
    )
    project_id: Optional[str] = Field("owasp-zap-tests", title="Приложения участвующие в проверке:")
    initiator_name: Optional[str] = Field(
        "ss7developer@dev.spaceport.ru Космопорт Разработчик",
        title="Инициатор проверки:",
    )
    app_leader: Optional[str] = Field(
        "ss7leader-itlead@dev.spaceport.ru Космопорт ИТ-Лидер",
        title="Ответственный за проверяемое приложение",
    )
    scheduled_info: Optional[str] = Field(
        None, title="Информация о назначении проверки и плане тестирования"
    )
    release_domain: Optional[str] = Field(
        None, title="Домен развертывания для релизной сборки приложения"
    )
    compliance_requirements: Optional[str] = Field(
        None, title="Предъявляемые к проверке требования и нормативы"
    )
    release_manager: Optional[str] = Field(None, title="Ответственный за релиз")
    emergency_reason: Optional[str] = Field(None, title="Основания для внештатной проверки")
    generate_act: Optional[bool] = Field(
        False,
        title="Формировать акт проверки",
        description="Без оси допуска акт не сформируется; для релиза обязательно.",
    )

    @model_validator(mode="after")
    def _generate_act_by_purpose(self) -> "Meta":
        """Зеркало allOf: manual → off, pre_release → on, иначе default false."""
        if self.assessment_purpose == "manual":
            self.generate_act = False
        elif self.assessment_purpose == "pre_release":
            self.generate_act = True
        elif self.generate_act is None:
            self.generate_act = False
        return self


class Infrastructure(BaseModel):
    """Поля таймаутов/webswing приходят из allOf схемы; extras схемой не запрещены."""

    base_url_override: str = Field(
        "http://runner01.dev.spaceport.ru:8080", title="URL Сканирования"
    )
    allowed_extra_domains: str = Field(
        "", title="Дополнительные разрешенные URL",
    )
    # PURE (2026-08-21): URLs to explicitly exclude from ZAP context via set_context_exclude.
    blocked_urls_list: list[str] = Field(
        default_factory=list,
        title="Заблокированные URL",
    )
    zap_mode: Literal["demon"] = Field("demon", title="Режим работы ZAP")
    browser_type: Literal["chrome", "chrome-headless", "firefox", "firefox-headless"] = Field(
        "chrome", title="Браузер-исполнитель"
    )
    additional_local_server_port: Optional[int] = Field(
        None,
        ge=1024,
        le=65535,
        title="Дополнительный порт ZAP (API + Proxy)",
    )
    zap_work_timeout_min: Optional[int] = Field(
        60, ge=10, le=180, title="Таймаут работы ZAP (от 10 до 180 минут)"
)
    idle_timeout_min: Optional[int] = Field(
        10, ge=5, le=30, title="Таймаут бездействия (от 5 до 30 минут)"
    )
    # Эпик DBG: Live pause/resume + all-failsafe + admission_void (см. docs/backlog.md § DBG).
    debug_mode: bool = Field(
        False,
        title="Режим отладки",
        description=(
            "Операторский прогон: пауза в Live, all-failsafe, без idle/work kill. "
            "Допуск по этому прогону недействителен."
        ),
    )

    def session_timeout_min(self) -> int:
        """Сколько живёт прогон — всегда zap_work_timeout."""
        daemon = self.zap_work_timeout_min
        if daemon is not None:
            return int(daemon)
        return 60


class SecurityConfiguration(BaseModel):
    """Политика/auth. URL скана — в Infrastructure; поля ниже только legacy-import."""

    base_url_override: Optional[str] = Field(None, title="URL Сканирования (legacy)")
    allowed_extra_domains: Optional[str] = Field(
        None, title="Дополнительные разрешенные URL (legacy)"
    )
    scan_policy: Literal[
        "custom_policy",
        "scanner_fuzzing",
        "openapi_schema",
        "api_scanner",
        "scanner_crawler",
    ] = Field(..., title="Политика сканирования ZAP")
    auth_type: str = Field("Без авторизации", title="Тип авторизации")
    auth_details: Dict[str, Any] = Field(default_factory=dict, title="Детали авторизации")
    active_auth_module: Optional[str] = Field(
        None,
        title="Активный auth-модуль",
        description=(
            "id листа module_type=Авторизация; CSV id1,id2 — compose по порядку; "
            "пусто — legacy auth_type"
        ),
    )


class Element(BaseModel):
    model_config = StrictModel

    id: str = Field(..., title="Идентификатор")
    label: Optional[str] = Field("", title="Название объекта")
    constructor: str = Field(..., title="Конструктор")
    slot: Optional[str] = Field(
        None,
        title="Slot",
        description="Имя или номер слота для payload page_call (число — строкой; кнопки — без slot)",
    )

    @field_validator("slot", mode="before")
    @classmethod
    def _slot_as_str(cls, value: Any) -> Any:
        if value is None or value == "":
            return None
        return str(value)


class PageAction(BaseModel):
    model_config = StrictModel

    id: str = Field(..., title="Идентификатор")
    description: Optional[str] = Field(None, title="Описание шага")
    constructor: str = Field(..., title="Конструктор")

    @model_validator(mode="before")
    @classmethod
    def _legacy(cls, data: Any) -> Any:
        return _legacy_page_step_action(data)


class ActionStep(BaseModel):
    model_config = StrictModel

    # id — legacy; форма больше не требует (Allure ← description)
    id: Optional[str] = Field(None, title="Идентификатор")
    constructor: str = Field(..., title="Конструктор")
    description: Optional[str] = Field(None, title="Описание шага")
    failsafe: bool = Field(False, title="Ожидать ошибку")
    retry: int = Field(0, ge=0, title="Количество повторных попыток")
    retry_delay: int = Field(2, ge=1, title="Задержка между попытками (сек)")
    continue_on_failure: bool = Field(False, title="Продолжать при ошибке")
    save_as: str = Field("", title="Сохранить результат в переменную")

    @model_validator(mode="before")
    @classmethod
    def _legacy(cls, data: Any) -> Any:
        return _legacy_page_step_action(data)


class Scenario(BaseModel):
    model_config = StrictModel

    scenario_name: str = Field(..., title="Название сценария")
    description: Optional[str] = Field(
        None, title="Описание / Allure suite"
    )
    # id — legacy; форма больше не требует
    id: Optional[str] = Field(None, title="Идентификатор")
    continue_on_failure: bool = Field(False, title="Продолжать при ошибке")
    steps: List[ActionStep] = Field(default_factory=list, title="Шаги сценария")


class Page(BaseModel):
    model_config = StrictModel

    title: str = Field(..., title="Название страницы")
    path: Optional[str] = Field("", title="Относительный путь")
    # Форма/схема: constructor. elements/actions — materialize / legacy JSON.
    constructor: str = Field("", title="Макет и логика страницы")
    elements: List[Element] = Field(default_factory=list, title="Элементы страницы")
    actions: List[PageAction] = Field(default_factory=list, title="Действия на странице")


class FuzzRequestTemplate(BaseModel):
    """Повторяемый HTTP-запрос POC без body/header mutation."""

    model_config = StrictModel

    method: Literal["GET"] = Field("GET", title="HTTP-метод")
    url: str = Field(..., min_length=1, title="URL без query-параметра фаззинга")
    headers: Dict[str, str] = Field(default_factory=dict, title="Заголовки")
    follow_redirects: bool = Field(True, title="Следовать redirect")


class FuzzQueryInjection(BaseModel):
    """Единственная точка подстановки первого POC — query-параметр."""

    model_config = StrictModel

    query_param: str = Field(..., min_length=1, title="Имя query-параметра")
    corpus: str = Field(..., min_length=1, title="Ресурс corpus")


class FuzzLimits(BaseModel):
    """Жёсткий безопасный предел Alpha+ POC."""

    model_config = StrictModel

    max_requests: int = Field(25, ge=1, le=25, title="Максимум запросов")
    requests_per_second: float = Field(
        1.0, gt=0, le=1.0, title="Запросов в секунду"
    )
    timeout_seconds: int = Field(10, ge=1, le=10, title="Таймаут запроса, сек.")


class FuzzObservation(BaseModel):
    """Наблюдения, а не автоматическое утверждение уязвимости."""

    model_config = StrictModel

    alert_on_server_error: bool = Field(True, title="Отмечать 5xx")
    latency_multiplier: float = Field(
        3.0, ge=1.5, le=5.0, title="Порог задержки к baseline"
    )


class FuzzingFields(BaseModel):
    """Исполняемая спецификация безопасного последовательного FuzzRun."""

    model_config = StrictModel

    request: FuzzRequestTemplate
    injection: FuzzQueryInjection
    limits: FuzzLimits = Field(default_factory=FuzzLimits)
    observation: FuzzObservation = Field(default_factory=FuzzObservation)


class FuzzerMessageSpec(BaseModel):
    """Источник сообщения для сущности Fuzzer (Editor → Campaign)."""

    model_config = StrictModel

    source: Literal["template", "history"] = Field("template", title="Источник")
    method: Literal["GET"] = Field("GET", title="HTTP-метод")
    url: Optional[str] = Field(None, title="URL шаблона")
    history_url_contains: Optional[str] = Field(
        None, title="History: URL contains"
    )
    history_method: Optional[str] = Field("GET", title="History: method filter")
    session_replay: bool = Field(True, title="Replay Cookie/Authorization")
    headers: Dict[str, str] = Field(default_factory=dict, title="Заголовки")
    follow_redirects: bool = Field(True, title="Следовать redirect")


class FuzzerLocationSpec(BaseModel):
    model_config = StrictModel

    kind: Literal["query_param"] = Field("query_param", title="Тип дырки")
    name: str = Field(..., min_length=1, title="Имя параметра")


class FuzzerPolicySpec(BaseModel):
    model_config = StrictModel

    max_requests: int = Field(25, ge=1, le=25, title="Максимум запросов")
    requests_per_second: float = Field(
        1.0, gt=0, le=1.0, title="Запросов в секунду"
    )
    alert_on_server_error: bool = Field(True, title="Отмечать 5xx")
    latency_multiplier: float = Field(
        3.0, ge=1.5, le=5.0, title="Порог задержки к baseline"
    )
    size_ratio: float = Field(3.0, ge=1.5, le=10.0, title="Порог size к baseline")
    size_abs_delta: int = Field(2048, ge=0, title="Абсолютный порог size, байт")


class FuzzTarget(BaseModel):
    """Строка таблицы фаззинга (цель: url | method | corpus | body)."""

    model_config = StrictModel

    url: str = Field(..., min_length=1, title="URL цели")
    method: Literal["GET", "POST", "PUT", "PATCH", "DELETE"] = Field(
        "GET", title="HTTP-метод"
    )
    corpus: str = Field(
        "intent_boundary", title="Corpus (resource as или intent_*)"
    )
    body: Optional[str] = Field(
        None, title="Шаблон тела (JSON/Form) с масками {MASK} / {MASK_N}"
    )


class SuiteFuzzer(BaseModel):
    """Сущность Fuzzer в Редакторе (алгоритм + политика + таблица троек)."""

    model_config = StrictModel

    id: str = Field(..., min_length=1, title="Идентификатор Fuzzer")
    label: Optional[str] = Field(None, title="Название")
    title: Optional[str] = Field(None, title="Человекочитаемое название")
    description: Optional[str] = Field(None, title="Описание")
    algorithm: str = Field("triples", title="Алгоритм фаззинга")
    policy: FuzzerPolicySpec = Field(default_factory=FuzzerPolicySpec)
    targets: List[FuzzTarget] = Field(default_factory=list, title="Таблица троек")

    # Wave-level headers/replay
    session_replay: bool = Field(True, title="Replay Cookie/Authorization")
    headers: Dict[str, str] = Field(default_factory=dict, title="Заголовки")
    follow_redirects: bool = Field(True, title="Следовать redirect")

    # Legacy fields for soft compatibility
    message: Optional[FuzzerMessageSpec] = None
    location: Optional[FuzzerLocationSpec] = None
    corpus: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def _migrate_legacy_fuzzer_fields(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        out = dict(data)
        targets = list(out.get("targets") or [])
        if not targets:
            msg = out.get("message")
            corp = out.get("corpus")
            url = ""
            method = "GET"
            if isinstance(msg, dict):
                url = msg.get("url") or ""
                method = msg.get("method") or "GET"
            elif hasattr(msg, "url"):
                url = getattr(msg, "url", "") or ""
                method = getattr(msg, "method", "GET") or "GET"

            if not corp and hasattr(out, "corpus"):
                corp = getattr(out, "corpus", None)

            if url and corp:
                targets.append({
                    "url": url,
                    "method": method,
                    "corpus": corp,
                })
            out["targets"] = targets
        return out


class RequestMixerFields(BaseModel):
    model_config = StrictModel

    chain: Optional[str] = Field(None, title="Цепь вызовов")
    headers: Optional[str] = Field(None, title="Заголовки")
    body: Optional[str] = Field(None, title="Тело запроса")


class ConnectorFields(BaseModel):
    model_config = StrictModel

    connector_type: Optional[
        Literal[
            "База данных",
            "Система логгирования",
            "Prometheus",
            "SSH",
            "Очередь сообщений",
        ]
    ] = Field(None, title="Тип подключения")
    notes: Optional[str] = Field("", title="Заметки")
    metric_packs: Optional[str] = Field("", title="Metric packs (CSV)")
    db_engine: Optional[
        Literal["PostgreSQL", "MySQL/MariaDB", "Microsoft SQL Server", "MongoDB"]
    ] = Field("PostgreSQL", title="СУБД")
    dsn: Optional[str] = Field(None, title="DSN (read-only)")
    schema_name: Optional[str] = Field(None, title="Схема / БД")
    read_only: Optional[bool] = Field(True, title="Только чтение")
    log_source: Optional[
        Literal["Splunk", "Elasticsearch", "Grafana Loki", "HTTP endpoint", "Splunk-like"]
    ] = Field("Splunk", title="Источник логов")
    log_query: Optional[str] = Field(None, title="Запрос / путь логов")
    log_window: Optional[str] = Field(None, title="Окно выборки")
    host: Optional[str] = Field(None, title="Хост")
    port: Optional[str] = Field(None, title="Порт")
    username: Optional[str] = Field(None, title="Пользователь")
    key_ref: Optional[str] = Field(None, title="Ссылка на ключ / секрет")
    allowlist: Optional[str] = Field(None, title="Allowlist команд")
    mq_engine: Optional[Literal["Kafka", "RabbitMQ"]] = Field("Kafka", title="Брокер очереди")
    broker_url: Optional[str] = Field(None, title="Broker URL")
    topic: Optional[str] = Field(None, title="Topic / queue")
    prom_url: Optional[str] = Field(None, title="Prometheus URL")
    prom_lookback: Optional[str] = Field("15m", title="Prometheus lookback")
    constructor: Optional[str] = Field(None, title="Инициализация (legacy)")


class DataStorageFields(BaseModel):
    model_config = StrictModel

    source_type: Optional[
        Literal["Данные из массива", "Генерация из источника", "Конвертация данных"]
    ] = Field(None, title="Источник данных")
    process_id: Optional[str] = Field(None, title="Идентификатор процесса")
    editor: Optional[str] = Field(None, title="Редактор")
    output_format: Optional[str] = Field(None, title="Формат вывода")


class AuthFields(BaseModel):
    model_config = StrictModel

    constructor: Optional[str] = Field(None, title="Полотно auth (dialect)")


class OpenApiFields(BaseModel):
    model_config = StrictModel

    spec_mode: Optional[Literal["resource", "url_relative"]] = Field(
        "url_relative", title="Режим схемы"
    )
    spec_as: Optional[str] = Field(
        "", title="Ресурс схемы (imports.as, openapi_spec)"
    )
    spec_path_rel: Optional[str] = Field(
        "/openapi.json", title="Относительный путь схемы"
    )
    auth_module_id: Optional[str] = Field("", title="Модуль Авторизация (id)")
    zap_import: bool = Field(False, title="Импорт в ZAP (opt-in)")
    last_inventory: List[Dict[str, Any]] = Field(
        default_factory=list, title="Кэш операций (authoring)"
    )


class GraphqlFields(BaseModel):
    model_config = StrictModel

    schema_mode: Optional[Literal["resource", "introspection_relative"]] = Field(
        "introspection_relative", title="Режим схемы"
    )
    sdl_as: Optional[str] = Field(
        "", title="Ресурс SDL (imports.as, graphql_sdl)"
    )
    schema_path_rel: Optional[str] = Field(
        "/graphql", title="Относительный путь introspection"
    )
    endpoint_rel: Optional[str] = Field(
        "/graphql", title="Относительный путь GraphQL endpoint"
    )
    auth_module_id: Optional[str] = Field("", title="Модуль Авторизация (id)")
    zap_import: bool = Field(False, title="Импорт в ZAP (opt-in)")
    zap_scan: bool = Field(False, title="Скан GraphQL в ZAP (opt-in)")
    last_inventory: List[Dict[str, Any]] = Field(
        default_factory=list, title="Кэш операций (authoring)"
    )


class GrpcFields(BaseModel):
    model_config = StrictModel

    proto_as: Optional[str] = Field(
        "", title="Ресурс пакета proto (imports.as)"
    )
    auth_module_id: Optional[str] = Field(
        "", title="Модуль Авторизация (id)"
    )
    last_inventory: List[Dict[str, Any]] = Field(
        default_factory=list, title="Кэш services/methods (authoring)"
    )


class ChainFields(BaseModel):
    model_config = StrictModel

    har_as: Optional[str] = Field("", title="imports.as для .har")
    sequence_name: Optional[str] = Field("", title="Имя ZAP sequence")
    source_har: Optional[str] = Field("", title="Исходный HAR (authoring)")
    template_har: Optional[str] = Field("", title="HAR с {{slot}}")
    steps: List[Dict[str, Any]] = Field(default_factory=list, title="Шаги (кэш)")
    slots: List[Dict[str, Any]] = Field(default_factory=list, title="Токен-слоты")
    bindings: Dict[str, str] = Field(default_factory=dict, title="Play values (lab)")
    include_sequence_scan: bool = Field(
        True, title="Seed СканПоследовательности"
    )
    seed_fuzz_targets: bool = Field(False, title="Seed fuzz targets из шагов")
    last_notes: List[str] = Field(default_factory=list, title="Заметки lab")


class TestDataConstructorModule(BaseModel):
    model_config = StrictModel

    id: Optional[str] = Field(None, title="Идентификатор модуля")
    title: Optional[str] = Field(None, title="Человекочитаемое название")
    description: Optional[str] = Field(None, title="Описание")
    module_type: Optional[
        Literal[
            "Фаззер",
            "Генератор",
            "Коннектор",
            "Модуль работы с данными",
            "Авторизация",
            "OpenAPI",
            "GraphQL",
            "gRPC",
            "Цепь",
        ]
    ] = Field(None, title="Назначение модуля")
    label: Optional[str] = Field(None, title="Название модуля")
    fuzzing_fields: Optional[FuzzingFields] = None
    request_mixer_fields: Optional[RequestMixerFields] = None
    connector_fields: Optional[ConnectorFields] = None
    data_storage_fields: Optional[DataStorageFields] = None
    auth_fields: Optional[AuthFields] = None
    openapi_fields: Optional[OpenApiFields] = None
    graphql_fields: Optional[GraphqlFields] = None
    grpc_fields: Optional[GrpcFields] = None
    chain_fields: Optional[ChainFields] = None

    @model_validator(mode="before")
    @classmethod
    def _legacy_module_shape(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        out = dict(data)
        raw_type = out.get("module_type")
        if raw_type == "Фаззинг-Модуль":
            out["module_type"] = "Фаззер"
        if raw_type == "Кодовый редактор":
            out.pop("module_type", None)
            out.pop("code_module_fields", None)
        storage = out.get("data_storage_fields")
        if isinstance(storage, list):
            out["data_storage_fields"] = storage[0] if storage else None
        out.pop("code_module_fields", None)
        # Конструктор коннектора жил на модуле — переносим внутрь connector_fields.
        top_ctor = out.pop("constructor", None)
        if top_ctor:
            cf = out.get("connector_fields")
            if not isinstance(cf, dict):
                cf = {}
            else:
                cf = dict(cf)
            cf.pop("address", None)
            cf.pop("protocol", None)
            cf.pop("timeout", None)
            if not cf.get("constructor"):
                cf["constructor"] = top_ctor
            out["connector_fields"] = cf
        elif isinstance(out.get("connector_fields"), dict):
            cf = dict(out["connector_fields"])
            cf.pop("address", None)
            cf.pop("protocol", None)
            cf.pop("timeout", None)
            out["connector_fields"] = cf
        return out


class SuiteImport(BaseModel):
    """Внешний файл → DataStream / merge сценариев (F-02)."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    path: str = Field(..., title="Путь к файлу")
    kind: Literal[
        "data_file",
        "fuzz_corpus",
        "har_file",
        "proto_pack",
        "openapi_spec",
        "graphql_sdl",
        "scenario_json",
    ] = Field("data_file", title="Тип импорта")
    as_name: Optional[str] = Field(
        None,
        alias="as",
        title="Имя в stream / ссылка модуля на ресурс",
    )
    title: Optional[str] = Field(None, title="Человекочитаемое название")
    description: Optional[str] = Field(None, title="Описание")
    import_paths: List[str] = Field(
        default_factory=list,
        title="Корни импорта proto (пусто = корень пакета)",
    )


class EditorFolder(BaseModel):
    """Authoring-only папка Studio: не меняет плоское исполнение suites."""

    model_config = StrictModel

    id: str = Field(..., min_length=1, title="Внутренний id папки")
    title: str = Field(..., min_length=1, title="Название папки")
    members: List[str] = Field(default_factory=list, title="Элементы папки")


class EditorFolders(BaseModel):
    """Один уровень логической группировки для трёх редактируемых секций."""

    model_config = StrictModel

    pages: List[EditorFolder] = Field(default_factory=list)
    scenarios: List[EditorFolder] = Field(default_factory=list)
    modules: List[EditorFolder] = Field(default_factory=list)


def _legacy_fuzzer_from_module(
    module: Any, existing_ids: set
) -> Optional[Dict[str, Any]]:
    if not isinstance(module, dict) or module.get("module_type") != "Фаззер":
        return None
    mid = (module.get("id") or "").strip()
    if not mid or mid in existing_ids:
        return None
    fields = module.get("fuzzing_fields") or {}
    if not isinstance(fields, dict):
        return None
    request = fields.get("request") or {}
    injection = fields.get("injection") or {}
    limits = fields.get("limits") or {}
    observation = fields.get("observation") or {}
    if not isinstance(request, dict) or not isinstance(injection, dict):
        return None
    url = request.get("url") or ""
    q = injection.get("query_param") or ""
    corpus = injection.get("corpus") or ""
    if not url or not q or not corpus:
        return None
    method = request.get("method") or "GET"
    return {
        "id": mid,
        "label": module.get("label") or mid,
        "algorithm": "triples",
        "targets": [{"url": url, "method": method, "corpus": corpus}],
        "message": {
            "source": "template",
            "method": method,
            "url": url,
            "headers": request.get("headers") or {},
            "follow_redirects": bool(request.get("follow_redirects", True)),
            "session_replay": True,
        },
        "location": {"kind": "query_param", "name": q},
        "corpus": corpus,
        "policy": _legacy_fuzzer_policy(limits, observation),
    }


def _legacy_fuzzer_policy(limits: Any, observation: Any) -> Dict[str, Any]:
    lim = limits if isinstance(limits, dict) else {}
    obs = observation if isinstance(observation, dict) else {}
    return {
        "max_requests": lim.get("max_requests", 25),
        "requests_per_second": lim.get("requests_per_second", 1.0),
        "alert_on_server_error": obs.get("alert_on_server_error", True),
        "latency_multiplier": obs.get("latency_multiplier", 3.0),
    }


class TestSuites(BaseModel):
    model_config = StrictModel

    imports: List[SuiteImport] = Field(
        default_factory=list, title="Импорт внешних сценариев"
    )
    pages: Dict[str, Page] = Field(default_factory=dict, title="Моделирование страниц")
    scenarios: List[Scenario] = Field(default_factory=list, title="Сценарии проверок")
    test_data_constructor: List[TestDataConstructorModule] = Field(
        default_factory=list, title="Технические настройки и метрики для проверок"
    )
    fuzzers: List[SuiteFuzzer] = Field(
        default_factory=list, title="Fuzzers (Editor entity → Campaign)"
    )
    editor_folders: EditorFolders = Field(
        default_factory=EditorFolders,
        title="Папки Редактора",
    )

    @field_validator("imports", mode="before")
    @classmethod
    def _coerce_imports(cls, value: Any) -> Any:
        """Строка пути → data_file (legacy schema items: string)."""
        if not isinstance(value, list):
            return value
        out: List[Any] = []
        for item in value:
            if isinstance(item, str):
                out.append({"path": item, "kind": "data_file"})
            else:
                out.append(item)
        return out

    @model_validator(mode="before")
    @classmethod
    def _migrate_legacy_fuzzer_modules(cls, data: Any) -> Any:
        """module_type=Фаззер → fuzzers[] (soft), модуль оставляем для legacy JSON."""
        if not isinstance(data, dict):
            return data
        out = dict(data)
        fuzzers = list(out.get("fuzzers") or [])
        existing_ids = {
            str(item.get("id"))
            for item in fuzzers
            if isinstance(item, dict) and item.get("id")
        }
        for module in out.get("test_data_constructor") or []:
            migrated = _legacy_fuzzer_from_module(module, existing_ids)
            if migrated is None:
                continue
            fuzzers.append(migrated)
            existing_ids.add(str(migrated["id"]))
        out["fuzzers"] = fuzzers
        return out


class ScanningAndFuzzingTargets(BaseModel):
    scan_targets: str = Field("", title="Цели сканирования")
    fuzzing_rules: str = Field("", title="Правила фаззинга")


class OpenapiSwaggerScanning(BaseModel):
    scan_schema: str = Field("", title="Схема для сканирования")


class ApiTargetsScanning(BaseModel):
    api_scan_targets: Optional[str] = Field("", title="Цели сканирования")
    custom_headers: Optional[str] = Field("", title="Пользовательские заголовки")
    excluded_routes: Optional[str] = Field("", title="Исключения при сканировании")


class GuiElementsScanning(BaseModel):
    scan_targets: str = Field("", title="Цели сканирования")


class Wired(BaseModel):
    """RK-SPLIT: принимает как legacy formData, так и плоский {regulation, editor} JSON."""

    meta: Meta
    infrastructure: Infrastructure
    security_configuration: Optional[SecurityConfiguration] = None
    test_suites: Optional[TestSuites] = None
    scanning_and_fuzzing_targets: Optional[ScanningAndFuzzingTargets] = Field(
        None, title="Сканирование и фаззинг целей"
    )
    openapi_swagger_scanning: Optional[OpenapiSwaggerScanning] = Field(
        None, title="Openapi / Swagger сканирование"
    )
    api_targets_scanning: Optional[ApiTargetsScanning] = Field(
        None, title="Сканирование целей API"
    )
    gui_elements_scanning: Optional[GuiElementsScanning] = Field(
        None, title="Сканирование элементов графического интерфейса"
    )

    @model_validator(mode="before")
    @classmethod
    def _adapt_flat_regulation_editor(cls, data: Any) -> Any:
        """RK-SPLIT: конвертирует плоский {regulation, editor} JSON в legacy-структуру.

        Target format:
          { regulation: { meta: {...}, infrastructure: {...}, security_configuration?: {...} },
            editor: { scenarios: [...], modules: {...}, ... } }

        → legacy:
          { meta: {...}, infrastructure: {...}, security_configuration: {...},
            test_suites: { scenarios: [...], ... },
            scanning_and_fuzzing_targets: ..., ... }
        """
        if not isinstance(data, dict):
            return data
        regulation = data.get("regulation")
        editor = data.get("editor")
        if not isinstance(regulation, dict) or not isinstance(editor, dict):
            return data  # already legacy, pass through

        result: Dict[str, Any] = {}

        # regulation → meta, infrastructure, security_configuration
        result["meta"] = regulation.get("meta", {})
        result["infrastructure"] = regulation.get("infrastructure", {})
        if "security_configuration" in regulation:
            result["security_configuration"] = regulation["security_configuration"]

        # editor → test_suites, modules
        result["test_suites"] = {}

        # scenarios
        scenarios = editor.get("scenarios")
        if isinstance(scenarios, list):
            result["test_suites"]["scenarios"] = scenarios

        # pages → test_suites.pages (flat uses [], legacy uses {})
        pages = editor.get("pages")
        if isinstance(pages, list) and len(pages) > 0:
            result["test_suites"]["pages"] = pages
        elif isinstance(pages, dict) and len(pages) > 0:
            result["test_suites"]["pages"] = pages

        # imports
        imports = editor.get("imports")
        if isinstance(imports, list):
            result["test_suites"]["imports"] = imports

        # modules
        modules = editor.get("modules")
        if isinstance(modules, dict):
            for mod_key, mod_list in modules.items():
                if isinstance(mod_list, list) and len(mod_list) > 0:
                    result["test_suites"][mod_key] = mod_list

        # fuzzer_targets
        fuzzer_targets = editor.get("fuzzer_targets")
        if isinstance(fuzzer_targets, list):
            result["scanning_and_fuzzing_targets"] = fuzzer_targets

        # editor_folders (optional, inside test_suites)
        editor_folders = editor.get("editor_folders")
        if isinstance(editor_folders, list):
            result["test_suites"]["editor_folders"] = editor_folders

        return result

    @model_validator(mode="before")
    @classmethod
    def _hoist_scan_urls_from_security(cls, data: Any) -> Any:
        """Legacy: URL в security_configuration → infrastructure."""
        if not isinstance(data, dict):
            return data
        sec = data.get("security_configuration")
        if not isinstance(sec, dict):
            return data
        infra = data.get("infrastructure")
        if not isinstance(infra, dict):
            infra = {}
            data["infrastructure"] = infra
        for key in ("base_url_override", "allowed_extra_domains"):
            cur = infra.get(key)
            empty = cur is None or cur == ""
            if empty and isinstance(sec.get(key), str):
                infra[key] = sec[key]
        return data

    @field_validator("security_configuration")
    @classmethod
    def _security_required_unless_manual(cls, v, info):
        meta = (info.data or {}).get("meta")
        purpose = getattr(meta, "assessment_purpose", None)
        if purpose != "manual" and v is None:
            raise ValueError("security_configuration is required unless assessment_purpose=manual")
        return v

    @model_validator(mode="after")
    def _manual_forces_webswing(self) -> "Manifest":
        """Форма при manual прячет zap_mode; runtime = Webswing + idle/work hold."""
        if self.meta.assessment_purpose == "manual":
            self.infrastructure.zap_mode = "webswing"
        return self

    def scan_base_url(self) -> str:
        infra = self.infrastructure
        base = (getattr(infra, "base_url_override", None) or "").strip()
        if base:
            return base
        sec = self.security_configuration
        if sec is None:
            return ""
        return (getattr(sec, "base_url_override", None) or "").strip()

    def scan_allowed_extra_domains(self) -> str:
        infra = self.infrastructure
        extra = (getattr(infra, "allowed_extra_domains", None) or "").strip()
        if extra:
            return extra
        sec = self.security_configuration
        if sec is None:
            return ""
        return (getattr(sec, "allowed_extra_domains", None) or "").strip()
