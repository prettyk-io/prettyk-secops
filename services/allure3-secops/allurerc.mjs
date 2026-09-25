import { defineConfig } from "allure";

// Allure 3 (KDT SecOps) — 6 SecOps buckets (Rus), order = first match wins.
// NOTE: `allure generate` reads this config; `allure awesome` resets categories.
// These are mirrored from orchestrator/utils/allure_report_meta.py DEFAULT_CATEGORIES.

const secopsCategories = [
  {
    name: "Инфраструктура (Grid/Selenium)",
    messageRegex: ".*(WebDriver|selenium|SessionNotCreated|grid|chromedriver|Timed out waiting|SessionNotCreatedException|ECONNREFUSED).*",
    traceRegex: ".*(WebDriver|selenium|grid|chromedriver).*",
    matchedStatuses: ["broken", "failed"],
  },
  {
    name: "Auth / сессия",
    messageRegex: ".*(auth|login|cookie|401|403|Unauthorized|Forbidden|session|token).*",
    matchedStatuses: ["failed", "broken"],
  },
  {
    name: "ZAP / security",
    messageRegex: ".*(ZAP|OWASP|alertRef|spider|ascan|vuln|CVE|exploit|risk|threat|xss|sql|инъекц|injection|утечк|leak|brute).*",
    traceRegex: ".*(scan|attack|payload|sql|xss|exploit|CVE|spider|ascan).*",
    matchedStatuses: ["failed", "broken"],
  },
  {
    name: "Таймаут шага",
    messageRegex: ".*(Timeout|таймаут|timed out|TimeoutException).*",
    matchedStatuses: ["broken", "failed"],
  },
  {
    name: "Assertion / ожидание",
    messageRegex: ".*(AssertionError|Expected|ожидал|assert |Assert).*",
    matchedStatuses: ["failed"],
  },
  {
    name: "Прочее",
    matchedStatuses: ["failed", "broken"],
  },
];

export default defineConfig({
  name: "SecOps Lab",
  output: "/app/default-reports",
  categories: secopsCategories,
  plugins: {
    awesome: {
      options: {
        reportName: "SecOps Lab",
        reportLanguage: "ru",
        theme: "dark",
        logo: "",
        singleFile: false,
      },
    },
  },
});