'use strict';
const $=id=>document.getElementById(id);
const S={cfg:null,session:null,report:null,days:30,timer:null,busy:false,lastOK:null};
const number=n=>new Intl.NumberFormat('vi-VN',{maximumFractionDigits:1}).format(Number(n||0));
const escapeHtml=x=>String(x??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const when=x=>x?new Date(x).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour12:false,day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
const secs=x=>x===null||x===undefined?'—':`${number(x)} giây`;
const mins=x=>x===null||x===undefined?'—':`${number(x)} phút`;
const n=x=>Number(x)||0;
const sleep=t=>new Promise(r=>setTimeout(r,t));
function announce(msg){const box=$('toast');box.textContent=msg;box.hidden=false;clearTimeout(announce.timer);announce.timer=setTimeout(()=>box.hidden=true,4100);}
function notice(msg='',error=false){const e=$('notice');e.hidden=!msg;e.textContent=msg;e.classList.toggle('error',error);}
function setLive(text,bad=false){$('liveText').textContent=text;$('liveStatus').classList.toggle('error',bad);$('asideStatus').textContent=text;document.querySelector('.aside-dot').className='aside-dot '+(bad?'bad':'good');}
function saveSession(s){S.session=s; if(s)localStorage.setItem('nc_cloud_session_v5',JSON.stringify(s));else localStorage.removeItem('nc_cloud_session_v5');}
async function raw(url,opt={}){const r=await fetch(url,opt);const body=await r.text();let value;try{value=body?JSON.parse(body):null;}catch{value=body;}if(!r.ok){let msg=typeof value==='object'?value?.msg||value?.message||value?.error_description||value?.error:value;throw new Error((msg||`HTTP ${r.status}`).toString().slice(0,240));}return value;}
async function refreshToken(){if(!S.session?.refresh_token)throw new Error('Phiên đăng nhập đã hết hạn');const info=await raw(`${S.cfg.url}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{apikey:S.cfg.key,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:S.session.refresh_token})});saveSession({...info,expires_at:Math.floor(Date.now()/1000)+(info.expires_in||3600)});}
async function ensureSession(){if(!S.session?.access_token)throw new Error('Bạn chưa đăng nhập');if(S.session.expires_at && S.session.expires_at<Date.now()/1000+65)await refreshToken();}
async function rpc(name,args={},retry=true){await ensureSession();try{return await raw(`${S.cfg.url}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:S.cfg.key,Authorization:`Bearer ${S.session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify(args)});}catch(e){if(retry && /JWT|token|expired|401|PGRST301/i.test(e.message)){await refreshToken();return rpc(name,args,false);}throw e;}}
async function login(email,password,signup=false){const url=signup?'/auth/v1/signup':'/auth/v1/token?grant_type=password';const data=await raw(S.cfg.url+url,{method:'POST',headers:{apikey:S.cfg.key,'Content-Type':'application/json'},body:JSON.stringify({email,password})});if(signup && !data?.access_token){$('authError').hidden=false;$('authError').textContent='Đã gửi yêu cầu. Hãy xác nhận email (nếu Supabase yêu cầu), sau đó đăng nhập.';return;}if(!data?.access_token)throw new Error('Không có phiên đăng nhập. Kiểm tra email/mật khẩu.');saveSession({...data,expires_at:Math.floor(Date.now()/1000)+(data.expires_in||3600)});await bootAuthenticated();}
async function bootAuthenticated(){try{const allowed=await rpc('nc_cloud_access',{p_site:S.cfg.site});if(!allowed){saveSession(null);$('loginScreen').hidden=false;$('shell').hidden=true;$('authError').hidden=false;$('authError').textContent='Tài khoản chưa được cấp quyền xem dữ liệu của trạm này.';return;}}catch(e){saveSession(null);$('loginScreen').hidden=false;$('shell').hidden=true;$('authError').hidden=false;$('authError').textContent='Không thể xác thực quyền xem. '+e.message;return;}$('loginScreen').hidden=true;$('shell').hidden=false;await load();}
async function load(){if(S.busy||document.hidden)return;S.busy=true;try{setLive('Đang đồng bộ');const data=await rpc('nc_cloud_report',{p_site:S.cfg.site,p_days:S.days});if(!data||typeof data!=='object')throw new Error('Không nhận được báo cáo từ Supabase');S.report=data;S.lastOK=new Date();render(data);setLive('Tự cập nhật · 20 giây');notice('');}catch(err){setLive('Chưa cập nhật',true);notice('Không thể lấy dữ liệu mới. Đang giữ lại số liệu lần đồng bộ thành công gần nhất.',true);if(!S.report)console.warn('Dashboard cloud:',err.message);}finally{S.busy=false;}}
function render(data){const k=data.stats||{}, beds=data.beds||[],devs=data.devices||[];const all=n(k.calls);$('kCalls').textContent=number(all);$('kEmergency').textContent=number(k.emergency);$('kCompleted').textContent=number(k.completed);$('kAbnormal').textContent=number(k.abnormal);$('kEmergencySub').textContent=`${all?number(100*n(k.emergency)/all):0}% tổng cuộc gọi`;$('kCompletedSub').textContent=`${all?number(100*n(k.completed)/all):0}% tổng cuộc gọi`;$('kAbnormalSub').textContent=`${number(k.samples)} mẫu ghi nhận`;$('kCallsSub').textContent=`Tiếp nhận TB ${secs(k.avg_accept_seconds)}`;
  $('nodeOnline').textContent=number(k.node_online);$('nodeOffline').textContent=number(k.node_offline);$('nodeUnknown').textContent=number(k.node_unknown);
  const pi=devs.find(d=>d.kind==='pi');const online=pi?.status==='online';const unknown=!pi?.last_seen_at;
  $('piState').textContent=unknown?'Chưa có dữ liệu':online?'Đang kết nối':'Mất liên lạc Cloud';$('piDot').className='status-dot '+(unknown?'unknown':online?'':'bad');$('piLast').textContent=when(pi?.last_seen_at);$('piLost').textContent=mins(n(pi?.silence_seconds)/60);
  $('lastSync').textContent='Dữ liệu Cloud · '+when(data.generated_at);$('footerSync').textContent='Cập nhật '+when(data.generated_at);$('dateLabel').textContent='Trạm y tá trung tâm';
  for(const [col,count] of [['Hr','hr_alert'],['Temp','temp_alert'],['Bp','bp_alert'],['Mode','mode_alert']]){$('count'+col).textContent=number(k[count]);$('bar'+col).style.width=`${Math.min(100,n(k[count])*100/Math.max(1,n(k.samples)))}%`;}
  renderBeds(beds);renderAbnormal(data.abnormal_recent||[]);renderOutages(data.outages||[],devs);
}
function statusLabel(s){return s==='online'?'Đang kết nối':s==='offline'?'Mất kết nối':'Chưa xác định';}
function renderBeds(beds){const search=$('bedSearch').value.trim().toLowerCase();const filtered=beds.filter(x=>`${x.floor} ${x.room} ${x.bed}`.toLowerCase().includes(search));$('bedCount').textContent=`${filtered.length} giường`;
 $('bedRows').innerHTML=filtered.length?filtered.map((b,i)=>`<tr data-bed="${i}" tabindex="0" aria-label="Xem giường ${escapeHtml(b.bed)}"><td class="place">Giường ${escapeHtml(b.bed)}<small>Phòng ${escapeHtml(b.room)} · Tầng ${escapeHtml(b.floor)}</small></td><td class="num">${number(b.total_calls)}</td><td class="count-red">${number(b.emergency_calls)}</td><td class="num">${number(b.abnormal_samples)}</td><td>${secs(b.avg_accept_seconds)}</td><td>${mins(b.silence_minutes)}</td><td><span class="badge ${escapeHtml(b.node_status||'unknown')}">${statusLabel(b.node_status)}</span></td><td class="chev">›</td></tr>`).join(''):`<tr><td class="empty" colspan="8">Không có dữ liệu phù hợp</td></tr>`;
 document.querySelectorAll('[data-bed]').forEach(el=>{const open=()=>showBed(filtered[Number(el.dataset.bed)]);el.addEventListener('click',open);el.addEventListener('keydown',e=>{if(e.key==='Enter')open();});});}
function renderAbnormal(items){$('abnormalCount').textContent=`${items.length} mẫu gần nhất`;$('abnormalList').innerHTML=items.length?items.slice(0,7).map(x=>{const badges=[];if(x.hr_alert)badges.push('Nhịp tim');if(x.temp_alert)badges.push('Nhiệt độ');if(x.bp_alert)badges.push('Huyết áp');if(x.mode_alert)badges.push('Chế độ');return `<div class="event-item"><div class="event-left"><div class="event-mark">!</div><div><b>Phòng ${escapeHtml(x.room)} · Giường ${escapeHtml(x.bed)}</b><small>${escapeHtml(badges.join(' / '))}</small></div></div><span class="event-value">${when(x.measured_at)}</span></div>`;}).join(''):`<div class="empty">Không có mẫu bất thường</div>`;}

function downtimeLabel(minutes){
 if(minutes===null||minutes===undefined||minutes===''||!Number.isFinite(Number(minutes)))return '—';
 const n=Math.max(0,Math.round(Number(minutes)));
 if(n===0)return 'Dưới 1 phút';
 const d=Math.floor(n/1440),h=Math.floor((n%1440)/60),m=n%60;
 return [d?d+' ngày':'',h?h+' giờ':'',m?m+' phút':''].filter(Boolean).join(' ');
}
function renderOutages(records,devs){
 const piOnline=devs.some(d=>d.kind==='pi'&&d.status==='online');
 const ongoing=devs.filter(d=>d.last_seen_at&&d.status==='offline'&&(d.kind==='pi'||piOnline)).map(d=>{
   const last=Date.parse(d.last_seen_at),start=last+(d.kind==='pi'?60000:90000);
   if(!Number.isFinite(start)||start>Date.now())return null;
   return {device_id:d.device_id,kind:d.kind,started_at:new Date(start).toISOString(),ended_at:null,minutes:Math.max(0,(Date.now()-start)/60000),source:'ongoing'};
 }).filter(Boolean);
 const rows=[...ongoing,...(Array.isArray(records)?records:[])].sort((a,b)=>(Date.parse(b.started_at)||0)-(Date.parse(a.started_at)||0)).slice(0,20);
 $('outageCount').textContent=rows.length+' lần gần nhất';
 $('outageRows').innerHTML=rows.length?rows.map(x=>`<tr><td class="place">${x.kind==='pi'?'Raspberry Pi 4':escapeHtml(x.device_id)}</td><td>${when(x.started_at)}</td><td>${x.ended_at?when(x.ended_at):'<span class="count-red">Chưa khôi phục</span>'}</td><td class="num">${downtimeLabel(x.minutes)}${x.source==='ongoing'?' (ước tính)':''}</td></tr>`).join(''):'<tr><td colspan="4" class="empty">Chưa ghi nhận mất kết nối</td></tr>';
}
function showBed(b){if(!b)return;$('detailTitle').textContent=`Phòng ${b.room} · Giường ${b.bed}`;const matches=(S.report.abnormal_recent||[]).filter(v=>String(v.floor)===String(b.floor)&&String(v.room)===String(b.room)&&String(v.bed)===String(b.bed));$('detailBody').innerHTML=`<div class="detail-grid">${[['Cuộc gọi',b.total_calls],['Khẩn cấp',b.emergency_calls],['Mẫu bất thường',b.abnormal_samples],['Mất kết nối',downtimeLabel(b.silence_minutes)],['Hoàn thành',b.completed_calls],['Tiếp nhận TB',secs(b.avg_accept_seconds)]].map(([a,v])=>`<div class="detail-box"><small>${escapeHtml(a)}</small><b>${escapeHtml(v??'—')}</b></div>`).join('')}</div><div class="detail-subhead">Trạng thái: ${statusLabel(b.node_status)}</div><div class="detail-subhead">Mẫu bất thường gần đây</div>${matches.length?matches.slice(0,8).map(v=>`<div class="detail-incident"><span>${when(v.measured_at)}</span><span>${v.bpm??'—'} bpm · ${v.temp_c??'—'}°C · ${v.bp_sys??'—'}/${v.bp_dia??'—'}</span></div>`).join(''):`<div class="detail-incident">Không có mẫu gần đây</div>`}`;$('bedModal').hidden=false;}
function closeBed(){$('bedModal').hidden=true;}
async function startExport(kind){
  $('exportMenu').hidden=true;
  if(!S.report){announce('Chưa có dữ liệu để xuất báo cáo');return;}
  if(!window.NurseCallExport){announce('Chưa tải được chức năng xuất báo cáo');return;}
  const button=$('exportToggle');
  const oldLabel=button.innerHTML;
  button.disabled=true;
  button.textContent='Đang xuất...';
  try{
    let rows=[];
    let isLimited=false;
    if(kind==='beds'){
      rows=S.report.beds||[];
    }else{
      for(let offset=0;offset<20000;offset+=400){
        const batch=await rpc('nc_cloud_export',{
          p_site:S.cfg.site,p_days:S.days,p_kind:kind,p_limit:400,p_offset:offset
        });
        if(!Array.isArray(batch))throw new Error('Dữ liệu báo cáo không hợp lệ');
        rows.push(...batch);
        if(batch.length<400)break;
        if(offset===19600)isLimited=true;
      }
    }
    if(isLimited)throw new Error('Báo cáo vượt 20.000 bản ghi. Chọn khoảng thời gian ngắn hơn để lấy đầy đủ.');
    NurseCallExport.save(kind,rows,S.days);
    announce('Đã xuất Excel · '+number(rows.length)+' bản ghi');
  }catch(e){
    announce('Lỗi xuất báo cáo: '+e.message);
  }finally{
    button.disabled=false;
    button.innerHTML=oldLabel;
  }
}
async function setup(){try{const cfg=await raw('./config.json',{cache:'no-store'});if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(cfg.url)||!cfg.key||!cfg.site)throw new Error('Thiếu cấu hình Cloud');S.cfg=cfg;}catch(e){$('loginScreen').hidden=false;$('authError').hidden=false;$('authError').textContent='Website chưa được cấu hình Supabase. '+e.message;return;}
 $('authForm').addEventListener('submit',async e=>{e.preventDefault();$('authError').hidden=true;$('loginButton').disabled=true;try{await login($('authEmail').value.trim(),$('authPassword').value,false);}catch(ex){$('authError').textContent=ex.message;$('authError').hidden=false;}finally{$('loginButton').disabled=false;}});
 $('signupButton').addEventListener('click',async()=>{if(!$('authForm').reportValidity())return;$('authError').hidden=true;try{await login($('authEmail').value.trim(),$('authPassword').value,true);}catch(e){$('authError').textContent=e.message;$('authError').hidden=false;}});
 $('signoutButton').addEventListener('click',async()=>{try{if(S.session?.access_token)await raw(S.cfg.url+'/auth/v1/logout',{method:'POST',headers:{apikey:S.cfg.key,Authorization:`Bearer ${S.session.access_token}`}});}catch{}saveSession(null);S.report=null;$('shell').hidden=true;$('loginScreen').hidden=false;});
 $('daysSelect').addEventListener('change',()=>{S.days=Number($('daysSelect').value);load();});$('refreshButton').addEventListener('click',load);$('bedSearch').addEventListener('input',()=>{if(S.report)renderBeds(S.report.beds||[]);});$('exportToggle').addEventListener('click',()=>{$('exportMenu').hidden=!$('exportMenu').hidden;});document.querySelectorAll('[data-export]').forEach(x=>x.addEventListener('click',()=>startExport(x.dataset.export)));document.addEventListener('click',e=>{if(!e.target.closest('.export-wrap'))$('exportMenu').hidden=true;});$('closeModal').addEventListener('click',closeBed);$('bedModal').addEventListener('click',e=>{if(e.target===$('bedModal'))closeBed();});document.addEventListener('keydown',e=>{if(e.key==='Escape')closeBed();});document.addEventListener('visibilitychange',()=>{if(!document.hidden&&S.session)load();});
 try{S.session=JSON.parse(localStorage.getItem('nc_cloud_session_v5')||'null');}catch{saveSession(null);}
 if(S.session?.access_token){try{await bootAuthenticated();}catch{saveSession(null);$('loginScreen').hidden=false;}}else $('loginScreen').hidden=false;
 S.timer=setInterval(()=>{if(S.session&&!document.hidden)load();},20000);
}
setup();
