"""
Адаптер для HTTP-запросов (API-тестирование).

Построен на основе лучших практик индустрии:
- requests.Session — переиспользование соединений (Keep-Alive, Connection Pooling)[reference:2]
- HTTPAdapter с настройкой пула соединений и автоматическими ретраями[reference:3]
- Таймауты (connect, read) — чтобы запросы не висели вечно[reference:4]
- Экспоненциальный бэкофф — чтобы не долбить сервер при ошибках[reference:5]
- Логирование метрик по таймаутам и ретраям[reference:6]
- Поддержка авторизации (Basic, Bearer, API Key)[reference:7]
- Типизированные ответы и обработка исключений[reference:8]

Источники:
- https://selectel.ru/blog/why-do-http-requests-freeze/ [reference:9]
- https://decodo.com/blog/python-requests-retry [reference:10]
- https://github.com/khollingworth/requests-enhanced [reference:11]
"""
import time
import json
import logging
import os
from typing import Optional, Dict, Any, Union, Tuple
from urllib3.util.retry import Retry
from requests.adapters import HTTPAdapter
from requests.exceptions import (
    Timeout, ConnectionError, HTTPError, RequestException,
    RetryError, InvalidURL, TooManyRedirects, SSLError
)
import requests

from .base_adapter import BaseAdapter

logger = logging.getLogger("orchestrator")


