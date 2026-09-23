export const ACTION_KINDS = ["Click","Type","Open","Wait","Hover","Select","PressKey","Wheel","Scroll","Drag","Focus","Crawl","ActiveScan","Check","scannerReport","FuzzWave","Mutate","Intruder","Let","Secret","GenerateEmail","GeneratePhone"] as const;
export type ActionKind = typeof ACTION_KINDS[number];
export const STRATEGY_KINDS = ["role","label","css","test_id","text","xpath"] as const;
export type StrategyKind = typeof STRATEGY_KINDS[number];
export type StepLedState = "queued"|"running"|"success"|"warning"|"failure"|"predicted";
/** WIRE-SYNC-F1: метаданные DSL-блока для карточки шага. */
export type StepBlockKind = 'recover' | 'soft' | 'try';
export interface StepBlockMeta { kind: StepBlockKind; title?: string; }
export interface ScenarioStepModel {
  id:string; action:ActionKind; strategy:StrategyKind; strategyValue:string; payload:string;
  continueOnError:boolean; led:StepLedState; debugResult?:"ok"|"fail"|null;
  /** WIRE-SYNC-F1: номер строки в конструкторе (1-based), для deep-link в Monaco. */
  dslLine?: number;
  /** WIRE-SYNC-F1: бейджи DSL-блоков, вычисляется из конструктора. */
  blockMeta?: StepBlockMeta[];
  /** WIRE-SYNC-F1: шаги внутри recover-блока (>@ { }). null = не recover. */
  recoverSteps?: ScenarioStepModel[];
}
export function emptyStep(id:string):ScenarioStepModel { return {id,action:"Open",strategy:"css",strategyValue:"",payload:"",continueOnError:false,led:"queued",debugResult:null}; }
// Канонические цвета действия (CDP-WIRE POC-CDP-4):
//   Click = циан (#22d3ee), Type = синий (#3b82f6), Wait = фиолетовый (#a855f7).
// Остальные — по семантическим группам, не трогаются PoC-скопом.
const AC:Record<string,string>={Click:"#22d3ee",Type:"#3b82f6",Open:"#38bdf8",Wait:"#a855f7",Hover:"#22d3ee",Select:"#22d3ee",PressKey:"#22d3ee",Wheel:"#a855f7",Scroll:"#a855f7",Drag:"#f59e0b",Focus:"#22d3ee",Crawl:"#a855f7",ActiveScan:"#a855f7",Check:"#a855f7",scannerReport:"#a855f7",FuzzWave:"#f59e0b",Mutate:"#f59e0b",Intruder:"#f59e0b",Let:"#10b981",Secret:"#10b981",GenerateEmail:"#10b981",GeneratePhone:"#10b981"};
export function actionColor(k:ActionKind):string{return AC[k]??"#475569";}
export function actionLabel(k:ActionKind):string{const l:Record<string,string>={GenerateEmail:"Gen Email",GeneratePhone:"Gen Phone",ActiveScan:"Active Scan",scannerReport:"scanner Report",FuzzWave:"Fuzz Wave"};return l[k]??k;}
export function stepToDSL(s:ScenarioStepModel):string{const a=s.action;const sv=s.strategyValue;const p=s.payload;if(a==="Open")return`Open ${p||"about:blank"}`;if(a==="Wait")return`Wait ${p||"1000"}`;if(a==="Wheel")return`Wheel ${p||"0 0"}`;if(a==="Scroll")return`Scroll ${p||"0 0"}`;if(a==="Drag")return`Drag ${p||"0 0 0 0"}`;if(a==="Focus")return`Focus ${s.strategy} "${sv}"`;if(a==="Crawl")return"crawl";if(a==="ActiveScan")return"ActiveScan";if(a==="FuzzWave")return`FuzzWave ${p||"corpus"}`;if(a==="Let")return`Let ${sv||"var"} = ${p||'""'}`;if(a==="Secret")return`Secret ${sv||"key"} ${p||'""'}`;if(a==="GenerateEmail")return"GenerateEmail";if(a==="GeneratePhone")return"GeneratePhone";return`${a} ${s.strategy} "${sv}" ${p}`.trim();}
export function requiresStrategy(a:ActionKind):boolean{return (["Click","Type","Hover","Select","PressKey"] as string[]).includes(a);}
export function requiresPayload(a:ActionKind):boolean{return (["Open","Wait","FuzzWave","Let","Secret","Click","Type","Hover","Select","PressKey"] as string[]).includes(a);}