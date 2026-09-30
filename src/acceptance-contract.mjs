import {parseArgs} from 'node:util';

export const acceptanceScenarios = {
  'full-suite': ['create','followup','repair','denial','patch-create','patch-update','patch-denial','cancel','timeout','recovery'],
  'repair-only': ['repair'],
  'patch-only': ['patch-create','patch-update','patch-denial'],
  'lifecycle-only': ['cancel','timeout','recovery'],
};
const requiredChecks = {
  create:['marker','sum','upstreamDidNotWrite'],
  followup:['marker','sum','product'],
  repair:['testPassed','testUnchanged'],
  denial:['approvalWasDenied','fileAbsent'],
  'patch-create':['exactContent','nativeFileChange','nativeDiff','noCommandExecution','upstreamDidNotWrite'],
  'patch-update':['exactContent','nativeFileChange','nativeDiff','noCommandExecution','upstreamDidNotWrite'],
  'patch-denial':['oneApprovalDenied','fileAbsent','nativeFileChange','noCommandExecution','upstreamDidNotWrite'],
  cancel:['reachedBackend','interrupted','backendReleased','manifestRemoved'],
  timeout:['deadlineReported','backendReleased'],
  recovery:['backendReleased'],
};

export function acceptanceOptions(args, {matrix = false} = {}) {
  const modes = ['repair-only','patch-only','lifecycle-only'];
  const {values,tokens} = parseArgs({args,strict:true,allowPositionals:false,tokens:true,
    options:{live:{type:'boolean'},...Object.fromEntries(modes.map(name=>[name,{type:'boolean'}])),...(matrix?{models:{type:'string'}}:{})}});
  const names=tokens.filter(token=>token.kind==='option').map(token=>token.name);
  if(new Set(names).size!==names.length)throw new Error('Duplicate acceptance option.');
  if(!values.live)throw new Error('Live model use requires --live.');
  const selected=modes.filter(name=>values[name]);
  if(selected.length>1)throw new Error('Choose only one acceptance mode.');
  const models=matrix?(values.models||'').split(','):[];
  if(matrix&&(!models.length||models.some(id=>!/^opencode\/[a-z0-9][a-z0-9.-]*$/.test(id))||new Set(models).size!==models.length))throw new Error('Provide distinct exact model IDs with --models.');
  return {mode:selected[0]||'full-suite',models};
}

export function matrixPassed(rows) {
  return Array.isArray(rows)&&rows.length>0&&rows.every(row=>row.passed===true&&/^[a-f0-9]{64}$/.test(row.sourceSha256||''))&&new Set(rows.map(row=>row.sourceSha256)).size===1;
}

// A successful partial run must never certify a larger acceptance contract.
export function acceptancePassed(receipt, mode) {
  const required=acceptanceScenarios[mode];
  if(!required||receipt?.mode!==mode||receipt.passed!==true||receipt.accessDenial||receipt.sourceChangedDuringRun!==false||!/^[a-f0-9]{64}$/.test(receipt.sourceSha256||''))return false;
  const scenarios=receipt.scenarios;
  if(!Array.isArray(scenarios)||scenarios.some(item=>!item||typeof item!=='object')||scenarios.length!==required.length||new Set(scenarios.map(item=>item.name)).size!==required.length)return false;
  return scenarios.every(item=>required.includes(item.name)&&item.status==='completed'&&item.passed===true&&item.checks&&typeof item.checks==='object'&&!Array.isArray(item.checks)&&requiredChecks[item.name].every(check=>item.checks[check]===true)&&Object.values(item.checks).every(value=>value===true));
}

// A whole tool turn can contain multiple individually bounded model requests.
// Keep the historical default while recording any explicitly chosen budget.
export function acceptanceTurnTimeout(env=process.env){
 const value=Number(env.BRIDGE_ACCEPTANCE_TURN_TIMEOUT_MS??180000);
 if(!Number.isInteger(value)||value<1000||value>900000)throw new Error('Acceptance turn timeout must be 1000..900000 milliseconds.');
 return value;
}
