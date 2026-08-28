# Concept: PrettyK Web IDE Terminal и Security Workbench

> **Статус:** concept / evolve · 24 августа 2026 г.  
> **Профиль:** `secops-lab-pure` + `cosmo-custom`  
> **Не CANON:** концепт для обсуждения и последующей нарезки.

## 1. Тезис

PrettyK Web IDE может получить почти полноценный терминал, но это должен быть не «доступ к машине через браузер» и не копия VS Code.

Это **Security Workbench** — контролируемое рабочее пространство, где оператор:

- редактирует PrettyK DSL;
- собирает pipeline;
- запускает безопасные команды;
- наблюдает worker/run;
- смотрит request/response;
- анализирует findings;
- связывает строку DSL с evidence;
- воспроизводит отдельный шаг.

> **Terminal — не дырка в хост. Terminal — управляемая поверхность execution и evidence.**

---

## 2. Что сказал заказчик

> «Мы же в нашу Web IDE может нечто вроде терминала даже въебать. почти полноценного. Разве нет?»

## 3. Продуктовый интент

Оператор не должен переключаться между Web IDE, SSH, Docker logs, CI UI, scanner UI, Allure и файловым менеджером, чтобы понять, что происходит с проверкой.

Web IDE должна стать одним рабочим местом для:

```text
Intent → DSL → Pipeline → Run → Logs → Findings → Evidence → Replay
```

При этом пользователь всегда понимает:

- где выполняется команда;
- какие права у сессии;
- какой target затронут;
- что будет сохранено;
- почему действие разрешено или заблокировано.

---

## 4. Три режима терминала

### 4.1 Workspace Terminal

Эфемерное рабочее пространство для:

- просмотра файлов проекта;
- запуска PrettyK CLI;
- проверки DSL и pipeline plan;
- Git operations;
- локальных helper-команд;
- подготовки input data;
- анализа уже загруженных artifacts.

Workspace не имеет доступа к host filesystem и не получает production secrets.

### 4.2 Run Console

Терминал, привязанный к конкретному run/worker:

- live process/log view;
- состояние browser/scanner/fuzzer;
- временная файловая система run;
- диагностические команды;
- pause/resume/cancel где это разрешено policy;
- экспорт безопасного вывода в evidence.

После завершения run worker уничтожается, замораживается или переводится в retention-политику.

### 4.3 Structured Command Console

Для типовых действий raw shell не нужен:

```text
Inspect run
List evidence
Explain policy
Show finding
Replay step
Inspect worker
Validate pipeline
Preview scope
```

Команда представляется формой с typed inputs, разрешениями и preview. Это безопаснее, чем заставлять каждого оператора помнить shell-синтаксис.

---

## 5. Безопасность терминала

### Нельзя

- прямой доступ к host shell;
- прямой доступ к Docker socket;
- доступ к соседним tenant/workspace;
- скрытая выдача OpenBao credentials;
- production target без scope/approval;
- privileged commands без отдельного permission;
- сохранение raw secrets в scrollback, transcript или evidence;
- выполнение команды после истечения session TTL.

### Обязательно

- backend-controlled terminal session;
- RBAC и capability checks на каждую опасную операцию;
- session TTL и idle timeout;
- Stop/Kill;
- CPU, memory, process и disk quotas;
- egress/network policy;
- audit command start/finish/exit code;
- redaction Cookie/Bearer/password/PAT;
- reconnect после обновления страницы;
- честные состояния connected/reconnecting/expired/terminated;
- workspace cleanup и retention policy.

Терминал должен быть terminal-to-workspace, а не browser-to-host.

---

## 6. Функции терминала

### Базовый UX

- tabs и split panes;
- resize;
- copy/paste;
- поиск по выводу;
- безопасная command history;
- reconnect;
- clear scrollback;
- скачивание redacted transcript;
- linkify run/finding/artifact identifiers;
- command palette;
- быстрые preset-команды.

