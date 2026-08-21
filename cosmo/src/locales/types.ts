/** Locale type and translation dictionary shape. */
export type Locale = 'ru' | 'en';

export interface TranslationDictionary {
  common: {
    save: string; cancel: string; back: string; delete: string;
    rename: string; close: string; create: string; loading: string;
    empty: string; error: string; success: string; logout: string;
    search: string; refresh: string; add: string; copy: string;
    download: string; import: string; export: string; edit: string;
  };
  header: {
    home: string; studio: string; editor: string; monitoring: string;
    results: string; admin: string; lab: string; toHome: string;
  };
  login: {
    title: string; subtitle: string; login: string; password: string;
    signIn: string; sso: string; ssoRedirect: string;
  };
  home: {
    title: string; subtitle: string; initiateCheck: string;
    importCheck: string; studioSetup: string;
    recentChecks: string; noChecks: string;
    validateWired: string; validateConstructors: string;
    startPipeline: string;
  };
  studio: {
    emptyTitle: string; emptyDesc: string;
    addEntity: string; renamePrompt: string; deletePrompt: string;
    categories: {
      scenarios: string; dataModels: string; pageModels: string;
      fuzzers: string; connectors: string; authProfiles: string;
    };
    actionHub: {
      pageModels: string; scenarios: string; fuzzers: string;
      dataModules: string; connectors: string; authProfiles: string;
    };
    form: {
      title: string; identifier: string;
      folder: string; rootFolder: string;
      resourceType: string; sourceType: string;
      endpoint: string; schemaSource: string;
      protoPack: string; connectorType: string;
      authModule: string; optional: string;
      entityName: string; browser: string;
    };
    suite: {
      url: string; additionalUrls: string; blockedUrls: string;
      browser: string; debugMode: string; failsafe: string;
      webswing: string; webswingTimeout: string; idleTimeout: string;
      discoveryMode: string; setupTitle: string;
    };
    checkWired: string; launchPipeline: string;
    importFromCheck: string;
  };
  lab: {
    title: string; subtitle: string; startAttack: string;
    stopAttack: string; requestRecognized: string;
    positionsMarked: string; autoDetect: string;
    steps: { target: string; positions: string; mode: string; payloads: string; execute: string };
    modes: {
      sniper: { title: string; desc: string };
      batteringRam: { title: string; desc: string };
      pitchfork: { title: string; desc: string };
      clusterBomb: { title: string; desc: string };
    };
    payloads: {
      presets: string; custom: string; numbers: string; bruteForce: string;
      upload: string; preview: string; encoders: string; prefix: string; suffix: string;
    };
    presets: { sqli: string; xss: string; ssrf: string; auth: string; boundary: string };
    results: string; noResults: string; requestsSent: string;
    inspector: string; saveResults: string; newAttack: string;
  };
  admin: {
    overview: string; programs: string; findings: string;
    policies: string; runs: string; syncDojo: string;
    deployRegistry: string; integrations: string;
    sections: {
      overview: string; integrations: string; runs: string;
      apps: string; registry: string; evidence: string;
      findings: string; policies: string; retention: string;
      dojoSync: string; authVault: string; notify: string; delta: string;
    };
  };
  runs: {
    id: string; time: string; status: string; verdict: string;
    owner: string; noData: string; empty: string;
  };
  dojo: {
    severity: string; title: string; cwe: string; status: string;
    age: string; ai: string; classifyAll: string; collapse: string; grid: string;
    noFindings: string; searchPlaceholder: string;
    today: string; day: string; days1: string; days2: string; weeks: string; months: string; years: string;
    aiDiff: string; close: string;
  };
  results: {
    summary: string; journal: string; actPreview: string;
    downloadAct: string; gatePassed: string; gateFailed: string;
    findings: string; startNew: string;
  };
  history: { title: string; noInstances: string; replay: string; open: string };
  homeMenu: {
    newCheck: string; checkHistory: string; importCheck: string;
    policiesSettings: string;
    importPending: string; back: string;
    freshCheckTitle: string; freshCheckSubtitle: string;
    historyCheckTitle: string; importCheckTitle: string;
    policiesSettingsTitle: string; adminSettingsTitle: string;
  };
}