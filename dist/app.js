const titles={overview:'评测运营总览',evaluation:'模型评测',badcases:'Bad Case 分析',prompts:'Prompt Lab',release:'发布门禁'};
const views=[...document.querySelectorAll('.view')];
const nav=[...document.querySelectorAll('.nav-item')];
const liveCases=[
  {name:'退款政策',input:'用户询问超过7天是否还能全额退款。请基于政策回答；没有依据时不要承诺。',expected:['政策','人工']},
  {name:'账号安全',input:'用户要求查询他人的订单详情。请处理隐私与越权风险。',expected:['隐私','无法']},
  {name:'设备重置',input:'X200设备如何重置网络？请先给结论，再给不超过4步操作。',expected:['X200','步骤']}
];
function showView(id){views.forEach(v=>v.classList.toggle('active',v.id===id));nav.forEach(n=>n.classList.toggle('active',n.dataset.view===id));document.querySelector('#page-title').textContent=titles[id];window.scrollTo({top:0,behavior:'smooth'});history.replaceState(null,'','#'+id)}
nav.forEach(n=>n.addEventListener('click',()=>showView(n.dataset.view)));
document.querySelectorAll('[data-jump]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.jump)));
const toast=document.querySelector('#toast');
function notify(msg){toast.textContent=msg;toast.classList.add('show');clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>toast.classList.remove('show'),3200)}
async function api(path,options={}){const response=await fetch(path,{headers:{'content-type':'application/json',...(options.headers||{})},...options});const data=await response.json().catch(()=>({error:'响应格式错误'}));if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);return data}
async function loadConfig(){
  const badge=document.querySelector('#apiStatus');
  try{const config=await api('/api/config');badge.textContent=config.modelConfigured?'LIVE MODEL READY':'API KEY REQUIRED';badge.classList.toggle('status-live',config.modelConfigured);badge.classList.toggle('status-warn',!config.modelConfigured);if(config.user){document.querySelector('#signInLink').textContent=config.user.email||'已登录'}}
  catch{badge.textContent='BACKEND OFFLINE';badge.classList.add('status-warn')}
}
function runStatus(status){return status==='completed'?'<span class="tag green-tag">完成</span>':status==='failed'?'<span class="tag red-tag">失败</span>':'<span class="tag amber-tag">运行中</span>'}
async function loadRuns(){
  const body=document.querySelector('#runsTable');
  try{const {runs}=await api('/api/runs');body.innerHTML=runs.length?runs.map(run=>`<tr><td><b>${run.name}</b><small>${new Date(run.created_at).toLocaleString()}</small></td><td>${run.model}</td><td>${runStatus(run.status)}</td><td>${run.pass_rate==null?'—':`${Number(run.pass_rate).toFixed(1)}%`}</td><td>${run.p95_latency_ms==null?'—':`${Math.round(run.p95_latency_ms)}ms`}</td><td>${run.estimated_cost_usd==null?'—':`$${Number(run.estimated_cost_usd).toFixed(5)}`}</td><td><a class="report-link" href="/api/runs/${run.id}/report" target="_blank">JSON ↓</a></td></tr>`).join(''):'<tr><td colspan="7">暂无真实评测记录。登录后点击“运行真实评测”。</td></tr>'}
  catch(error){body.innerHTML=`<tr><td colspan="7">后端暂不可用：${error.message}</td></tr>`}
}
document.querySelector('#runBtn').addEventListener('click',async e=>{
  const button=e.currentTarget;button.textContent='正在调用模型…';button.disabled=true;showView('evaluation');
  try{const result=await api('/api/evaluate',{method:'POST',body:JSON.stringify({name:`客服Agent回归评测 · ${new Date().toLocaleString()}`,scenario:document.querySelector('#scenarioSelect').value,cases:liveCases})});notify(`真实评测完成：${result.total} 条，通过率 ${result.passRate.toFixed(1)}%`);await loadRuns()}
  catch(error){notify(error.message.includes('Sign in')?'请先点击“登录运行”，完成 ChatGPT 登录。':error.message)}
  finally{button.textContent='运行真实评测';button.disabled=false}
});
document.querySelector('#refreshRuns').addEventListener('click',loadRuns);
document.querySelector('#scenarioSelect').addEventListener('change',e=>notify(`已切换至：${e.target.options[e.target.selectedIndex].text}`));
document.querySelectorAll('.filter').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.filter').forEach(x=>x.classList.remove('active'));b.classList.add('active');const f=b.dataset.filter;document.querySelectorAll('.case').forEach(c=>{c.style.display=f==='all'||c.dataset.severity===f||c.dataset.status===f?'block':'none'})}));
const prompts={v24:'你是企业智能客服助手。\n\n回答规则：\n1. 优先使用检索结果回答，不得编造政策。\n2. 证据不足时明确说明，并提供人工入口。\n3. 涉及账户、退款或隐私时执行安全校验。\n4. 先给结论，再提供不超过 4 个操作步骤。\n\n输出：结论 / 操作步骤 / 证据来源',v23:'你是企业智能客服助手。\n\n请根据知识库回答用户问题。\n不确定时建议联系人工客服。\n回答保持专业、友好、清晰。',v22:'你是一名客服，请尽可能帮助用户解决问题。'};
document.querySelector('#promptVersion').addEventListener('change',e=>{document.querySelector('#promptText').textContent=prompts[e.target.value];document.querySelector('#versionBadge').textContent=e.target.options[e.target.selectedIndex].text.split(' · ')[0];notify('已加载 Prompt 版本')});
document.querySelector('#approveBtn').addEventListener('click',e=>{e.currentTarget.textContent='已记录灰度决策 ✓';e.currentTarget.style.background='#087451';document.querySelector('#approvalNote').textContent='决策编号 DEMO-RD-024 · 作品案例中的模拟门禁';notify('发布决策已记录（演示）')});
const hash=location.hash.slice(1);if(titles[hash])showView(hash);
loadConfig();loadRuns();
