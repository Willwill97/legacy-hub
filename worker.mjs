import http from 'node:http';
import crypto from 'node:crypto';
import WebSocket from 'ws';

const API_KEY = process.env.TIKTOOL_API_KEY || '';
const HUB_API = process.env.LEGACY_WORKER_API || 'https://hvascsqhwzbacsbdgetu.supabase.co/functions/v1/legacy-tiktok-worker-api';
const HUB_TOKEN = process.env.LEGACY_WORKER_TOKEN || '';
const WORKER_ID = process.env.WORKER_ID || `legacy-${crypto.randomUUID().slice(0,8)}`;
const PORT = Number(process.env.PORT || 3000);
const REFRESH_MS = Number(process.env.WATCHLIST_REFRESH_MS || 30000);
const LIVE_CHECK_MS = Number(process.env.LIVE_CHECK_MS || 60000);

if (!API_KEY || !HUB_TOKEN) {
  console.error('Missing TIKTOOL_API_KEY or LEGACY_WORKER_TOKEN');
  process.exit(1);
}

const watchers = new Map();
const userCache = new Map();
let config = { sandbox_mode: true, max_concurrent: 3, enabled: true };
let lastConfigAt = 0;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const normal = (v) => String(v || '').trim().replace(/^@/, '').toLowerCase();