### Security UX

- banner с target/environment/scope;
- видимый risk level команды;
- preview требуемых permissions;
- подтверждение destructive operation;
- текущая worker/session identity;
- runtime image и version;
- resource usage;
- network destinations;
- «почему заблокировано»;
- «сохранить вывод как evidence».

### Run UX

- attach к run;
- live timeline;
- step output;
- request/response inspector с redaction;
- process tree без секретов;
- artifact upload status;
- retry/cancel state;
- переход из вывода в finding и обратно.

---

## 7. Monaco как Security Workbench

Monaco остаётся редакторным ядром. Вокруг него строится рабочая оболочка.

### 7.1 PrettyK Language Service

Через LSP-подход:

- autocomplete;
- hover;
- diagnostics;
- go to definition;
- find references;
- rename;
- outline;
- formatter;
- quick fixes;
- deprecated/unsafe warnings;
- version compatibility checks.

LSP даёт стандартный транспорт и editor integration. PrettyK отвечает за семантику собственного DSL.

### 7.2 Code ↔ Graph

DSL и visual pipeline — две проекции одного pipeline IR:

- клик по node открывает нужный блок DSL;
- клик по строке подсвечивает node;
- изменение графа создаёт понятный diff DSL;
- invalid graph не превращается в молчащий pipeline.

### 7.3 Pipeline Preview

До Run IDE показывает:

- steps и dependencies;
- parallel branches;
- target и scope;
- required permissions;
- tools и версии;
- secrets только как references;
- expected artifacts;
- возможные gates;
- приблизительную resource/cost profile.

Главный вопрос preview:

> «Что реально произойдёт после нажатия Run?»

### 7.4 Security Debugger

Debugger показывает не только переменные:

- текущий step;
- target и resolved scope;
- policy decision;
- auth context без раскрытия секрета;
- redacted request/response;
- locator decision;
- scanner/fuzzer state;
- retry reason;
- generated evidence;
- блокирующую причину.

DAP можно использовать там, где есть обычный runtime debugger. Для browser/network/security steps нужен отдельный Run Debug Contract.

### 7.5 Time Travel / Replay

Для любого шага:

- открыть input/output;
- увидеть redacted request/response;
- повторить только step;
- повторить с изменённым payload;
- сравнить два runs;
- перейти к возникшей finding;
- экспортировать минимальный repro pack.

### 7.6 Evidence-linked Editor

В редакторе появляются markers вида:

```text
DSL step → run → finding → request/response → artifact
```

Из строки можно попасть в доказательство. Из finding — вернуться в точный шаг, который её породил.

### 7.7 Policy Lens

Режим подсветки объясняет решение policy:

- зелёный — разрешено;
- янтарный — нужен approval;
- красный — scope violation;
- серый — нет capability;
- фиолетовый — AI suggestion.

### 7.8 Security Playbook Notebook

Исполняемый playbook объединяет:

- намерение и пояснение;
- DSL cell;
- browser/API action;
- expected result;
- approval;
- output;
- finding;
- evidence.

Это не копия Jupyter. Базовая единица PrettyK — **security action with evidence**, а не математическая ячейка.

### 7.9 Tool Catalog

Tool добавляется в pipeline drag-and-drop или через command palette. В карточке видны capability, risk, permissions, inputs, outputs, supported environments и provenance.

### 7.10 AI без власти

AI может:

- объяснить DSL error;
- предложить step;
- предложить locator;
- собрать pipeline draft;
- объяснить finding;
- найти suspicious response pattern;
- сделать diff-предложение.

AI не может самостоятельно:

- расширить scope;
- изменить policy;
- передать секрет;
- запустить active/destructive action;
- изменить status finding;
- переписать pipeline без diff и review.

---

## 8. Индустриальные кирпичи

### Terminal rendering

`xterm.js` — зрелый frontend terminal emulator, используемый VS Code, Eclipse Che, JupyterLab, Portainer и другими продуктами.

