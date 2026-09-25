import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, join } from "node:path";
import { defaultChartsConfig } from "@allurereport/charts-api";
import { compareBy, createBaseUrlScript, createFontLinkTag, createReportDataScript, stringifyForInlineScript, createScriptTag, createStylesLinkTag, incrementStatistic, joinPosixPath, nullsLast, ordinal, } from "@allurereport/core-api";
import { collapseTreeGroups, createTreeByLabels, createTreeByLabelsAndTitlePath, createTreeByTitlePath, preciseTreeLabels, processTree, } from "@allurereport/plugin-api";
import { generateCharts, getPieChartValues } from "@allurereport/web-commons";
import Handlebars from "handlebars";
import { convertFixtureResult, convertTestResult } from "./converters.js";
const require = createRequire(import.meta.url);
const template = `<!DOCTYPE html>
<html dir="ltr" lang="en">
<head>
    <meta charset="utf-8">
    <title> {{ reportName }} </title>
    <link rel="icon" href="data:image/svg+xml,%3Csvg width='32' height='32' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M22.232 4.662a3.6 3.6 0 0 1 5.09.035c2.855 2.894 4.662 6.885 4.662 11.295a3.6 3.6 0 0 1-7.2 0c0-2.406-.981-4.61-2.587-6.24a3.6 3.6 0 0 1 .035-5.09Z' fill='url(%23a)'/%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M12.392 3.6a3.6 3.6 0 0 1 3.6-3.6c4.41 0 8.401 1.807 11.296 4.662a3.6 3.6 0 1 1-5.056 5.126C20.602 8.18 18.398 7.2 15.992 7.2a3.6 3.6 0 0 1-3.6-3.6Z' fill='url(%23b)'/%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M0 15.992C0 7.157 7.157 0 15.992 0a3.6 3.6 0 0 1 0 7.2A8.789 8.789 0 0 0 7.2 15.992c0 2.406.981 4.61 2.588 6.24a3.6 3.6 0 0 1-5.126 5.056C1.807 24.393 0 20.402 0 15.992Z' fill='url(%23c)'/%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M4.661 22.232a3.6 3.6 0 0 1 5.091-.035c1.63 1.606 3.834 2.587 6.24 2.587a3.6 3.6 0 0 1 0 7.2c-4.41 0-8.401-1.807-11.295-4.661a3.6 3.6 0 0 1-.036-5.091Z' fill='url(%23d)'/%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M28.384 12.392a3.6 3.6 0 0 1 3.6 3.6c0 8.835-7.157 15.992-15.992 15.992a3.6 3.6 0 0 1 0-7.2 8.789 8.789 0 0 0 8.792-8.792 3.6 3.6 0 0 1 3.6-3.6Z' fill='url(%23e)'/%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M28.385 12.392a3.6 3.6 0 0 1 3.6 3.6v12.392a3.6 3.6 0 0 1-7.2 0V15.992a3.6 3.6 0 0 1 3.6-3.6Z' fill='url(%23f)'/%3E%3Cg clip-path='url(%23g)'%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M22.232 4.662a3.6 3.6 0 0 1 5.091.035c2.855 2.894 4.662 6.885 4.662 11.295a3.6 3.6 0 0 1-7.2 0c0-2.406-.982-4.61-2.588-6.24a3.6 3.6 0 0 1 .035-5.09Z' fill='url(%23h)'/%3E%3C/g%3E%3Cdefs%3E%3ClinearGradient id='a' x1='26.4' y1='9.6' x2='28.8' y2='15' gradientUnits='userSpaceOnUse'%3E%3Cstop stop-color='%237E22CE'/%3E%3Cstop offset='1' stop-color='%238B5CF6'/%3E%3C/linearGradient%3E%3ClinearGradient id='b' x1='26.8' y1='9.4' x2='17.8' y2='3.6' gradientUnits='userSpaceOnUse'%3E%3Cstop stop-color='%23EF4444'/%3E%3Cstop offset='1' stop-color='%23DC2626'/%3E%3C/linearGradient%3E%3ClinearGradient id='c' x1='3.6' y1='14' x2='5.4' y2='24.8' gradientUnits='userSpaceOnUse'%3E%3Cstop stop-color='%2322C55E'/%3E%3Cstop offset='1' stop-color='%2315803D'/%3E%3C/linearGradient%3E%3ClinearGradient id='d' x1='4.8' y1='22.2' x2='14.4' y2='29.2' gradientUnits='userSpaceOnUse'%3E%3Cstop stop-color='%2394A3B8'/%3E%3Cstop offset='.958' stop-color='%2364748B'/%3E%3Cstop offset='1' stop-color='%2364748B'/%3E%3C/linearGradient%3E%3ClinearGradient id='e' x1='28.4' y1='22.173' x2='22.188' y2='28.384' gradientUnits='userSpaceOnUse'%3E%3Cstop stop-color='%23D97706'/%3E%3Cstop offset='1' stop-color='%23FBBF24'/%3E%3C/linearGradient%3E%3ClinearGradient id='f' x1='29.2' y1='54.4' x2='30.626' y2='54.256' gradientUnits='userSpaceOnUse'%3E%3Cstop stop-color='%23FBBF24'/%3E%3Cstop offset='1' stop-color='%23FBBF24'/%3E%3C/linearGradient%3E%3ClinearGradient id='h' x1='26.4' y1='9.6' x2='28.8' y2='15' gradientUnits='userSpaceOnUse'%3E%3Cstop stop-color='%237E22CE'/%3E%3Cstop offset='1' stop-color='%238B5CF6'/%3E%3C/linearGradient%3E%3CclipPath id='g'%3E%3Cpath fill='%23fff' transform='translate(24.8 12)' d='M0 0h7.2v8H0z'/%3E%3C/clipPath%3E%3C/defs%3E%3C/svg%3E" />
    {{{ headTags }}}
    <script>
      window.allureReportOptions = {{{ reportOptions }}}
    </script>
</head>
<body class="kdt-secops" {{#if fullView}}data-full="1"{{/if}}>
    {{#unless fullView}}
    <div id="kdt-app">
        <header class="kdt-header">
            <span class="kdt-secops-mark kdt-secops-mark--has-lab">
                <svg class="kdt-secops-mark-bracket" viewBox="0 0 12 12" width="20" height="20" aria-hidden="true">
                    <path d="M1,2 H7 M1,2 V7" stroke="#8ab4f8" stroke-width="1.8" fill="none" stroke-linecap="round"/>
                    <circle cx="5.5" cy="6" r="1.3" fill="#8ab4f8"/>
                </svg>
                <span class="kdt-secops-mark-sec">Sec</span>
                <span class="kdt-secops-mark-ops">Ops</span>
                <span class="kdt-secops-mark-lab">Lab</span>
                <span class="kdt-secops-mark-bar" aria-hidden="true"></span>
            </span>
            <span class="kdt-header__meta">{{ reportName }}</span>
        </header>
        <main class="kdt-main">
            <div id="kdt-overview">
                <div class="kdt-grid" id="kdt-stats"></div>
                <div class="kdt-panel" id="kdt-gate-panel">
                    <div class="kdt-panel__title">Качество</div>
                    <div id="kdt-gate"></div>
                </div>
                <div class="kdt-panel">
                    <div class="kdt-panel__title">Переменные</div>
                    <div id="kdt-vars"></div>
                </div>
                <div class="kdt-panel" id="kdt-env-panel">
                    <div class="kdt-panel__title">Окружение</div>
                    <div id="kdt-env"></div>
                </div>
                <div class="kdt-panel">
                    <div class="kdt-panel__title">Категории</div>
                    <div id="kdt-categories"></div>
                </div>
                <div class="kdt-panel" id="kdt-history-panel">
                    <div class="kdt-panel__title">История запусков</div>
                    <div id="kdt-history"></div>
                </div>
            </div>
            <noscript>Включите JavaScript для просмотра отчёта.</noscript>
            <a class="kdt-open-report" href="full.html">
                <span>Открыть полный отчёт (SPA)</span>
                <span aria-hidden="true">&rarr;</span>
            </a>
        </main>
    </div>
    {{/unless}}
    {{#if fullView}}
    <div id="app"></div>
    <a class="kdt-back-to-overview" href="index.html">
        <span aria-hidden="true">&larr;</span>
        <span>К обзору SecOps Lab</span>
    </a>
    {{/if}}
    ${createBaseUrlScript()}
    <script>
      window.allure = window.allure || {};
    </script>
    {{{ bodyTags }}}
    {{{ reportFilesScript }}}
</body>
</html>
`;
const compiledTemplate = Handlebars.compile(template);
export const readTemplateManifest = async (singleFileMode) => {
    const templateManifestSource = require.resolve(`@allurereport/web-awesome/dist/${singleFileMode ? "single" : "multi"}/manifest.json`);
    const templateManifest = await readFile(templateManifestSource, { encoding: "utf-8" });
    return JSON.parse(templateManifest);
};
const createBreadcrumbs = (convertedTr) => {
    const labelsByType = convertedTr.labels.reduce((acc, label) => {
        if (!acc[label.name]) {
            acc[label.name] = [];
        }
        acc[label.name].push(label.value || "");
        return acc;
    }, {});
    const parentSuites = labelsByType.parentSuite ?? [""];
    const suites = labelsByType.suite ?? [""];
    const subSuites = labelsByType.subSuite ?? [""];
    return parentSuites.reduce((acc, parentSuite) => {
        suites.forEach((suite) => {
            subSuites.forEach((subSuite) => {
                const path = [parentSuite, suite, subSuite].filter(Boolean);
                if (path.length > 0) {
                    acc.push(path);
                }
            });
        });
        return acc;
    }, []);
};
const writeConcurrently = async (items, write, concurrency = 64) => {
    for (let i = 0; i < items.length; i += concurrency) {
        await Promise.all(items.slice(i, i + concurrency).map(write));
    }
};
export const generateTestResults = async (_writer, store, trs, options = {}) => {
    let convertedTrs = [];
    const related = await store.relatedByTestResultIds(trs.map(({ id }) => id));
    for (const tr of trs) {
        const trFixtures = related.fixturesByTrId.get(tr.id) ?? [];
        const convertedTrFixtures = trFixtures.map(convertFixtureResult);
        const convertedTr = convertTestResult(tr, {
            hideLabels: options.hideLabels,
        });
        convertedTr.history = related.historyByTrId.get(tr.id) ?? [];
        convertedTr.retries = related.retriesByTrId.get(tr.id) ?? [];
        convertedTr.retriesCount = convertedTr.retries.length;
        convertedTr.retry = convertedTr.retriesCount > 0;
        convertedTr.isRetry = tr.isRetry;
        convertedTr.setup = convertedTrFixtures.filter((f) => f.type === "before");
        convertedTr.teardown = convertedTrFixtures.filter((f) => f.type === "after");
        convertedTr.attachments = (related.attachmentsByTrId.get(tr.id) ?? []).map((attachment) => ({
            link: attachment,
            type: "attachment",
        }));
        convertedTr.breadcrumbs = createBreadcrumbs(convertedTr);
        convertedTrs.push(convertedTr);
    }
    convertedTrs = convertedTrs.sort(nullsLast(compareBy("start", ordinal()))).map((tr, idx) => ({
        ...tr,
        order: idx + 1,
    }));
    return convertedTrs;
};
export const generateTestCases = async (writer, trs) => {
    await writeConcurrently(trs, (tr) => writer.writeTestCase(tr));
};
export const generateTestEnvGroups = async (writer, groups) => {
    for (const group of groups) {
        const src = joinPosixPath("test-env-groups", `${group.id}.json`);
        await writer.writeData(src, group);
    }
};
export const generateNav = async (writer, trs, filename = "nav.json") => {
    await writer.writeWidget(filename, trs.filter(({ isRetry }) => !isRetry).map(({ id }) => id));
};
const SEARCHABLE_LABELS = new Set([
    "owner",
    "suite",
    "package",
    "testClass",
    "testMethod",
    "epic",
    "feature",
    "story",
    "tag",
    "host",
    "thread",
]);
const joinSearchValues = (values) => {
    const uniqueValues = new Set(values.map((value) => value?.trim()).filter((value) => Boolean(value)));
    return uniqueValues.size > 0 ? [...uniqueValues].join(" ") : undefined;
};
const searchDocumentFactory = (test) => {
    const labels = (test.labels ?? []).flatMap(({ name, value }) => {
        if (!value || !SEARCHABLE_LABELS.has(name)) {
            return [];
        }
        return [`${name}:${value}`, value];
    });
    const tags = (test.labels ?? []).flatMap(({ name, value }) => (name === "tag" && value ? [value] : []));
    const parameters = (test.parameters ?? []).flatMap(({ name, value, hidden, masked }) => {
        if (hidden) {
            return [];
        }
        return masked ? [name] : [`${name}:${value}`, name, value];
    });
    const links = (test.links ?? []).flatMap(({ name, url, type }) => [name, url, type]);
    const categories = test.categories?.map((category) => category.name);
    return {
        id: test.id,
        nodeId: test.id,
        name: test.name,
        fullName: test.fullName,
        historyId: test.historyId,
        labels: joinSearchValues(labels),
        owner: joinSearchValues(test.groupedLabels.owner ?? []),
        tags: joinSearchValues(tags),
        parameters: joinSearchValues(parameters),
        categories: joinSearchValues(categories ?? []),
        statusMessage: test.error?.message,
        links: joinSearchValues(links),
    };
};
export const generateSearchIndex = async (writer, trs, filename = "search-index.json") => {
    const searchDocuments = trs.filter(({ isRetry }) => !isRetry).map(searchDocumentFactory);
    await writer.writeWidget(filename, searchDocuments);
};
export const getRunSummary = (testResults) => {
    let start = Infinity;
    let stop = -Infinity;
    for (const { start: s, stop: e } of testResults) {
        if (typeof s === "number" && Number.isFinite(s) && typeof e === "number" && Number.isFinite(e)) {
            start = Math.min(start, s);
            stop = Math.max(stop, e);
        }
    }
    return Number.isFinite(start) && Number.isFinite(stop)
        ? { start, stop, duration: Math.max(0, stop - start) }
        : undefined;
};
export const generateTree = async (writer, treeFilename, labels, tests, options) => {
    const visibleTests = tests.filter((test) => !test.isRetry);
    const { appendTitlePath } = options || {};
    let tree;
    if (labels.length === 0) {
        tree = buildTreeByTitlePath(visibleTests);
    }
    else if (appendTitlePath && labels.length) {
        tree = buildTreeByLabelsAndTitlePathCombined(visibleTests, labels);
    }
    else {
        tree = buildTreeByLabels(visibleTests, labels);
    }
    processTree(tree, {
        sort: nullsLast(compareBy("start", ordinal())),
        transform: (leaf, idx) => ({ ...leaf, groupOrder: idx + 1 }),
    });
    await writer.writeWidget(treeFilename, tree);
};
const buildTreeByLabels = (tests, labels) => {
    return createTreeByLabels(tests, labels, leafFactory, undefined, (group, leaf) => {
        incrementStatistic(group.statistic, leaf.status);
    });
};
const buildTreeByTitlePath = (tests) => {
    const testsWithTitlePath = [];
    const testsWithoutTitlePath = [];
    for (const test of tests) {
        if (Array.isArray(test.titlePath) && test.titlePath.length > 0) {
            testsWithTitlePath.push(test);
        }
        else {
            testsWithoutTitlePath.push(test);
        }
    }
    const treeByTitlePath = createTreeByTitlePath(testsWithTitlePath, leafFactory, undefined, (group, leaf) => incrementStatistic(group.statistic, leaf.status));
    if (!testsWithoutTitlePath.length) {
        return treeByTitlePath;
    }
    const defaultLabels = preciseTreeLabels(["parentSuite", "suite", "subSuite"], testsWithoutTitlePath, ({ labels }) => labels.map(({ name }) => name));
    let treeByDefaultLabels = null;
    if (defaultLabels.length) {
        treeByDefaultLabels = createTreeByLabelsAndTitlePath(testsWithoutTitlePath, defaultLabels, leafFactory, undefined, (group, leaf) => incrementStatistic(group.statistic, leaf.status));
    }
    else {
        for (const test of testsWithoutTitlePath) {
            const leaf = leafFactory(test);
            treeByTitlePath.leavesById[leaf.nodeId] = leaf;
            if (!treeByTitlePath.root.leaves) {
                treeByTitlePath.root.leaves = [];
            }
            treeByTitlePath.root.leaves.push(leaf.nodeId);
        }
        return treeByTitlePath;
    }
    const mergedLeavesById = {
        ...treeByTitlePath.leavesById,
        ...treeByDefaultLabels.leavesById,
    };
    const mergedGroupsById = {
        ...treeByTitlePath.groupsById,
        ...treeByDefaultLabels.groupsById,
    };
    const mergedRootLeaves = Array.from(new Set([...(treeByTitlePath.root.leaves ?? []), ...(treeByDefaultLabels.root.leaves ?? [])]));
    const mergedRootGroups = Array.from(new Set([...(treeByTitlePath.root.groups ?? []), ...(treeByDefaultLabels.root.groups ?? [])]));
    return {
        root: {
            leaves: mergedRootLeaves,
            groups: mergedRootGroups,
        },
        leavesById: mergedLeavesById,
        groupsById: mergedGroupsById,
    };
};
const buildTreeByLabelsAndTitlePathCombined = (tests, labels) => collapseTreeGroups(createTreeByLabelsAndTitlePath(tests, labels, leafFactory, undefined, (group, leaf) => incrementStatistic(group.statistic, leaf.status)));
const leafFactory = ({ id, name, status, duration, flaky, start, retry, retriesCount, transition, tooltips, historyId, groupedLabels, categories, }) => {
    const leaf = {
        nodeId: id,
        id: historyId ?? id,
        name,
        status,
        duration,
        flaky,
        start,
        retry,
        retriesCount,
        transition,
        tooltips,
    };
    if (groupedLabels.tag && groupedLabels.tag.length > 0) {
        leaf.tags = groupedLabels.tag;
    }
    if (categories?.length) {
        leaf.categories = categories.map((category) => category.name).filter(Boolean);
    }
    return leaf;
};
export const generateEnvironmentJson = async (writer, env) => {
    await writer.writeWidget("allure_environment.json", env);
};
export const generateEnvirontmentsList = async (writer, store) => {
    const environments = await store.allEnvironmentIdentities();
    await writer.writeWidget("environments.json", environments);
};
export const generateVariables = async (writer, store) => {
    const reportVariables = await store.allVariables();
    const environments = await store.allEnvironmentIdentities();
    await writer.writeWidget("variables.json", reportVariables);
    for (const env of environments) {
        const envVariables = await store.envVariablesByEnvironmentId(env.id);
        await writer.writeWidget(joinPosixPath(env.id, "variables.json"), envVariables);
    }
};
export const generateStatistic = async (writer, data) => {
    const { stats, statsByEnv, envs } = data;
    await writer.writeWidget("statistic.json", stats);
    await writer.writeWidget("pie_chart.json", getPieChartValues(stats));
    for (const env of envs) {
        const envStats = statsByEnv.get(env.id);
        if (!envStats) {
            continue;
        }
        await writer.writeWidget(joinPosixPath(env.id, "statistic.json"), envStats);
        await writer.writeWidget(joinPosixPath(env.id, "pie_chart.json"), envStats);
    }
};
export const generateAttachmentsFiles = async (writer, attachmentLinks, contentFunction) => {
    const result = new Map();
    for (const { id, ext, ...link } of attachmentLinks) {
        if (link.missed) {
            continue;
        }
        const content = await contentFunction(id);
        if (!content) {
            continue;
        }
        const src = `${id}${ext}`;
        await writer.writeAttachment(src, content);
        result.set(id, src);
    }
    return result;
};
export const generateHistoryDataPoints = async (writer, store) => {
    const result = new Map();
    const allHistoryPoints = await store.allHistoryDataPoints();
    const latest = allHistoryPoints.slice(0, 6);
    for (const historyPoint of latest) {
        const src = `history/${historyPoint.uuid}.json`;
        await writer.writeData(src, historyPoint);
    }
    // KDT SecOps: индекс истории для обзора (widgets/history-index.json).
    const indexPoints = latest.map((hp) => ({
        uuid: hp.uuid,
        name: hp.name,
        timestamp: hp.timestamp,
        statistic: hp.statistic,
        status: hp.status,
    }));
    await writer.writeWidget("history-index.json", indexPoints);
    return result;
};
export const generateGlobals = async (writer, payload) => {
    const { globalExitCode, globalAttachments = [], globalAttachmentsByEnv = {}, globalErrors = [], globalErrorsByEnv = {}, contentFunction, } = payload;
    const globals = {
        errors: globalErrors,
        attachments: [],
    };
    const attachmentsByEnv = {};
    if (globalExitCode) {
        globals.exitCode = globalExitCode;
    }
    for (const attachment of globalAttachments) {
        const src = `${attachment.id}${attachment.ext}`;
        const content = await contentFunction(attachment.id);
        if (!content) {
            continue;
        }
        await writer.writeAttachment(src, content);
        globals.attachments.push(attachment);
    }
    Object.entries(globalAttachmentsByEnv).forEach(([environmentId, attachments]) => {
        const attachmentIds = new Set(globals.attachments.map(({ id }) => id));
        const writtenAttachments = attachments.filter(({ id }) => attachmentIds.has(id));
        if (writtenAttachments.length === 0) {
            return;
        }
        attachmentsByEnv[environmentId] = writtenAttachments;
    });
    if (Object.keys(attachmentsByEnv).length > 0) {
        globals.attachmentsByEnv = attachmentsByEnv;
    }
    if (Object.keys(globalErrorsByEnv).length > 0) {
        globals.errorsByEnv = globalErrorsByEnv;
    }
    await writer.writeWidget("globals.json", globals);
};
export const generateQualityGateResults = async (writer, qualityGateResults = {}) => {
    await writer.writeWidget("quality-gate.json", qualityGateResults);
};
export const generateStaticFiles = async (payload) => {
    const { id, reportName = "SecOps Lab", reportLanguage = "en", singleFile, logo = "", theme = "auto", groupBy, reportFiles, reportDataFiles, reportUuid, allureVersion, layout = "base", defaultSection = "", ci, executor, runSummary, stepTreeExpansion, defaultSortBy, } = payload;
    const manifest = await readTemplateManifest(payload.singleFile);
    const headTags = [];
    const bodyTags = [];
    const sections = ["charts", "timeline"];
    if (!payload.singleFile) {
        const manifestPath = require.resolve(join("@allurereport/web-awesome/dist", singleFile ? "single" : "multi", "manifest.json"));
        const templateDir = dirname(manifestPath);
        for (const key in manifest) {
            const fileName = manifest[key];
            if (key.includes(".woff")) {
                headTags.push(createFontLinkTag(fileName));
            }
            if (key === "main.css") {
                headTags.push(createStylesLinkTag(fileName));
            }
            if (key === "main.js") {
                bodyTags.push(createScriptTag(fileName));
            }
        }
        for (const fileName of await readdir(templateDir)) {
            if (fileName === "manifest.json") {
                continue;
            }
            const filePath = join(templateDir, fileName);
            const fileContent = await readFile(filePath);
            await reportFiles.addFile(basename(filePath), fileContent);
        }
    }
    else {
        const mainJs = manifest["main.js"];
        const mainJsSource = require.resolve(`@allurereport/web-awesome/dist/single/${mainJs}`);
        const mainJsContent = await readFile(mainJsSource);
        bodyTags.push(createScriptTag(`data:text/javascript;base64,${mainJsContent.toString("base64")}`));
    }
    const now = Date.now();
    const reportOptions = {
        id,
        reportName,
        logo,
        theme,
        reportLanguage,
        createdAt: now,
        reportUuid,
        groupBy: groupBy?.length ? groupBy : [],
        cacheKey: now.toString(),
        ci,
        executor,
        runSummary,
        layout,
        allureVersion,
        sections,
        defaultSection,
        stepTreeExpansion,
        defaultSortBy,
    };
    try {
        // KDT SecOps: bundle our minimal chrome (header/overview) into the report.
        // Files live in the same dist; copied to flat report root like awesome assets.
        const overviewJs = await readFile(new URL("./secops-overview.js", import.meta.url), "utf8");
        const overviewAppJs = await readFile(new URL("./secops-overview-app.js", import.meta.url), "utf8");
        const overviewCss = await readFile(new URL("./secops-overview.css", import.meta.url), "utf8");
        const brandStyleTag = `\n    ${`<style>`}${overviewCss}${`</style>`}`;
        const brandScriptTag = `\n    ${`<script>`}${overviewJs}${`</script>`}\n    ${`<script>`}${overviewAppJs}${`</script>`}`;
        const common = {
            reportFilesScript: createReportDataScript(reportDataFiles),
            reportOptions: stringifyForInlineScript(reportOptions),
            analyticsEnable: false,
            allureVersion,
            reportUuid,
            reportName,
            singleFile: payload.singleFile,
        };
        // Two-page report:
        //  - index.html = minimal SecOps Overview (standalone, no duplicate SPA)
        //  - full.html  = full awesome SPA (same data) for deep dive
        const overviewHtml = compiledTemplate({
            ...common,
            headTags: brandStyleTag,
            bodyTags: brandScriptTag,
            fullView: false,
        });
        await reportFiles.addFile("index.html", Buffer.from(overviewHtml, "utf8"));

        const fullHtml = compiledTemplate({
            ...common,
            headTags: [...headTags, brandStyleTag].join("\n"),
            bodyTags: bodyTags.join("\n"),
            fullView: true,
        });
        await reportFiles.addFile("full.html", Buffer.from(fullHtml, "utf8"));
    }
    catch (err) {
        if (err instanceof RangeError) {
            console.error("The report is too large to be generated in the single file mode!");
            process.exit(1);
        }
        throw err;
    }
};
export const generateAllCharts = async (writer, store, options, context) => {
    const { charts = defaultChartsConfig, filter } = options;
    const generatedChartsData = await generateCharts(charts, store, context.reportName, randomUUID, filter);
    if (Object.keys(generatedChartsData.general).length > 0) {
        await writer.writeWidget("charts.json", generatedChartsData);
    }
};
export const generateTreeFilters = async (writer, testResults) => {
    const trTags = new Set();
    const trCategories = new Set();
    for (const tr of testResults) {
        for (const tag of tr.groupedLabels.tag ?? []) {
            trTags.add(tag);
        }
        tr.categories?.forEach((category) => {
            if (category.name) {
                trCategories.add(category.name);
            }
        });
    }
    const tags = Array.from(trTags).sort((a, b) => a.localeCompare(b));
    const categories = Array.from(trCategories).sort((a, b) => a.localeCompare(b));
    await writer.writeWidget("tree-filters.json", { tags, categories });
};