async function hub(action, body, method='POST') {
  const url = new URL(HUB_API);
  url.searchParams.set('action', action);
  const res = await fetch(url, {
    method,
    headers: { 'authorization': `Bearer ${HUB_TOKEN}`, 'content-type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(body || {})
  });
  const json = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(`Legacy worker API ${res.status}: ${json.error || 'request failed'}`);
  return json;
}

async function tik(path, opts={}) {
  const url = new URL(`https://api.tik.tools${path}`);
  url.searchParams.set('apiKey', API_KEY);
  for (const [k,v] of Object.entries(opts.query || {})) if (v != null) url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers: { 'content-type':'application/json', 'x-api-key': API_KEY },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const json = await res.json().catch(()=>({}));
  if (!res.ok || (json.status_code != null && json.status_code !== 0)) throw new Error(json.message || json.error || `TikTool ${res.status}`);
  return json;
}

async function resolveIds(ids) {
  const need = [...new Set(ids.map(String).filter(Boolean))].filter(id => !userCache.has(id));
  if (need.length) {
    try {
      const j = await tik('/webcast/resolve_user_ids', { method:'POST', body:{ user_ids: need.slice(0,20) } });
      for (const [id,u] of Object.entries(j.data || {})) userCache.set(String(id), u || {});
    } catch (e) { console.warn('resolve_user_ids:', e.message); }
  }
  return Object.fromEntries(ids.map(id => [String(id), userCache.get(String(id)) || null]));
}

function idsForHost(host) {
  if (host?.isTeam && Array.isArray(host.members) && host.members.length) return host.members.map(m => String(m.userId || m.id || '')).filter(Boolean);
  const id = host?.hostUserId;
  return id != null ? [String(id)] : [];
}

async function identifySides(username, hosts) {
  const allIds = hosts.flatMap(idsForHost);
  const resolved = await resolveIds(allIds);
  let mine = -1;
  for (let i=0;i<hosts.length;i++) {
    if (idsForHost(hosts[i]).some(id => normal(resolved[id]?.username) === normal(username))) { mine=i; break; }
  }
  if (mine < 0) return null;
  const opp = hosts.findIndex((_,i)=>i!==mine);
  if (opp < 0) return null;
  const myIds = idsForHost(hosts[mine]);
  const oppIds = idsForHost(hosts[opp]);
  const opponent = oppIds.map(id=>resolved[id]).find(Boolean);
  return {
    mine, opp,
    creatorHostId: myIds[0] || null,
    opponentHostId: oppIds[0] || null,
    opponentHandle: opponent?.username ? normal(opponent.username) : null
  };
}

class CreatorWatcher {
  constructor(creator) {
    this.creator=creator;
    this.ws=null;
    this.roomId=null;
    this.matches=new Map();
    this.closed=false;
    this.lastLiveCheck=0;
    this.reconnectAt=0;
    this.sideMisses=0;
  }

  async checkAndConnect() {
    if (this.closed || this.ws) return;
    if (Date.now() < this.reconnectAt) return;
    if (Date.now()-this.lastLiveCheck < LIVE_CHECK_MS) return;
    this.lastLiveCheck=Date.now();

    let live=false, roomId=null;
    try {
      const j=await tik('/webcast/bulk_live_check',{
        method:'POST',
        body:{unique_ids:[this.creator.tiktok_username]}
      });
      const rows=Array.isArray(j.data)?j.data:[];
      const row=rows.find(r=>normal(r?.unique_id)===normal(this.creator.tiktok_username)) || rows[0] || null;

      if (row?.alive_status === 'unknown' || row?.live_status === 'unknown' || row?.check_failed === true) {
        await hub('connection',{profile_id:this.creator.profile_id,status:'ready',error:null}).catch(()=>{});
        this.reconnectAt=Date.now()+30000;
        return;
      }

      live=!!(row?.is_live ?? row?.alive);
      roomId=row?.room_id || null;
    } catch(e) {
      console.warn(`@${this.creator.tiktok_username} live preflight:`,e.message);
      await hub('connection',{profile_id:this.creator.profile_id,status:'error',error:e.message}).catch(()=>{});
      this.reconnectAt=Date.now()+60000;
      return;
    }

    if (!live) {
      await hub('connection',{profile_id:this.creator.profile_id,status:'offline',error:null}).catch(()=>{});
      return;
    }
    this.roomId=roomId;
    await this.connect();
  }

  async connect() {
    try {
      const j=await tik('/authentication/jwt',{method:'POST',body:{allowed_creators:[this.creator.tiktok_username],expire_after:600,max_websockets:1}});
      const token=j.data?.token;
      if(!token)throw new Error('TikTool did not return a JWT');
      const u=`wss://api.tik.tools?uniqueId=${encodeURIComponent(this.creator.tiktok_username)}&jwtKey=${encodeURIComponent(token)}`;
      this.ws=new WebSocket(u);
      this.ws.on('open',()=>hub('connection',{profile_id:this.creator.profile_id,status:'watching',room_id:this.roomId,error:null}).catch(()=>{}));
      this.ws.on('message',(raw)=>this.onMessage(raw).catch(e=>console.warn('message:',e.message)));
      this.ws.on('error',(e)=>console.warn(`@${this.creator.tiktok_username} websocket:`,e.message));
      this.ws.on('close',()=>this.onClose());
      this.jwtTimer=setTimeout(()=>{ try{this.ws?.close(1000,'refresh')}catch{} }, 8*60*1000);
    } catch(e) {
      console.warn(`@${this.creator.tiktok_username} connect:`,e.message);
      this.ws=null; this.reconnectAt=Date.now()+45000;
      await hub('connection',{profile_id:this.creator.profile_id,status:'error',error:e.message}).catch(()=>{});
    }
  }

  onClose() {
    clearTimeout(this.jwtTimer);
    this.ws=null;
    if (!this.closed) this.reconnectAt=Date.now()+15000;
  }

  async onMessage(raw) {
    let msg; try{msg=JSON.parse(raw.toString())}catch{return}
    const event=msg.event, d=msg.data || msg;
    if(event==='roomInfo') {
      this.roomId=d.roomId || msg.roomId || this.roomId;
      await hub('connection',{profile_id:this.creator.profile_id,status:'watching',room_id:this.roomId,error:null}).catch(()=>{});
      return;
    }
    if(event!=='battleArmies')return;
    const hosts=Array.isArray(d.hosts)?d.hosts:[];
    if(hosts.length<2)return;

    const sides=await identifySides(this.creator.tiktok_username,hosts);
    if(!sides){
      this.sideMisses++;
      if(this.sideMisses===1||this.sideMisses%10===0)console.warn(`Could not map @${this.creator.tiktok_username} to a PK side yet`);
      return;
    }
    this.sideMisses=0;
    const providerMatch=String(d.matchId || d.battleId || 'unknown');
    const session=String(d.sessionId || 'round');
    const externalKey=`${providerMatch}:${session}`;
    let m=this.matches.get(externalKey);
    if(!m){
      m={
        externalKey,providerMatch,session,
        startedAt:new Date((Number(d.serverTsMs)||Date.now()) - Math.max(0,(Number(d.durationSec)||300)-(Number(d.secsRemaining)||Number(d.durationSec)||300))*1000).toISOString(),
        lastAt:Date.now(), duration:Number(d.durationSec)||300,
        creatorScore:0,opponentScore:0,
        creatorHostId:sides.creatorHostId,opponentHostId:sides.opponentHostId,opponentHandle:sides.opponentHandle,
        lastFrame:null, finalized:false
      };
      this.matches.set(externalKey,m);
    }
    m.lastAt=Date.now();
    m.creatorScore=Number(hosts[sides.mine]?.teamTotalScore||0);
    m.opponentScore=Number(hosts[sides.opp]?.teamTotalScore||0);
    m.creatorHostId=sides.creatorHostId||m.creatorHostId;
    m.opponentHostId=sides.opponentHostId||m.opponentHostId;
    m.opponentHandle=sides.opponentHandle||m.opponentHandle;
    m.lastFrame={status:d.status,secsRemaining:d.secsRemaining,serverTsMs:d.serverTsMs,transactionId:d.transactionId||null,protoVersion:d.protoVersion||null};
    await hub('connection',{profile_id:this.creator.profile_id,status:'battle',room_id:this.roomId,provider_user_id:m.creatorHostId,error:null}).catch(()=>{});
    if(Number(d.secsRemaining)===0 || Number(d.status)===2) await this.finalize(m,'terminal_frame');
  }

  async finalize(m, reason) {
    if(m.finalized)return;
    m.finalized=true;
    const ended=new Date().toISOString();
    try {
      await hub('detection',{
        creator_id:this.creator.profile_id,
        external_match_id:m.externalKey,
        external_session_id:m.session,
        creator_host_user_id:m.creatorHostId,
        opponent_host_user_id:m.opponentHostId,
        opponent_handle:m.opponentHandle,
        creator_score:m.creatorScore,
        opponent_score:m.opponentScore,
        started_at:m.startedAt,
        ended_at:ended,
        confidence:m.opponentHandle?0.98:0.9,
        raw_summary:{
          provider:'tiktool',provider_match_id:m.providerMatch,session_id:m.session,room_id:this.roomId,
          completion_reason:reason,duration_sec:m.duration,last_frame:m.lastFrame,
          score_note:'PK score is stored separately from diamonds.'
        }
      });
      console.log(`Saved @${this.creator.tiktok_username} ${m.creatorScore}-${m.opponentScore} (${reason})`);
    } catch(e) {
      m.finalized=false;
      console.error('Detection save failed:',e.message);
    }
  }

  tick() {
    const now=Date.now();
    for(const m of this.matches.values()){
      if(m.finalized)continue;
      const wallClock=new Date(m.startedAt).getTime()+m.duration*1000+30000;
      if(now>=wallClock)this.finalize(m,'wall_clock').catch(()=>{});
      else if(now-m.lastAt>=30000)this.finalize(m,'idle_gap').catch(()=>{});
    }
  }

  stop() {
    this.closed=true; clearTimeout(this.jwtTimer);
    try{this.ws?.close(1000,'removed')}catch{}
    this.ws=null;
  }
}

async function refreshWatchlist(){
  const data=await hub('config',null,'GET');
  config=data.config||config;
  const desired=(data.creators||[]).slice(0, Number(config.max_concurrent||3));
  const ids=new Set(desired.map(c=>c.profile_id));
  for(const [id,w] of watchers) if(!ids.has(id)){w.stop();watchers.delete(id)}
  for(const c of desired) if(!watchers.has(c.profile_id))watchers.set(c.profile_id,new CreatorWatcher(c));
  lastConfigAt=Date.now();
}

async function heartbeat(){
  const active=[...watchers.values()].filter(w=>w.ws && w.ws.readyState===WebSocket.OPEN).length;
  await hub('heartbeat',{
    worker_id:WORKER_ID,status:'online',mode:config.sandbox_mode?'sandbox':'paid',
    active_connections:active,max_concurrent:Number(config.max_concurrent||3),
    metadata:{watchers:watchers.size,node:process.version,version:'5.5B.4'}
  }).catch(e=>console.warn('heartbeat:',e.message));
}

setInterval(()=>{ for(const w of watchers.values()){w.tick();w.checkAndConnect().catch(e=>console.warn(e.message))} },5000);
setInterval(()=>refreshWatchlist().catch(e=>console.warn('watchlist:',e.message)),REFRESH_MS);
setInterval(()=>heartbeat(),30000);

await refreshWatchlist();
await heartbeat();
for(const w of watchers.values())w.checkAndConnect().catch(()=>{});

http.createServer((req,res)=>{
  res.setHeader('content-type','application/json');
  res.end(JSON.stringify({ok:true,worker:'Legacy Hub TikTok Battle Worker',version:'5.5B.4',watchers:watchers.size,last_config_at:lastConfigAt}));
}).listen(PORT,()=>console.log(`Legacy Hub battle worker 5.5B.4 listening on :${PORT}`));
