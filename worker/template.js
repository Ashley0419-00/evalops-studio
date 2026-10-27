const ASSETS=__ASSETS__;
const SYSTEM_PROMPT=`你是企业智能客服助手。只根据可确认的信息回答，不得编造政策。证据不足时明确说明并建议人工处理。涉及隐私或越权请求时拒绝。先给结论，再给不超过4个步骤。`;
const cors={'content-type':'application/json; charset=utf-8','cache-control':'no-store'};
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data,null,2),{status,headers:{...cors,...headers}});
const uid=()=>crypto.randomUUID();
let schemaReady;
async function ensureSchema(db){
  schemaReady ||= db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY,email TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS evaluation_runs (id TEXT PRIMARY KEY,user_id TEXT,name TEXT NOT NULL,scenario TEXT NOT NULL,model TEXT NOT NULL,status TEXT NOT NULL,total_cases INTEGER NOT NULL DEFAULT 0,passed_cases INTEGER NOT NULL DEFAULT 0,pass_rate REAL,p95_latency_ms REAL,input_tokens INTEGER NOT NULL DEFAULT 0,output_tokens INTEGER NOT NULL DEFAULT 0,estimated_cost_usd REAL NOT NULL DEFAULT 0,error_message TEXT,is_demo INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,completed_at TEXT)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS evaluation_cases (id TEXT PRIMARY KEY,run_id TEXT NOT NULL,case_name TEXT NOT NULL,input_text TEXT NOT NULL,output_text TEXT,expected_json TEXT NOT NULL,matched_json TEXT,passed INTEGER NOT NULL DEFAULT 0,score REAL NOT NULL DEFAULT 0,latency_ms REAL,input_tokens INTEGER NOT NULL DEFAULT 0,output_tokens INTEGER NOT NULL DEFAULT 0,error_message TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS request_metrics (id INTEGER PRIMARY KEY AUTOINCREMENT,path TEXT NOT NULL,method TEXT NOT NULL,status_code INTEGER NOT NULL,duration_ms REAL NOT NULL,user_id TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_runs_created ON evaluation_runs(created_at DESC)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_cases_run ON evaluation_cases(run_id)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_metrics_created ON request_metrics(created_at DESC)`)
  ]).catch(error=>{schemaReady=undefined;throw error});
  return schemaReady;
}
function userFrom(request){const id=request.headers.get('oai-authenticated-user-id');if(!id)return null;return{id,email:request.headers.get('oai-authenticated-user-email')||''}}
function requireDb(env){if(!env.DB)throw Object.assign(new Error('Database binding is not configured.'),{status:503})}
async function saveUser(db,user){await db.prepare(`INSERT INTO users(id,email) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,last_seen_at=CURRENT_TIMESTAMP`).bind(user.id,user.email).run()}
function outputText(payload){if(payload.output_text)return payload.output_text;return(payload.output||[]).flatMap(item=>item.content||[]).filter(item=>item.type==='output_text').map(item=>item.text).join('\n')}
async function callModel(env,input){
  if(!env.OPENAI_API_KEY)throw Object.assign(new Error('模型密钥尚未配置。请通过站点的加密环境变量连接 OpenAI API。'),{status:503});
  const started=Date.now();
  const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{authorization:`Bearer ${env.OPENAI_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({model:env.OPENAI_MODEL||'gpt-4.1-mini',instructions:SYSTEM_PROMPT,input,temperature:0.1,max_output_tokens:500})});
  const payload=await response.json();
  if(!response.ok)throw Object.assign(new Error(payload?.error?.message||`Model API ${response.status}`),{status:502});
  return{text:outputText(payload),latency:Date.now()-started,inputTokens:Number(payload.usage?.input_tokens||0),outputTokens:Number(payload.usage?.output_tokens||0),responseId:payload.id};
}
function assess(text,expected){const lower=text.toLowerCase();const matched=expected.filter(term=>lower.includes(String(term).toLowerCase()));const score=expected.length?matched.length/expected.length:1;return{matched,score,passed:score>=0.5}}
function percentile(values,p){if(!values.length)return 0;const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*p)-1)]}
async function listRuns(env){requireDb(env);await ensureSchema(env.DB);const result=await env.DB.prepare(`SELECT id,name,scenario,model,status,total_cases,passed_cases,pass_rate,p95_latency_ms,input_tokens,output_tokens,estimated_cost_usd,is_demo,created_at,completed_at FROM evaluation_runs ORDER BY created_at DESC LIMIT 50`).all();return json({runs:result.results||[]})}
async function evaluate(request,env){
  requireDb(env);await ensureSchema(env.DB);const user=userFrom(request);if(!user)return json({error:'Sign in required to run a real evaluation.'},401);
  await saveUser(env.DB,user);const body=await request.json();const cases=Array.isArray(body.cases)?body.cases.slice(0,20):[];
  if(!cases.length)return json({error:'At least one evaluation case is required.'},400);
  const runId=uid(),model=env.OPENAI_MODEL||'gpt-4.1-mini',name=String(body.name||'Untitled evaluation').slice(0,160),scenario=String(body.scenario||'general').slice(0,80);
  await env.DB.prepare(`INSERT INTO evaluation_runs(id,user_id,name,scenario,model,status,total_cases) VALUES(?,?,?,?,?,'running',?)`).bind(runId,user.id,name,scenario,model,cases.length).run();
  const results=[];
  try{
    for(const item of cases){
      const expected=Array.isArray(item.expected)?item.expected.map(String).slice(0,20):[];const called=await callModel(env,String(item.input||'').slice(0,12000));const judged=assess(called.text,expected);const result={id:uid(),name:String(item.name||'Case').slice(0,120),input:String(item.input||'').slice(0,12000),expected,...called,...judged};results.push(result);
      await env.DB.prepare(`INSERT INTO evaluation_cases(id,run_id,case_name,input_text,output_text,expected_json,matched_json,passed,score,latency_ms,input_tokens,output_tokens) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(result.id,runId,result.name,result.input,result.text,JSON.stringify(expected),JSON.stringify(judged.matched),judged.passed?1:0,judged.score,called.latency,called.inputTokens,called.outputTokens).run();
    }
    const passed=results.filter(r=>r.passed).length,inputTokens=results.reduce((n,r)=>n+r.inputTokens,0),outputTokens=results.reduce((n,r)=>n+r.outputTokens,0),p95=percentile(results.map(r=>r.latency),.95),inputRate=Number(env.OPENAI_INPUT_USD_PER_MILLION||0.4),outputRate=Number(env.OPENAI_OUTPUT_USD_PER_MILLION||1.6),cost=inputTokens/1e6*inputRate+outputTokens/1e6*outputRate,passRate=passed/results.length*100;
    await env.DB.prepare(`UPDATE evaluation_runs SET status='completed',passed_cases=?,pass_rate=?,p95_latency_ms=?,input_tokens=?,output_tokens=?,estimated_cost_usd=?,completed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(passed,passRate,p95,inputTokens,outputTokens,cost,runId).run();
    return json({id:runId,status:'completed',total:results.length,passed,passRate,p95LatencyMs:p95,inputTokens,outputTokens,estimatedCostUsd:cost});
  }catch(error){await env.DB.prepare(`UPDATE evaluation_runs SET status='failed',error_message=?,completed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(String(error.message).slice(0,500),runId).run();throw error}
}
async function report(env,id){requireDb(env);await ensureSchema(env.DB);const run=await env.DB.prepare(`SELECT * FROM evaluation_runs WHERE id=?`).bind(id).first();if(!run)return json({error:'Run not found'},404);const cases=await env.DB.prepare(`SELECT id,case_name,input_text,output_text,expected_json,matched_json,passed,score,latency_ms,input_tokens,output_tokens,error_message FROM evaluation_cases WHERE run_id=? ORDER BY created_at`).bind(id).all();return json({schemaVersion:'1.0',generatedAt:new Date().toISOString(),run,cases:cases.results||[]},200,{'content-disposition':`attachment; filename="eval-report-${id}.json"`})}
async function metrics(env){requireDb(env);await ensureSchema(env.DB);const rows=await env.DB.prepare(`SELECT substr(created_at,1,13) AS hour,COUNT(*) AS requests,ROUND(AVG(duration_ms),1) AS avg_latency_ms,SUM(CASE WHEN status_code>=500 THEN 1 ELSE 0 END) AS server_errors FROM request_metrics WHERE created_at>=datetime('now','-24 hours') GROUP BY hour ORDER BY hour`).all();return json({window:'24h',series:rows.results||[]})}
async function route(request,env){
  const url=new URL(request.url),path=url.pathname;
  if(path==='/api/health')return json({ok:true,service:'evalops-api',databaseConfigured:Boolean(env.DB),modelConfigured:Boolean(env.OPENAI_API_KEY),timestamp:new Date().toISOString()});
  if(path==='/api/config')return json({databaseConfigured:Boolean(env.DB),modelConfigured:Boolean(env.OPENAI_API_KEY),model:env.OPENAI_MODEL||'gpt-4.1-mini',user:userFrom(request)});
  if(path==='/api/runs'&&request.method==='GET')return listRuns(env);
  if(path==='/api/evaluate'&&request.method==='POST')return evaluate(request,env);
  if(path==='/api/metrics'&&request.method==='GET')return metrics(env);
  const match=path.match(/^\/api\/runs\/([^/]+)\/report$/);if(match&&request.method==='GET')return report(env,decodeURIComponent(match[1]));
  if(path.startsWith('/api/'))return json({error:'Not found'},404);
  const asset=ASSETS[path]||ASSETS['/'];return new Response(asset.body,{headers:{'content-type':asset.type,'cache-control':path==='/'?'no-cache':'public, max-age=300','x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin','content-security-policy':"default-src 'self'; connect-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'self' https://chatgpt.com"}});
}
export default{async fetch(request,env,ctx){const started=Date.now(),user=userFrom(request),database=Object.values(env).find(value=>value&&typeof value.prepare==='function'),runtime={...env,DB:database};let response;try{response=await route(request,runtime)}catch(error){response=json({error:error.message||'Internal server error'},error.status||500)}if(runtime.DB){ctx.waitUntil(ensureSchema(runtime.DB).then(()=>runtime.DB.prepare(`INSERT INTO request_metrics(path,method,status_code,duration_ms,user_id) VALUES(?,?,?,?,?)`).bind(new URL(request.url).pathname,request.method,response.status,Date.now()-started,user?.id||null).run()).catch(()=>{}))}return response}};
