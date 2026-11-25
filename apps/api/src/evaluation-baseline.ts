import {RealEvaluationRecord,RealEvaluationOptions} from './rag-evaluation.js';

export interface BaselineMetrics{
  version:string;              // e.g., "pr-71-dfbf776"
  model:string;                // model used for baseline
  timestamp:string;            // ISO 8601
  totalCases:number;
  overallPassRate:number;
  byExpectation:Record<string,{total:number;passed:number;passRate:number}>;
  bySplit:Record<string,{total:number;passed:number;passRate:number}>;
  byTag:Record<string,{total:number;passed:number;passRate:number}>;
  avgLatencyMs:number;
  totalEstimatedCostUsd:number;
  rawRecords:RealEvaluationRecord[];
}

export interface RegressionThresholds{
  overallPassRateDrop:number;           // max allowed drop in overall pass rate (0-1)
  expectationPassRateDrop:number;       // max allowed drop per expectation type
  splitPassRateDrop:number;             // max allowed drop per split
  tagPassRateDrop:number;               // max allowed drop per tag
  latencyIncreaseRatio:number;          // max allowed latency increase (e.g., 1.5 = 50% increase)
  costIncreaseRatio:number;             // max allowed cost increase
}

export const DEFAULT_REGRESSION_THRESHOLDS:RegressionThresholds={
  overallPassRateDrop:0.05,             // 5% absolute drop
  expectationPassRateDrop:0.10,         // 10% absolute drop per expectation
  splitPassRateDrop:0.10,               // 10% absolute drop per split
  tagPassRateDrop:0.15,                 // 15% absolute drop per tag
  latencyIncreaseRatio:2.0,             // 2x latency increase
  costIncreaseRatio:2.0                 // 2x cost increase
};

export interface RegressionReport{
  baselineVersion:string;
  currentVersion:string;
  timestamp:string;
  passed:boolean;
  regressions:RegressionDetail[];
  improvements:ImprovementDetail[];
  summary:{
    overallPassRateChange:number;
    expectationsWithRegression:number;
    splitsWithRegression:number;
    tagsWithRegression:number;
    latencyChangeRatio:number;
    costChangeRatio:number;
  };
}

export interface RegressionDetail{
  type:'overall'|'expectation'|'split'|'tag'|'latency'|'cost';
  key:string;                          // expectation name, split name, tag name, or 'overall'
  baselineValue:number;
  currentValue:number;
  change:number;                       // current - baseline (negative for pass rate drops)
  threshold:number;
  severity:'warning'|'critical';
}

export interface ImprovementDetail{
  type:'overall'|'expectation'|'split'|'tag'|'latency'|'cost';
  key:string;
  baselineValue:number;
  currentValue:number;
  change:number;
}

const BASELINE_KEY='evaluation-baseline-pr71';

export function loadBaseline():BaselineMetrics|null{
  try{
    const fs=require('fs');
    const path=require('path');
    const filePath=path.join(process.cwd(),'.evaluation-baseline.json');
    if(!fs.existsSync(filePath))return null;
    const data=fs.readFileSync(filePath,'utf8');
    return JSON.parse(data) as BaselineMetrics;
  }catch{
    return null;
  }
}

export function saveBaseline(baseline:BaselineMetrics):void{
  const fs=require('fs');
  const path=require('path');
  const filePath=path.join(process.cwd(),'.evaluation-baseline.json');
  fs.writeFileSync(filePath,JSON.stringify(baseline,null,2));
}

export interface CurrentSummary{
  overallPassRate:number;
  avgLatencyMs:number;
  totalEstimatedCostUsd:number;
  byExpectation:Record<string,{total:number;passed:number}>;
  bySplit:Record<string,{total:number;passed:number}>;
  byTag:Record<string,{total:number;passed:number}>;
  total:number;
  passed:number;
  failed:number;
  errors:number;
}

