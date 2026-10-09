const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

// Actual components, deterministic hook runner; fetch/auth/router are explicit test boundaries.
function harness(page, { user = { id: 'synthetic-user', grants: [] }, search = '', fetcher = async () => ({ ok: true, json: async () => ({}) }) } = {}) {
  const cells = [], dependencies = [], refs = [], callbacks = []; let cursor = 0, refCursor = 0, effectCursor = 0, callbackCursor = 0;
  let pending = [], tree;
  const hooks = { ...React,
    useState: initial => { const i = cursor++; if (!(i in cells)) cells[i] = typeof initial === 'function' ? initial() : initial; return [cells[i], value => { cells[i] = typeof value === 'function' ? value(cells[i]) : value; }]; },
    useRef: value => { const i = refCursor++; return refs[i] ||= { current: value }; },
    useCallback: (callback,deps) => {const i=callbackCursor++;if(!callbacks[i]||deps.some((d,j)=>d!==callbacks[i].deps[j]))callbacks[i]={callback,deps};return callbacks[i].callback;},
    useEffect: (callback, deps) => { const i = effectCursor++; if (!dependencies[i] || deps.some((d,j) => d !== dependencies[i][j])) { dependencies[i] = deps; pending.push(callback); } },
  };
  const params = new URLSearchParams(search);
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const source = fs.readFileSync(file,'utf8').replaceAll('import.meta.env','__env');
    const exports = {}; cache.set(file,exports);
    const compiled = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},fileName:file}).outputText;
    vm.runInNewContext(compiled,{exports,__env:{DEV:true},console,URLSearchParams,Intl,Date,AbortController,fetch:fetcher,
      window:{location:{search,origin:'https://synthetic.test'},confirm:()=>true},
      require: name => {
        if(name==='react') return hooks;
        if(name==='react-router-dom') return { useNavigate:()=>()=>{},useSearchParams:()=>[params,next=>{ for(const k of [...params.keys()])params.delete(k); for(const [k,v]of next)params.set(k,v); }] };
        if(name.endsWith('AuthContext')) return {useAuth:()=>({user,login:()=>{}})};
        if(name.startsWith('.')) { let target=path.resolve(path.dirname(file),name); for(const ext of ['.ts','.tsx'])if(fs.existsSync(target+ext))return load(target+ext); }
        return require(name);
      },
    },{filename:file}); return exports;
  }
  const Component=load(path.join(__dirname,'../src/pages',page+'Page.tsx'))[page+'Page'];
  function render(){cursor=0;refCursor=0;effectCursor=0;callbackCursor=0;tree=Component();return tree;}
  async function flush(){ for(let i=0;i<5;i++){render(); const batch=pending;pending=[];batch.forEach(fn=>fn());await new Promise(resolve=>setImmediate(resolve));} render(); }
  function nodes(node,out=[]){if(arguments.length===0)node=tree;if(Array.isArray(node))node.forEach(n=>nodes(n,out));else if(node&&typeof node==='object'){out.push(node);nodes(node.props?.children,out);}return out;}
  return {render,flush,nodes,setQuery:search=>{for(const k of [...params.keys()])params.delete(k);for(const [k,v]of new URLSearchParams(search))params.set(k,v);},html:()=>renderToStaticMarkup(tree)};
}
const response = (data, status=200)=>({ok:status===200,status,json:async()=>data});
test('A/D: comment is disabled; no fabricated center or fee/contract acknowledgment',async()=>{
  const t=harness('Timeline',{user:null,search:'?preview=true'});await t.flush();
  assert.match(t.html(),/合成預覽不提供留言保存/); assert.doesNotMatch(t.html(),/合格|平穩|完食|作息規律|已送出/);
  const button=t.nodes().find(n=>n.type==='button'&&n.props.children==='預覽不可保存');assert.equal(button.props.disabled,true);
  for(const page of ['Billing','Contract']){
    const h=harness(page,{user:{grants:[{childId:'B'}]},fetcher:async()=>response(page==='Billing'?{total_amount:0,base_amount:0,overtime_amount:0,lines:[],evidence_summary:{},status:'BLOCKED',period:'2026-10',blocking_reasons:[]}:{content_hash:'synthetic-hash',version_no:1,base_monthly_amount:18000,overtime_unit_price:98,overtime_unit_minutes:30,effective_from:'2026-10-01T00:00:00+08:00',effective_to:'2027-10-01T00:00:00+08:00'})});await h.flush();
    assert.doesNotMatch(h.html(),/已簽署|電子簽章|確認本月費用版本紀錄|確認契約版本紀錄/);
    assert.equal(h.nodes().filter(n=>n.type==='button'&&String(n.props.onClick).includes('setConfirmed')).length,0);
  }
});
test('E: preview derives 150ml / 85m / 36.5°C from the displayed event dataset',async()=>{
  const h=harness('Timeline',{user:null,search:'?preview=true'});await h.flush();assert.match(h.html(),/150ml/);assert.match(h.html(),/85m/);assert.match(h.html(),/36.5°C/);
});
test('F: Handoff 500 and 401 show failure, never empty or normal stock',async()=>{
  for(const status of [500,401]){const h=harness('Handoff',{user:{grants:[{childId:'B',childAlias:'合成 B',role:'CAREGIVER'}]},search:'?child_id=B',fetcher:async()=>response({},status)});await h.flush();assert.match(h.html(),status===401?/請重新登入/:/載入失敗/);assert.doesNotMatch(h.html(),/備品充足|沒有待辦|已完成|精神極佳/);}
});
test('F: all main pages surface 500 and 401 without normal or empty claims',async()=>{
  for(const page of ['Timeline','Calendar','Children','Reports','NewEntry','Billing','Contract'])for(const status of [500,401]){
    const h=harness(page,{search:'?child_id=B',user:{id:'synthetic',grants:[{childId:'B',role:'CAREGIVER',scopes:['CARE_READ']}]},fetcher:async()=>response({},status)});await h.flush();
    assert.match(h.html(),status===401?/請重新登入/:/失敗|無法/);assert.doesNotMatch(h.html(),/備品充足|沒有待辦|一切正常|尚無費用結算|尚無契約/);
  }
});
test('C: query B routes list/confirm/receive to B resources',async()=>{
  const calls=[];
  const user={id:'C',grants:[{id:'a',childId:'A',childAlias:'合成 A',role:'CAREGIVER'},{id:'b',childId:'B',childAlias:'合成 B',role:'CAREGIVER'}]};
  const h=harness('Handoff',{user,search:'?child_id=B',fetcher:async(url,options={})=>{calls.push({url,options});return response(url.includes('/drafts?')?[{id:'draft-B',child_id:'B',item_name:'尿布',status:'PENDING_CONFIRMATION'}]:url.includes('?child_id=')?[{id:'task-B',child_id:'B',item_name:'尿布',status:'PACKED'}]:{});}});await h.flush();
  assert.ok(calls.every(c=>c.url.endsWith('child_id=B')));assert.match(h.html(),/合成 B/);
  const confirm=h.nodes().find(n=>n.type==='button'&&String(n.props.onClick).includes('handleConfirmDraft'));assert.ok(confirm);await confirm.props.onClick();await h.flush();
  const receive=h.nodes().find(n=>n.type==='button'&&String(n.props.onClick).includes('handleReceive'));assert.ok(receive);await receive.props.onClick();
  assert.ok(calls.some(c=>c.url.includes('draft-B/confirm')));assert.ok(calls.some(c=>c.url.includes('task-B/receive')));assert.ok(!calls.some(c=>c.url.includes('task-A')||c.url.includes('draft-A')));
});
test('C: create and pack use selected B, despite A being the first grant',async()=>{
  for (const role of ['CAREGIVER','GUARDIAN']) {
    const calls=[];
    const h=harness('Handoff',{search:'?child_id=B',user:{id:'synthetic',grants:[{id:'A',childId:'A',childAlias:'A',role},{id:'B',childId:'B',childAlias:'B',role}]},fetcher:async(url,options={})=>{
      calls.push({url,options}); return response(url.includes('/drafts?')?[]:url.includes('?child_id=')?[{id:'B-task',item_name:'尿布',status:'PENDING'}]:{});
    }});
    await h.flush();
    if(role==='CAREGIVER') {
      h.nodes().find(n=>n.type==='button'&&String(n.props.onClick).includes('setShowForm')).props.onClick();h.render();
      await h.nodes().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
      const create=calls.find(c=>c.url==='/api/supply-reminders');assert.ok(create);assert.equal(JSON.parse(create.options.body).child_id,'B');
    } else {
      const pack=h.nodes().find(n=>n.type==='button'&&String(n.props.onClick).includes('handlePack'));assert.ok(pack);await pack.props.onClick();assert.ok(calls.some(c=>c.url==='/api/supply-reminders/B-task/pack'));
    }
    assert.ok(!calls.some(c=>c.url.includes('child_id=A')));
  }
});
test('E: empty and feed-only confirmed summaries never invent sleep, meal, or health judgments',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../src/lib/confirmed-summary.ts'),'utf8');
  const exports={};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports});
  const empty=exports.confirmedSummary([],'2026-10-08');assert.equal(empty.total_records,0);assert.equal(empty.total_sleep_minutes,0);assert.equal(empty.latest_temperature,null);
  const feed=exports.confirmedSummary([{event_type:'FEED',status:'RECORDED',temporal_status:'ACTUAL',occurred_at:'2026-10-08T10:00:00+08:00',payload:{amount_ml:150}}],'2026-10-08');
  assert.equal(feed.total_feed_amount_ml,150);assert.equal(feed.total_sleep_minutes,0);assert.equal(feed.latest_temperature,null);assert.equal(Object.hasOwn(feed,'health_judgment'),false);
});
test('B: valid invitation token survives LIFF callback URL consumption; invalid values are not stored',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../src/lib/invitation-token.ts'),'utf8');const exports={};
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,URLSearchParams});
  const saved=new Map(); const storage={setItem:(k,v)=>saved.set(k,v)}; const token='a'.repeat(64);
  exports.rememberInvitationToken('?token='+token,storage); exports.rememberInvitationToken('?code=synthetic-callback',storage);
  assert.equal(saved.get(exports.INVITATION_TOKEN_KEY),token);exports.rememberInvitationToken('?token=malformed',storage);assert.equal(saved.size,1);
});
test('C: delayed A JSON cannot overwrite B after switching children',async()=>{
  let finishA;const delayedA=new Promise(resolve=>{finishA=resolve;});
  const h=harness('Handoff',{search:'?child_id=A',user:{grants:[{id:'A',childId:'A',childAlias:'合成 A',role:'CAREGIVER'},{id:'B',childId:'B',childAlias:'合成 B',role:'CAREGIVER'}]},fetcher:async url=>({ok:true,status:200,json:()=>url.includes('child_id=A')?delayedA:Promise.resolve(url.includes('/drafts?')?[]:[{id:'B-only',item_name:'B用品',status:'PACKED'}])})});
  await h.flush();
  h.setQuery('?child_id=B');await h.flush();
  assert.match(h.html(),/B用品/);
  finishA([{id:'A-only',item_name:'A用品',status:'PACKED'}]);await h.flush();
  assert.match(h.html(),/B用品/);assert.doesNotMatch(h.html(),/A用品/);
});
test('A: comment clears only after server success and caregiver reload reads the saved response; failure retains text',async()=>{
  const table=[];
  function make(role='GUARDIAN',fail=false){const actor=role==='GUARDIAN'?'G':'C';
    const grants=[{childId:'B',childAlias:'合成 B',role,scopes:['CARE_READ']}];
    return harness('Timeline',{search:'?child_id=B',user:{id:actor,grants},fetcher:async(url,options={})=>{
      if(url==='/api/me')return response({grants});
      if(url.includes('/timeline?'))return response({items:[]});
      if(url.includes('/summary?'))return response({});
      if(url.endsWith('/daily-log-views'))return response({viewed:true});
      if(url.endsWith('/instructions')){
        if(options.method==='POST'){
          if(fail)return response({},500);
          const body=JSON.parse(options.body);const saved={id:'synthetic-comment',child_id:'B',author_user_id:'G',created_at:'2026-10-08T10:00:00Z',instruction_type:body.instruction_type,content:body.content};table.push(saved);return response(saved);
        }
        return response(table.slice());
      }
      throw new Error('Unexpected request '+url);
    }});
  }
  const failed=make('GUARDIAN',true);await failed.flush();
  failed.nodes().find(n=>n.type==='textarea').props.onChange({target:{value:'合成留言原文'}});failed.render();
  await failed.nodes().find(n=>n.type==='button'&&n.props.children==='保存留言').props.onClick();failed.render();
  assert.equal(failed.nodes().find(n=>n.type==='textarea').props.value,'合成留言原文');assert.match(failed.html(),/原文已保留/);assert.doesNotMatch(failed.html(),/已保存留言/);
  const parent=make();await parent.flush();parent.nodes().find(n=>n.type==='textarea').props.onChange({target:{value:'合成留言原文'}});parent.render();
  await parent.nodes().find(n=>n.type==='button'&&n.props.children==='保存留言').props.onClick();parent.render();
  assert.equal(parent.nodes().find(n=>n.type==='textarea').props.value,'');assert.match(parent.html(),/已保存留言/);assert.equal(table.length,1);
  parent.nodes().find(n=>n.type==='textarea').props.onChange({target:{value:'下一則尚未保存的文字'}});parent.render();assert.doesNotMatch(parent.html(),/已保存留言/);
  const caregiver=make('CAREGIVER');await caregiver.flush();assert.match(caregiver.html(),/合成留言原文/);assert.equal(caregiver.nodes().find(n=>n.type==='button'&&n.props.children==='保存留言').props.disabled,true);
});
