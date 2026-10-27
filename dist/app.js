const titles={overview:'评测运营总览',evaluation:'模型评测',badcases:'Bad Case 分析',prompts:'Prompt Lab',release:'发布门禁'};
const views=[...document.querySelectorAll('.view')];
const nav=[...document.querySelectorAll('.nav-item')];
function showView(id){views.forEach(v=>v.classList.toggle('active',v.id===id));nav.forEach(n=>n.classList.toggle('active',n.dataset.view===id));document.querySelector('#page-title').textContent=titles[id];window.scrollTo({top:0,behavior:'smooth'});history.replaceState(null,'','#'+id)}
nav.forEach(n=>n.addEventListener('click',()=>showView(n.dataset.view)));
document.querySelectorAll('[data-jump]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.jump)));
const toast=document.querySelector('#toast');function notify(msg){toast.textContent=msg;toast.classList.add('show');clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>toast.classList.remove('show'),2400)}
document.querySelector('#runBtn').addEventListener('click',e=>{e.currentTarget.textContent='评测运行中…';e.currentTarget.disabled=true;setTimeout(()=>{e.currentTarget.textContent='运行评测';e.currentTarget.disabled=false;notify('演示评测完成：1,000 条样本，126 条需复核')},1200)});
document.querySelector('#scenarioSelect').addEventListener('change',e=>notify(`已切换至：${e.target.options[e.target.selectedIndex].text}（演示视图）`));
document.querySelectorAll('.filter').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.filter').forEach(x=>x.classList.remove('active'));b.classList.add('active');const f=b.dataset.filter;document.querySelectorAll('.case').forEach(c=>{c.style.display=f==='all'||c.dataset.severity===f||c.dataset.status===f?'block':'none'})}));
const prompts={v24:'你是企业智能客服助手。\n\n回答规则：\n1. 优先使用检索结果回答，不得编造政策。\n2. 证据不足时明确说明，并提供人工入口。\n3. 涉及账户、退款或隐私时执行安全校验。\n4. 先给结论，再提供不超过 4 个操作步骤。\n\n输出：结论 / 操作步骤 / 证据来源',v23:'你是企业智能客服助手。\n\n请根据知识库回答用户问题。\n不确定时建议联系人工客服。\n回答保持专业、友好、清晰。',v22:'你是一名客服，请尽可能帮助用户解决问题。'};
document.querySelector('#promptVersion').addEventListener('change',e=>{document.querySelector('#promptText').textContent=prompts[e.target.value];document.querySelector('#versionBadge').textContent=e.target.options[e.target.selectedIndex].text.split(' · ')[0];notify('已加载 Prompt 版本')});
document.querySelector('#approveBtn').addEventListener('click',e=>{e.currentTarget.textContent='已记录灰度决策 ✓';e.currentTarget.style.background='#087451';document.querySelector('#approvalNote').textContent='决策编号 DEMO-RD-024 · 仅保存在当前页面';notify('发布决策已记录（演示）')});
const hash=location.hash.slice(1);if(titles[hash])showView(hash);
