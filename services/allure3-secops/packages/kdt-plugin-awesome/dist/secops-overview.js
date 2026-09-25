// KDT SecOps: minimal Overview dashboard for Allure 3 report.
// Reads already-generated awesome widgets (statistic/categories/quality-gate/timeline)
// and renders brand cards into #kdt-overview. Vanilla JS, no deps, bank-safe
// (no external analytics/network).
(function () {
  "use strict";

  const RU = {
    total: "Всего проверок",
    passed: "Успешно",
    failed: "Провалено",
    broken: "Сломано",
    skipped: "Пропущено",
    unknown: "Неизвестно",
    retries: "Ретраи",
    categories: "Категории",
    noCategories: "Категории не заданы",
    gate: "Качество-ворота",
    gateNotSet: "Не настроены",
    passedGate: "Гейт пройден",
    failedGate: "Гейт не пройден",
    environment: "Окружение",
    variables: "Переменные",
    qualityGate: "Качество",
  };

  async function fetchJson(path) {
    try {
      const res = await fetch(path, { cache: "no-store" });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
    }
  }

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function card(label, value, kind) {
    const c = el("div", "kdt-card" + (kind ? " kdt-card--" + kind : ""));
    const v = el("div", "kdt-card__value", String(value ?? "—"));
    const l = el("div", "kdt-card__label", label);
    c.appendChild(v);
    c.appendChild(l);
    return c;
  }

  const STATUS_KIND = {
    passed: "passed",
    failed: "failed",
    broken: "broken",
    skipped: "skipped",
  };

  const RU_CAT = {
    "Product defects": "Дефекты продукта",
    "Test defects": "Дефекты тестов",
    "Ignored tests": "Пропущенные тесты",
    "Passed tests": "Пройденные тесты",
    "Unknown test defects": "Неизвестные дефекты",
  };

  function renderStatistic(stat, summary, container) {
    const keys = ["total", "passed", "failed", "broken", "skipped", "unknown"];
    for (const k of keys) {
      const value = stat[k] != null ? stat[k] : 0;
      container.appendChild(card(RU[k] ?? k, value, STATUS_KIND[k]));
    }
    if (stat.retries != null) {
      container.appendChild(card(RU.retries, stat.retries, "retries"));
    }
    // Добавляем карточку «Длительность» — читается за 5 секунд
    if (summary && summary.duration != null) {
      const sec = summary.duration / 1000;
      const dur = sec >= 60
        ? `${Math.floor(sec / 60)}м ${Math.round(sec % 60)}с`
        : `${Math.round(sec)}с`;
      container.appendChild(card("Длительность", dur));
    }
  }

  function renderCategories(cat, container) {
    // Allure 3 categories.json = { roots: ["cat:...", ...], nodes: { id: { name, statistic, ... } } }
    if (!cat || !cat.roots || !cat.nodes || !Array.isArray(cat.roots) || !cat.roots.length) {
      const p = el("p", "kdt-muted", RU.noCategories);
      container.appendChild(p);
      return;
    }
    for (const rootId of cat.roots) {
      const node = cat.nodes[rootId];
      if (!node) continue;
      const rawName = node.name || "—";
      const name = RU_CAT[rawName] || rawName;
      const stat = node.statistic || {};
      const total = (stat.total != null ? stat.total : (stat.passed || 0) + (stat.failed || 0) + (stat.broken || 0) + (stat.skipped || 0) + (stat.unknown || 0));
      const count = (stat.failed || 0) + (stat.broken || 0);
      const row = el("div", "kdt-cat");
      const nameEl = total > 1
        ? (function () {
            const a = el("a", "kdt-cat__name kdt-cat__link", name);
            a.href = "full.html#suites/" + encodeURIComponent(rootId);
            return a;
          })()
        : el("span", "kdt-cat__name", name);
      row.appendChild(nameEl);
      if (count > 0) row.appendChild(el("span", "kdt-cat__count", String(count)));
      container.appendChild(row);
    }
  }

  function renderQualityGate(qg, container) {
    // quality-gate.json может быть {} (гейт не сгенерирован) — это «не настроены»,
    // а не «не пройден». Пустой объект — truthy, поэтому проверяем ключи.
    if (!qg || Object.keys(qg).length === 0) {
      container.appendChild(el("p", "kdt-muted", RU.gateNotSet));
      return;
    }
    const passed = qg.passed ?? qg.status === "passed" ?? qg.overallStatus === "passed";
    const row = el("div", "kdt-gate" + (passed ? " kdt-gate--ok" : " kdt-gate--bad"));
    row.appendChild(el("span", "kdt-gate__text", passed ? RU.passedGate : RU.failedGate));
    container.appendChild(row);
  }

  function renderVariables(vars, env, container) {
    const RU_KEYS = {
      stand: "Стенд",
      check_id: "Проверка",
      quality_gate: "Гейт",
      allure_engine: "Движок Allure",
      target: "Цель",
      environment: "Окружение",
      url: "URL",
      project_id: "Проект",
      branch: "Ветка",
      commit: "Коммит",
      build_id: "Сборка",
      runner: "Исполнитель",
      browser: "Браузер",
      browser_type: "Тип браузера",
      zap_mode: "Режим ZAP",
      assessment_purpose: "Назначение проверки",
      auth_type: "Тип авторизации",
      scan_policy: "Политика сканирования",
      initiator: "Инициатор",
      report_name: "Название отчёта",
    };
    // Normalize both sources into flat {name, value} list.
    const flat = [];
    if (Array.isArray(vars)) {
      for (const v of vars) {
        if (v && v.name != null) flat.push({ name: String(v.name), value: v.value });
      }
    }
    if (Array.isArray(env)) {
      for (const e of env) {
        if (!e || e.name == null) continue;
        const values = Array.isArray(e.values) ? e.values : [e.value];
        flat.push({ name: String(e.name), value: values.join(", ") });
      }
    }
    const seen = new Set();
    for (const v of flat) {
      if (v.value == null || String(v.value).trim() === "") continue;
      if (seen.has(v.name)) continue;
      seen.add(v.name);
      const display = RU_KEYS[v.name] || v.name;
      const row = el("div", "kdt-var");
      row.appendChild(el("span", "kdt-var__name", display));
      row.appendChild(el("span", "kdt-var__value", String(v.value)));
      container.appendChild(row);
    }
    if (container.childElementCount === 0) {
      container.appendChild(el("p", "kdt-muted", "Переменные не заданы"));
    }
  }

  function renderStat(title, value) {
    const row = el("div", "kdt-statrow");
    row.appendChild(el("span", "kdt-statrow__name", title));
    row.appendChild(el("span", "kdt-statrow__value", String(value ?? "—")));
    return row;
  }

  function renderHistory(historyPoints, container) {
    if (!historyPoints || !Array.isArray(historyPoints) || historyPoints.length === 0) {
      container.appendChild(el("p", "kdt-muted", "Нет истории запусков"));
      return;
    }
    const row = el("div", "kdt-history-row");
    for (const point of historyPoints) {
      if (!point || !point.uuid) continue;
      const stat = point.statistic || {};
      const status = (point.status || "").toLowerCase();
      const date = point.timestamp
        ? new Date(point.timestamp).toLocaleDateString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
        : "—";
      const total = (stat.total != null ? stat.total : (stat.passed || 0) + (stat.failed || 0) + (stat.broken || 0) + (stat.skipped || 0) + (stat.unknown || 0));
      const dot = el("span", "kdt-history-dot kdt-history-dot--" + (status === "passed" ? "passed" : status === "failed" ? "failed" : "muted"));
      const link = el("a", "kdt-history-item", String(total));
      link.href = "full.html?historyId=" + encodeURIComponent(point.uuid);
      link.title = [
        "Пр: " + (stat.passed ?? 0),
        "Уп: " + (stat.failed ?? 0),
        "Сл: " + (stat.broken ?? 0),
        "Прс: " + (stat.skipped ?? 0),
      ].join("  ");
      const label = el("span", "kdt-history-label", date);
      const cell = el("div", "kdt-history-cell");
      cell.appendChild(dot);
      cell.appendChild(link);
      cell.appendChild(label);
      row.appendChild(cell);
    }
    container.appendChild(row);
  }

  async function init() {
    const root = document.getElementById("kdt-overview");
    if (!root) return;
    const stat = await fetchJson("widgets/statistic.json");
    const cat = await fetchJson("widgets/categories.json");
    const qg = await fetchJson("widgets/quality-gate.json");
    const vars = await fetchJson("widgets/variables.json");
    // Allure 3: environment.properties land in allure_environment.json,
    // not variables.json. Merge both so Русские переменные show up.
    const envRaw = await fetchJson("widgets/allure_environment.json");
    const summary = await fetchJson("summary.json");

    const statsEl = document.getElementById("kdt-stats");
    if (statsEl && stat) renderStatistic(stat, summary, statsEl);

    const catEl = document.getElementById("kdt-categories");
    if (catEl) renderCategories(cat, catEl);

    const gateEl = document.getElementById("kdt-gate");
    if (gateEl) renderQualityGate(qg, gateEl);

    const varEl = document.getElementById("kdt-vars");
    if (varEl) renderVariables(vars, envRaw, varEl);

    const envEl = document.getElementById("kdt-env");
    if (envEl && envRaw) {
      const stand = envRaw.find((e) => e.name === "stand");
      const target = envRaw.find((e) => e.name === "target");
      if (stand) envEl.appendChild(renderStat("Стенд", stand.values ? stand.values[0] : stand.value));
      if (target) envEl.appendChild(renderStat("Цель", target.values ? target.values[0] : target.value));
      if (!stand && !target) {
        envEl.appendChild(el("p", "kdt-muted", "Не указано"));
      }
    }

    const history = await fetchJson("widgets/history-index.json");
    const historyEl = document.getElementById("kdt-history");
    if (historyEl) renderHistory(history, historyEl);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();