export function compareWithBaseline(
  currentRecords:RealEvaluationRecord[],
  currentSummary:CurrentSummary,
  baseline:BaselineMetrics,
  thresholds:RegressionThresholds=DEFAULT_REGRESSION_THRESHOLDS
):RegressionReport{
  const regressions:RegressionDetail[]=[];
  const improvements:ImprovementDetail[]=[];

  // Overall pass rate
  const overallChange=currentSummary.overallPassRate-baseline.overallPassRate;
  if(overallChange< -thresholds.overallPassRateDrop){
    regressions.push({
      type:'overall',key:'overall',
      baselineValue:baseline.overallPassRate,
      currentValue:currentSummary.overallPassRate,
      change:overallChange,
      threshold:thresholds.overallPassRateDrop,
      severity:Math.abs(overallChange)>thresholds.overallPassRateDrop*2?'critical':'warning'
    });
  }else if(overallChange>0){
    improvements.push({type:'overall',key:'overall',baselineValue:baseline.overallPassRate,currentValue:currentSummary.overallPassRate,change:overallChange});
  }

  // Latency
  const latencyRatio=currentSummary.avgLatencyMs/baseline.avgLatencyMs;
  if(latencyRatio>thresholds.latencyIncreaseRatio){
    regressions.push({
      type:'latency',key:'avgLatencyMs',
      baselineValue:baseline.avgLatencyMs,
      currentValue:currentSummary.avgLatencyMs,
      change:latencyRatio-1,
      threshold:thresholds.latencyIncreaseRatio-1,
      severity:latencyRatio>thresholds.latencyIncreaseRatio*2?'critical':'warning'
    });
  }else if(latencyRatio<1){
    improvements.push({type:'latency',key:'avgLatencyMs',baselineValue:baseline.avgLatencyMs,currentValue:currentSummary.avgLatencyMs,change:1-latencyRatio});
  }

  // Cost
  const costRatio=currentSummary.totalEstimatedCostUsd/baseline.totalEstimatedCostUsd;
  if(costRatio>thresholds.costIncreaseRatio){
    regressions.push({
      type:'cost',key:'totalEstimatedCostUsd',
      baselineValue:baseline.totalEstimatedCostUsd,
      currentValue:currentSummary.totalEstimatedCostUsd,
      change:costRatio-1,
      threshold:thresholds.costIncreaseRatio-1,
      severity:costRatio>thresholds.costIncreaseRatio*2?'critical':'warning'
    });
  }else if(costRatio<1){
    improvements.push({type:'cost',key:'totalEstimatedCostUsd',baselineValue:baseline.totalEstimatedCostUsd,currentValue:currentSummary.totalEstimatedCostUsd,change:1-costRatio});
  }

  // By expectation
  for(const [exp,current] of Object.entries(currentSummary.byExpectation)){
    const baselineExp=baseline.byExpectation[exp];
    if(!baselineExp)continue;
    const baselineRate=baselineExp.passed/baselineExp.total;
    const currentRate=current.passed/current.total;
    const change=currentRate-baselineRate;
    if(change< -thresholds.expectationPassRateDrop){
      regressions.push({
        type:'expectation',key:exp,
        baselineValue:baselineRate,
        currentValue:currentRate,
        change,
        threshold:thresholds.expectationPassRateDrop,
        severity:Math.abs(change)>thresholds.expectationPassRateDrop*2?'critical':'warning'
      });
    }else if(change>0){
      improvements.push({type:'expectation',key:exp,baselineValue:baselineRate,currentValue:currentRate,change});
    }
  }

  // By split
  for(const [split,current] of Object.entries(currentSummary.bySplit)){
    const baselineSplit=baseline.bySplit[split];
    if(!baselineSplit)continue;
    const baselineRate=baselineSplit.passed/baselineSplit.total;
    const currentRate=current.passed/current.total;
    const change=currentRate-baselineRate;
    if(change< -thresholds.splitPassRateDrop){
      regressions.push({
        type:'split',key:split,
        baselineValue:baselineRate,
        currentValue:currentRate,
        change,
        threshold:thresholds.splitPassRateDrop,
        severity:Math.abs(change)>thresholds.splitPassRateDrop*2?'critical':'warning'
      });
    }else if(change>0){
      improvements.push({type:'split',key:split,baselineValue:baselineRate,currentValue:currentRate,change});
    }
  }

  // By tag
  for(const [tag,current] of Object.entries(currentSummary.byTag)){
    const baselineTag=baseline.byTag[tag];
    if(!baselineTag)continue;
    const baselineRate=baselineTag.passed/baselineTag.total;
    const currentRate=current.passed/current.total;
    const change=currentRate-baselineRate;
    if(change< -thresholds.tagPassRateDrop){
      regressions.push({
        type:'tag',key:tag,
        baselineValue:baselineRate,
        currentValue:currentRate,
        change,
        threshold:thresholds.tagPassRateDrop,
        severity:Math.abs(change)>thresholds.tagPassRateDrop*2?'critical':'warning'
      });
    }else if(change>0){
      improvements.push({type:'tag',key:tag,baselineValue:baselineRate,currentValue:currentRate,change});
    }
  }

  const passed=regressions.length===0;
  const summary={
    overallPassRateChange:overallChange,
    expectationsWithRegression:regressions.filter(r=>r.type==='expectation').length,
    splitsWithRegression:regressions.filter(r=>r.type==='split').length,
    tagsWithRegression:regressions.filter(r=>r.type==='tag').length,
    latencyChangeRatio:latencyRatio-1,
    costChangeRatio:costRatio-1
  };

  return{
    baselineVersion:baseline.version,
    currentVersion:'current',
    timestamp:new Date().toISOString(),
    passed,
    regressions,
    improvements,
    summary
  };
}