### Language features

LSP стандартизирует autocomplete, diagnostics, navigation, hover и references. Актуальная спецификация на момент исследования — LSP 3.18.

### Debugging

DAP стандартизирует связь editor/debugger. Актуальная спецификация на момент исследования — DAP 1.71.0.

### Remote IDE lessons

VS Code Server показывает удобный remote-workspace паттерн, но официально ориентирован на single-user access и не должен бездумно встраиваться как multi-user PrettyK service.

WebContainers полезны для лёгкого browser-side Node preview, но не являются базой для реального scanner/Playwright execution из-за browser isolation, SharedArrayBuffer/cross-origin requirements и memory limits.

---

## 9. Сценарии GWT

### Безопасная команда

- **Given:** оператор находится в workspace с разрешённым scope.
- **When:** вводит команду проверки pipeline.
- **Then:** команда выполняется в workspace, показывает output и не получает доступ к host или чужому tenant.

### Опасная команда

- **Given:** команда может затронуть target или удалить данные.
- **When:** оператор запускает её.
- **Then:** система показывает risk/permissions, требует approval или блокирует действие; событие попадает в audit.

### Attach к run

- **Given:** worker выполняет fuzzing.
- **When:** оператор открывает Run Console.
- **Then:** он видит live status, безопасные логи и resource usage, но не raw secret.

### Refresh browser

- **Given:** terminal session ещё действительна.
- **When:** пользователь обновляет Web IDE.
- **Then:** терминал восстанавливает подключение к тому же workspace без создания второго процесса.

### Истёкшая сессия

- **Given:** session TTL завершился.
- **When:** пользователь пытается выполнить команду.
- **Then:** команда не запускается, session закрывается, transcript сохраняется только по policy.

### Evidence from output

- **Given:** команда вывела диагностический результат.
- **When:** оператор нажимает «Attach as evidence».
- **Then:** создаётся redacted artifact, связанный с run и actor, с checksum и timestamp.

---

## 10. DoD концепта

- Web IDE имеет workspace terminal, run console и structured command console.
- Терминал не имеет прямого доступа к host shell/Docker socket.
- Каждая опасная команда проходит capability/policy check.
- Есть TTL, idle timeout, cancel, quotas, audit и redaction.
- Reconnect не создаёт дубликат процесса.
- Вывод может стать evidence без утечки секретов.
- Monaco получает LSP-based PrettyK language intelligence.
- Pipeline можно увидеть как DSL и как graph.
- До запуска доступен policy/scope/resource preview.
- Run можно debug/replay без потери provenance.
- AI работает только в режиме suggestion + diff + approval.

---

## 11. Очерёдность

1. Terminal session contract и sandbox boundary.
2. Workspace terminal с preset-командами PrettyK.
3. Run Console и live attach.
4. Audit/redaction/evidence capture.
5. LSP для PrettyK DSL.
6. Pipeline Preview и Code ↔ Graph.
7. Run Debugger, Replay и Evidence-linked Editor.
8. Playbook Notebook и AI suggestions.

---

## 12. Out of scope

- SSH/bastion-консоль для произвольных серверов как первая версия.
- Host terminal и Docker socket из браузера.
- Полная копия VS Code Workbench.
- Полноценная IDE для всех языков.
- AI с правом самостоятельного исполнения.
- Сохранение raw terminal transcript без redaction.
- Запуск security operations без target authorization и scope.

## 13. Индустриальные опоры

- [xterm.js](https://xtermjs.org/)
- [Language Server Protocol](https://microsoft.github.io/language-server-protocol/)
- [Debug Adapter Protocol](https://microsoft.github.io/debug-adapter-protocol/)
- [Visual Studio Code Server](https://code.visualstudio.com/docs/remote/vscode-server)
- [StackBlitz WebContainers](https://developer.stackblitz.com/platform/webcontainers)