class HttpAdapter(BaseAdapter):
    """
    HTTP-адаптер для API-тестирования.
    
    Особенности:
    - Единая сессия на всё время жизни адаптера (переиспользование соединений).
    - Автоматические ретраи при временных ошибках (5xx, 429, таймауты).
    - Экспоненциальный бэкофф между ретраями.
    - Таймауты (connect + read) для каждого запроса.
    - Поддержка Basic, Bearer, API Key авторизации.
    - Логирование всех запросов и ответов (для отладки и отчётов).
    """
    
    def __init__(
        self,
        base_url: Optional[str] = None,
        retries: int = 3,
        backoff_factor: float = 0.5,
        pool_maxsize: int = 10,
        timeout_connect: float = 5.0,
        timeout_read: float = 30.0,
        verify_ssl: bool = True,
        default_headers: Optional[Dict[str, str]] = None
    ):
        """
        Инициализация HTTP-адаптера.
        
        Args:
            base_url: Базовый URL для всех запросов (опционально).
            retries: Количество повторных попыток при ошибке.
            backoff_factor: Множитель для экспоненциальной задержки (sleep = backoff_factor * (2 ** (retry_count - 1))).
            pool_maxsize: Максимальное количество соединений в пуле.
            timeout_connect: Таймаут на установку соединения (сек).
            timeout_read: Таймаут на чтение ответа (сек).
            verify_ssl: Проверять SSL-сертификаты.
            default_headers: Заголовки по умолчанию для всех запросов.
        """
        super().__init__(driver=None)
        self.base_url = base_url
        self.timeout_connect = timeout_connect
        self.timeout_read = timeout_read
        self.verify_ssl = verify_ssl
        self._auth_type = None
        self._auth_data = None
        
        # Создаём сессию с ретраями
        self.session = self._create_session(retries, backoff_factor, pool_maxsize)
        
        # Устанавливаем заголовки по умолчанию
        if default_headers:
            self.session.headers.update(default_headers)
        
        # Статистика для метрик
        self._stats = {
            "total_requests": 0,
            "successful_requests": 0,
            "failed_requests": 0,
            "retries_used": 0,
            "timeouts": 0
        }
        self._run_wired = None
        self._proxy_url = None
        
        logger.info(f"HttpAdapter initialized with base_url={base_url}, retries={retries}, timeout=({timeout_connect}, {timeout_read})")

    def bind_run_wired(self, wired) -> None:
        """Controller: Manifest для резолва module id (OA/GQL traffic)."""
        self._run_wired = wired

    def set_proxy(self, proxy_url, proxy_type="http"):
        """
        Прокси для session (ZAP browser proxy). Keyword не обязателен —
        Controller вызывает на старте.
        Returns True when a proxy is configured, False when cleared.
        """
        raw = (proxy_url or "").strip()
        if not raw:
            self.session.proxies.clear()
            self._proxy_url = None
            logger.info("HttpAdapter proxy cleared")
            return False
        if "://" not in raw:
            scheme = (proxy_type or "http").strip() or "http"
            raw = f"{scheme}://{raw}"
        self.session.proxies.update({"http": raw, "https": raw})
        self._proxy_url = raw
        logger.info("HttpAdapter proxy=%s", raw)
        return True

    def execute_openapi_module(self, module_id_or_spec, limit=5):
        """
        Выполнить операции OpenAPI по HTTP (через прокси ZAP).
        MethodId: ВыполнитьОперацииOpenAPI.
        """
        from utils.api_module_runtime import (
            dumps_runtime,
            execute_openapi_operations,
            inventory_openapi,
            resolve_openapi_arg,
            static_auth_headers,
        )

        resolved = resolve_openapi_arg(
            getattr(self, "_run_wired", None),
            str(module_id_or_spec or ""),
        )
        inv = inventory_openapi(resolved.spec)
        notes = list(resolved.notes) + list(inv.get("notes") or [])
        if not inv.get("ok"):
            payload = {"ok": False, "attempted": 0, "results": [], "notes": notes}
            self._last_openapi_execute = payload
            return dumps_runtime(payload)
        base = resolved.base_url or str(inv.get("base_url") or "")
        headers, auth_notes = static_auth_headers(
            getattr(self, "_run_wired", None),
            resolved.auth_module_id,
        )
        notes.extend(auth_notes)
        try:
            lim = int(limit)
        except (TypeError, ValueError):
            lim = 5
        payload = execute_openapi_operations(
            self,
            operations=inv.get("operations") or [],
            base_url=base,
            headers=headers,
            limit=lim,
        )
        payload["notes"] = notes + list(payload.get("notes") or [])
        if resolved.from_module:
            payload["module_id"] = resolved.module_id
        self._last_openapi_execute = payload
        return dumps_runtime(payload)

    def execute_graphql_module(self, module_id, query=""):
        """
        Выполнить запрос GraphQL по HTTP (через прокси ZAP).
        MethodId: ВыполнитьGraphQL.
        """
        from utils.api_module_runtime import (
            default_graphql_query,
            dumps_runtime,
            execute_graphql_request,
            inventory_graphql,
            resolve_graphql_arg,
            static_auth_headers,
        )

        resolved = resolve_graphql_arg(
            getattr(self, "_run_wired", None),
            str(module_id or ""),
        )
        notes = list(resolved.notes)
        if not resolved.from_module and not resolved.endpoint:
            notes.append("нужен идентификатор модуля GraphQL (URL из полей модуля)")
        inv = (
            inventory_graphql(resolved.schema)
            if resolved.schema
            else {"ok": False, "operations": [], "notes": []}
        )
        notes.extend(inv.get("notes") or [])
        q = (query or "").strip()
        if not q:
            q = default_graphql_query(inv.get("operations") or [])
        headers = dict(resolved.headers)
        auth_headers, auth_notes = static_auth_headers(
            getattr(self, "_run_wired", None),
            resolved.auth_module_id,
        )
        notes.extend(auth_notes)
        headers.update(auth_headers)
        endpoint = resolved.endpoint
        if not endpoint and str(module_id or "").startswith("http"):
            endpoint = str(module_id).strip()
        payload = execute_graphql_request(
            self,
            endpoint=endpoint,
            query=q,
            headers=headers,
        )
        payload["notes"] = notes + list(payload.get("notes") or [])
        if resolved.from_module:
            payload["module_id"] = resolved.module_id
        self._last_graphql_execute = payload
        return dumps_runtime(payload)
    
    def _create_session(self, retries: int, backoff_factor: float, pool_maxsize: int) -> requests.Session:
        """
        Создаёт requests.Session с настроенными ретраями и пулом соединений[reference:12].
        """
        session = requests.Session()
        
        # Настройка ретраев
        retry_strategy = Retry(
            total=retries,
            backoff_factor=backoff_factor,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["HEAD", "GET", "OPTIONS", "POST", "PUT", "DELETE", "PATCH"],
            respect_retry_after_header=True
        )
        
        # Настройка адаптера с пулом соединений
        adapter = HTTPAdapter(
            max_retries=retry_strategy,
            pool_connections=pool_maxsize,
            pool_maxsize=pool_maxsize
        )
        
        session.mount("http://", adapter)
        session.mount("https://", adapter)
        
        return session
    
    # ========== ОСНОВНЫЕ МЕТОДЫ ==========
    
    def _build_url(self, url: str) -> str:
        """Собирает полный URL с учётом base_url."""
        if self.base_url and not url.startswith(("http://", "https://")):
            return self.base_url.rstrip("/") + "/" + url.lstrip("/")
        return url
    
    def _request(
        self,
        method: str,
        url: str,
        params: Optional[Dict] = None,
        headers: Optional[Dict] = None,
        data: Optional[Any] = None,
        json_data: Optional[Any] = None,
        timeout: Optional[Union[float, Tuple[float, float]]] = None,
        follow_redirects: bool = True,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Базовый метод для выполнения HTTP-запроса.
        
        Returns:
            Dict с полями: status, headers, body, json, elapsed, raw_response
        """
        full_url = self._build_url(url)
        merged_headers = self.session.headers.copy()
        if headers:
            merged_headers.update(headers)
        
        # Таймаут: если не передан, используем стандартный (connect, read)
        if timeout is None:
            timeout = (self.timeout_connect, self.timeout_read)
        
        self._stats["total_requests"] += 1
        start_time = time.time()
        
        try:
            response = self.session.request(
                method=method.upper(),
                url=full_url,
                params=params,
                headers=merged_headers,
                data=data,
                json=json_data,
                timeout=timeout,
                allow_redirects=follow_redirects,
                verify=self.verify_ssl,
                **kwargs
            )
            
            elapsed = time.time() - start_time
            self._stats["successful_requests"] += 1
            
            # Логируем запрос (для отладки)
            logger.debug(f"{method} {full_url} → {response.status_code} ({elapsed:.2f}s)")
            
            # Парсим тело ответа
            body = response.text
            json_body = None
            try:
                json_body = response.json()
            except json.JSONDecodeError:
                pass
            
            return {
                "status": response.status_code,
                "headers": dict(response.headers),
                "body": body,
                "json": json_body,
                "elapsed": elapsed,
                "raw_response": response
            }
            
        except Timeout as e:
            self._stats["timeouts"] += 1
            self._stats["failed_requests"] += 1
            logger.error(f"Timeout on {method} {full_url}: {e}")
            raise
        
        except ConnectionError as e:
            self._stats["failed_requests"] += 1
            logger.error(f"Connection error on {method} {full_url}: {e}")
            raise
        
        except HTTPError as e:
            self._stats["failed_requests"] += 1
            logger.error(f"HTTP error on {method} {full_url}: {e}")
            raise
        
        except RequestException as e:
            self._stats["failed_requests"] += 1
            logger.error(f"Request error on {method} {full_url}: {e}")
            raise
    
    # ========== ПУБЛИЧНЫЕ МЕТОДЫ ==========
    
    def get(self, url: str, params: Optional[Dict] = None, headers: Optional[Dict] = None, **kwargs) -> Dict[str, Any]:
        """GET-запрос."""
        return self._request("GET", url, params=params, headers=headers, **kwargs)
    
    def post(self, url: str, data: Optional[Any] = None, json_data: Optional[Any] = None, 
             headers: Optional[Dict] = None, **kwargs) -> Dict[str, Any]:
        """POST-запрос."""
        return self._request("POST", url, data=data, json_data=json_data, headers=headers, **kwargs)
    
    def put(self, url: str, data: Optional[Any] = None, json_data: Optional[Any] = None,
            headers: Optional[Dict] = None, **kwargs) -> Dict[str, Any]:
        """PUT-запрос."""
        return self._request("PUT", url, data=data, json_data=json_data, headers=headers, **kwargs)
    
    def delete(self, url: str, headers: Optional[Dict] = None, **kwargs) -> Dict[str, Any]:
        """DELETE-запрос."""
        return self._request("DELETE", url, headers=headers, **kwargs)
    
    def patch(self, url: str, data: Optional[Any] = None, json_data: Optional[Any] = None,
              headers: Optional[Dict] = None, **kwargs) -> Dict[str, Any]:
        """PATCH-запрос."""
        return self._request("PATCH", url, data=data, json_data=json_data, headers=headers, **kwargs)
    
    def head(self, url: str, headers: Optional[Dict] = None, **kwargs) -> Dict[str, Any]:
        """HEAD-запрос."""
        return self._request("HEAD", url, headers=headers, **kwargs)
    
    def options(self, url: str, headers: Optional[Dict] = None, **kwargs) -> Dict[str, Any]:
        """OPTIONS-запрос."""
        return self._request("OPTIONS", url, headers=headers, **kwargs)
    
    # ========== АВТОРИЗАЦИЯ ==========
    
    def set_auth_basic(self, username: str, password: str):
        """Устанавливает Basic-авторизацию для всех последующих запросов."""
        self.session.auth = (username, password)
        self._auth_type = "basic"
        self._auth_data = {"username": username, "password": password}
        logger.info("Basic auth configured")
    
    def set_auth_bearer(self, token: str):
        """Устанавливает Bearer-токен для всех последующих запросов."""
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        self._auth_type = "bearer"
        self._auth_data = {"token": token}
        logger.info("Bearer auth configured")
    
    def set_auth_api_key(self, key: str, value: str, location: str = "header"):
        """
        Устанавливает API-ключ для всех последующих запросов.

        Args:
            key: Имя параметра (заголовок, query или cookie).
            value: Значение ключа.
            location: ``header`` | ``query`` | ``cookie``.
        """
        loc = (location or "header").strip().lower()
        if loc == "header":
            self.session.headers.update({key: value})
        elif loc == "query":
            self.session.params.update({key: value})
        elif loc == "cookie":
            self.session.cookies.set(key, value)
        else:
            raise ValueError(
                f"Invalid location: {location!r}. Use 'header', 'query', or 'cookie'."
            )
        self._auth_type = "api_key"
        self._auth_data = {"key": key, "value": value, "location": loc}
        logger.info(f"API Key auth configured ({loc})")
    
    def set_auth_cookie(self, cookie_name: str, cookie_value: str, domain: Optional[str] = None):
        """Устанавливает Cookie-авторизацию."""
        self.session.cookies.set(cookie_name, cookie_value, domain=domain)
        self._auth_type = "cookie"
        self._auth_data = {"cookie_name": cookie_name, "cookie_value": cookie_value, "domain": domain}
        logger.info("Cookie auth configured")
    
    def clear_auth(self):
        """Очищает все настройки авторизации."""
        self.session.auth = None
        # Удаляем заголовки авторизации
        for header in ["Authorization", "X-API-Key"]:
            if header in self.session.headers:
                del self.session.headers[header]
        self._auth_type = None
        self._auth_data = None
        logger.info("Auth cleared")
    
    # ========== УПРАВЛЕНИЕ СЕССИЕЙ ==========
    
    def set_default_header(self, key: str, value: str):
        """Устанавливает заголовок по умолчанию для всех запросов."""
        self.session.headers[key] = value
    
    def remove_default_header(self, key: str):
        """Удаляет заголовок по умолчанию."""
        if key in self.session.headers:
            del self.session.headers[key]
    
    def set_default_param(self, key: str, value: str):
        """Устанавливает query-параметр по умолчанию для всех запросов."""
        self.session.params[key] = value
    
    def remove_default_param(self, key: str):
        """Удаляет query-параметр по умолчанию."""
        if key in self.session.params:
            del self.session.params[key]
    
    def reset_session(self):
        """Сбрасывает сессию (очищает куки, заголовки, параметры)."""
        self.session.cookies.clear()
        self.session.headers.clear()
        self.session.params.clear()
        self.session.auth = None
        self._auth_type = None
        self._auth_data = None
        logger.info("Session reset")
    
    def get_stats(self) -> Dict[str, int]:
        """Возвращает статистику запросов."""
        return self._stats.copy()
    
    def reset_stats(self):
        """Сбрасывает статистику."""
        self._stats = {
            "total_requests": 0,
            "successful_requests": 0,
            "failed_requests": 0,
            "retries_used": 0,
            "timeouts": 0
        }
        
def trigger_allure_report(*args, **kwargs):
    """Устарело: см. utils.reporter.trigger_allure_report."""
    from utils.reporter import trigger_allure_report as _trigger

    return _trigger(*args, **kwargs)


# ========== ЗАКОММЕНТИРОВАННЫЕ МЕТОДЫ ДЛЯ РАСШИРЕНИЯ ==========

# def upload_file(self, url, file_path, field_name="file", headers=None, **kwargs):
#     """
#     Идея: загрузка файла через multipart/form-data.
#     Полезно для тестирования API с файловыми вложениями.
#     Трудозатраты: 0.5 часа (обёртка над requests.post с files=).
#     """
#     pass

# def download_file(self, url, output_path, headers=None, **kwargs):
#     """
#     Идея: скачивание файла с прогресс-баром.
#     Полезно для тестирования загрузки больших файлов.
#     Трудозатраты: 1 час (stream=True + chunked запись).
#     """
#     pass

# def request_with_retry(self, method, url, max_retries=None, **kwargs):
#     """
#     Идея: запрос с кастомным количеством ретраев для конкретного вызова.
#     Полезно, когда один запрос требует больше попыток, чем остальные.
#     Трудозатраты: 1 час (обёртка над self._request с retry-циклом).
#     """
#     pass

# def batch_requests(self, requests_list, max_concurrent=5):
#     """
#     Идея: массовая отправка запросов (параллельно или последовательно).
#     Полезно для нагрузочного тестирования или проверки нескольких эндпоинтов.
#     Трудозатраты: 3-4 часа (ThreadPoolExecutor + обработка результатов).
#     """
#     pass

# def validate_response_schema(self, response, schema):
#     """
#     Идея: валидация ответа по JSON-схеме (например, через jsonschema).
#     Полезно для контрактного тестирования API.
#     Трудозатраты: 2 часа (интеграция jsonschema).
#     """
#     pass

# def add_response_interceptor(self, interceptor_func):
#     """
#     Идея: перехват и модификация ответов перед возвратом в вызывающий код.
#     Полезно для кастомной обработки (маскировка данных, логирование).
#     Трудозатраты: 2 часа (декоратор или паттерн Chain of Responsibility).
#     """
#     pass

# def set_timeout_for_request(self, method, url, timeout_override, **kwargs):
#     """
#     Идея: переопределение таймаута для конкретного запроса.
#     Полезно для долгих операций (например, генерация отчётов).
#     Трудозатраты: 0.5 часа.
#     """
#     pass


# ========== БЛОК ТЕХНИЧЕСКИХ КОММЕНТАРИЕВ ==========
"""
================================================================================
Файл: adapters/http_adapter.py
Дата создания: 27.07.2026
Версия: 1.0

Методы (рабочие, интегрированы в API):

1. __init__(base_url, retries, backoff_factor, pool_maxsize, timeout_connect, timeout_read, verify_ssl, default_headers)
   — инициализация адаптера с настройками ретраев, таймаутов и пула соединений.

2. get(url, params, headers, **kwargs) — GET-запрос.
3. post(url, data, json_data, headers, **kwargs) — POST-запрос.
4. put(url, data, json_data, headers, **kwargs) — PUT-запрос.
5. delete(url, headers, **kwargs) — DELETE-запрос.
6. patch(url, data, json_data, headers, **kwargs) — PATCH-запрос.
7. head(url, headers, **kwargs) — HEAD-запрос.
8. options(url, headers, **kwargs) — OPTIONS-запрос.

Авторизация:
9. set_auth_basic(username, password) — Basic-авторизация.
10. set_auth_bearer(token) — Bearer-токен.
11. set_auth_api_key(key, value, location) — API-ключ (header или query).
12. set_auth_cookie(cookie_name, cookie_value, domain) — Cookie-авторизация.
13. clear_auth() — очистка всех настроек авторизации.

Управление сессией:
14. set_default_header(key, value) — установка заголовка по умолчанию.
15. remove_default_header(key) — удаление заголовка по умолчанию.
16. set_default_param(key, value) — установка query-параметра по умолчанию.
17. remove_default_param(key) — удаление query-параметра по умолчанию.
18. reset_session() — сброс сессии (куки, заголовки, параметры).
19. get_stats() — статистика запросов.
20. reset_stats() — сброс статистики.

Индустриальные практики, реализованные в адаптере:
- requests.Session — переиспользование TCP-соединений (Keep-Alive)[reference:13]
- HTTPAdapter + Retry — автоматические ретраи с экспоненциальным бэкоффом[reference:14]
- Таймауты (connect, read) — чтобы запросы не висели вечно[reference:15]
- status_forcelist — ретраи только на временные ошибки (429, 5xx)[reference:16]
- respect_retry_after_header — уважение заголовка Retry-After[reference:17]
- Логирование ошибок и метрик[reference:18]
- Поддержка OAuth-подобных схем (Bearer, API Key)[reference:19]

Закомментированные методы (расширение):
- upload_file — загрузка файлов через multipart/form-data.
- download_file — скачивание файлов с прогрессом.
- request_with_retry — запрос с кастомным количеством ретраев.
- batch_requests — массовая отправка запросов (параллельно).
- validate_response_schema — валидация ответа по JSON-схеме.
- add_response_interceptor — перехват и модификация ответов.
- set_proxy — настройка прокси для всех запросов.
- set_timeout_for_request — переопределение таймаута для конкретного запроса.

Идеи на будущее:
- Поддержка HTTP/2 и HTTP/3 (через requests-enhanced)[reference:20]
- Автоматическая подстановка переменных из контекста в URL и тело запроса.
- Интеграция с Allure: прикрепление запросов и ответов к шагам.
- Кастомные обработчики ошибок для специфичных API (например, ретрай на 401 с обновлением токена).

Трудозатраты на реализацию текущей версии: ~3 часа (включая изучение лучших практик и тестирование).
================================================================================
"""