export function generateBaselineFromRecords(
  records:RealEvaluationRecord[],
  summary:{
    overallPassRate:number;
    avgLatencyMs:number;
    totalEstimatedCostUsd:number;
    byExpectation:Record<string,{total:number;passed:number}>;
    bySplit:Record<string,{total:number;passed:number}>;
    byTag:Record<string,{total:number;passed:number}>;
  },
  model:string,
  version:string
):BaselineMetrics{
  const byExpectation:Record<string,{total:number;passed:number;passRate:number}>={};
  for(const [k,v] of Object.entries(summary.byExpectation)){
    byExpectation[k]={...v,passRate:v.passed/v.total};
  }
  const bySplit:Record<string,{total:number;passed:number;passRate:number}>={};
  for(const [k,v] of Object.entries(summary.bySplit)){
    bySplit[k]={...v,passRate:v.passed/v.total};
  }
  const byTag:Record<string,{total:number;passed:number;passRate:number}>={};
  for(const [k,v] of Object.entries(summary.byTag)){
    byTag[k]={...v,passRate:v.passed/v.total};
  }

  return{
    version,
    model,
    timestamp:new Date().toISOString(),
    totalCases:records.length,
    overallPassRate:summary.overallPassRate,
    byExpectation,
    bySplit,
    byTag,
    avgLatencyMs:summary.avgLatencyMs,
    totalEstimatedCostUsd:summary.totalEstimatedCostUsd,
    rawRecords:records
  };
}

export function formatRegressionReport(report:RegressionReport):string{
  const lines:string[]=[
    '=== REGRESSION REPORT ===',
    `Baseline: ${report.baselineVersion}`,
    `Current: ${report.currentVersion}`,
    `Timestamp: ${report.timestamp}`,
    `Status: ${report.passed?'PASSED (no regressions)':'FAILED (regressions detected)'}`,
    '',
    '--- SUMMARY ---',
    `Overall pass rate change: ${(report.summary.overallPassRateChange*100).toFixed(2)}%`,
    `Latency change: ${(report.summary.latencyChangeRatio*100).toFixed(2)}%`,
    `Cost change: ${(report.summary.costChangeRatio*100).toFixed(2)}%`,
    `Expectations with regression: ${report.summary.expectationsWithRegression}`,
    `Splits with regression: ${report.summary.splitsWithRegression}`,
    `Tags with regression: ${report.summary.tagsWithRegression}`,
    ''
  ];

  if(report.regressions.length>0){
    lines.push('--- REGRESSIONS ---');
    for(const r of report.regressions){
      const pct=(r.change*100).toFixed(2);
      lines.push(`  [${r.severity.toUpperCase()}] ${r.type}:${r.key} | baseline=${(r.baselineValue*100).toFixed(2)}% current=${(r.currentValue*100).toFixed(2)}% change=${pct}% threshold=${(r.threshold*100).toFixed(2)}%`);
    }
    lines.push('');
  }

  if(report.improvements.length>0){
    lines.push('--- IMPROVEMENTS ---');
    for(const i of report.improvements){
      const pct=(i.change*100).toFixed(2);
      lines.push(`  [+] ${i.type}:${i.key} | baseline=${(i.baselineValue*100).toFixed(2)}% current=${(i.currentValue*100).toFixed(2)}% change=+${pct}%`);
    }
    lines.push('');
  }

  return lines.join('\n');
}