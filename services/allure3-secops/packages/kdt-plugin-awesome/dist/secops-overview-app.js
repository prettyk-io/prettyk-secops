// KDT SecOps: App-дашборд — карточки deploy_url → instances.
// Вызывается из secops-overview.js после основной инициализации.
// Пока заглушка с мок-данными; позже Bro сделает endpoint.
(function () {
  "use strict";

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function fmtDate(ts) {
    if (!ts) return "—";
    return new Date(ts).toLocaleDateString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  const STATUS_LABEL = {
    success: "Успешно",
    has_failures: "С ошибками",
    running: "Выполняется",
  };

  function renderAppDashboard(data, container) {
    if (!data || !Array.isArray(data) || data.length === 0) {
      container.appendChild(el("p", "kdt-muted", "Нет данных приложений"));
      return;
    }
    const grid = el("div", "kdt-app-grid");
    for (const app of data) {
      if (!app || !app.deploys || !Array.isArray(app.deploys)) continue;
      for (const deploy of app.deploys) {
        if (!deploy || !deploy.instances || !Array.isArray(deploy.instances) || !deploy.instances.length) continue;
        const card = el("div", "kdt-app-card");
        card.appendChild(el("div", "kdt-app-card__title", app.app_code || deploy.deploy_url || "—"));
        if (deploy.deploy_url) {
          card.appendChild(el("div", "kdt-app-card__url", deploy.deploy_url));
        }
        for (const inst of deploy.instances) {
          const row = el("div", "kdt-app-instance");
          const dotK = inst.status === "success" ? "success" : inst.status === "running" ? "running" : "failed";
          const dot = el("span", "kdt-app-instance-dot kdt-app-instance-dot--" + dotK);
          const idSpan = el("span", "kdt-app-instance-id", inst.check_id || inst.instance_id || "—");
          const dateSpan = el("span", "kdt-app-instance-date", fmtDate(inst.last_run_ts));
          const link = el("a", "kdt-app-instance-link", "Отчёт");
          link.href = "/projects/" + encodeURIComponent(inst.check_id) + "/reports/latest/";
          row.appendChild(dot);
          row.appendChild(idSpan);
          row.appendChild(dateSpan);
          row.appendChild(link);
          card.appendChild(row);
        }
        grid.appendChild(card);
      }
    }
    container.appendChild(grid);
  }

  // Захардкодженные данные для разработки (позже заменится на fetch)
  async function fetchAppData() {
    // Позже — fetch("/api/runs/apps") или подобный endpoint Bro.
    // Пока мок, полностью отвечающий контракту list_run_apps().
    return [
      {
        app_code: "juice-shop",
        deploys: [{
          deploy_url: "http://juice-shop:3000",
          instances: [
            { instance_id: "chk1", check_id: "chk1", status: "success", last_run_ts: 1723780000000, run_id: "abc123" },
            { instance_id: "chk2", check_id: "chk2", status: "has_failures", last_run_ts: 1722780000000, run_id: "def456" },
          ]
        }]
      },
      {
        app_code: "bank-portal",
        deploys: [{
          deploy_url: "https://portal01.bank.ru",
          instances: [
            { instance_id: "chk3", check_id: "chk3", status: "success", last_run_ts: 1723680000000, run_id: "ghi789" },
          ]
        }]
      },
    ];
  }

  async function initAppDash() {
    const root = document.getElementById("kdt-overview");
    if (!root) return;
    // Вставляем перед историей или в конец
    const anchor = document.getElementById("kdt-history-panel") || null;
    const dashPanel = el("div", "kdt-panel");
    dashPanel.id = "kdt-app-dash";
    dashPanel.appendChild(el("div", "kdt-panel__title", "Приложения"));
    const dashBody = el("div", "");
    dashPanel.appendChild(dashBody);
    if (anchor) {
      root.insertBefore(dashPanel, anchor);
    } else {
      root.appendChild(dashPanel);
    }
    const data = await fetchAppData();
    renderAppDashboard(data, dashBody);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAppDash);
  } else {
    initAppDash();
  }
})();