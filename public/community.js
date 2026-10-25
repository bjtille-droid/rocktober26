const $ = id => document.getElementById(id);
const partyTime = new Date('2026-10-31T20:00:00-04:00').getTime();
function updateCountdown() {
  const seconds = Math.max(0, Math.floor((partyTime - Date.now()) / 1000));
  const values = {days:Math.floor(seconds/86400),hours:Math.floor(seconds%86400/3600),minutes:Math.floor(seconds%3600/60),seconds:seconds%60};
  Object.entries(values).forEach(([id,value]) => { $(id).textContent = String(value).padStart(2,'0'); });
  if (!seconds) $('countdown-label').textContent = 'The door is open';
}
updateCountdown(); setInterval(updateCountdown,1000);
$('pledgeButton').addEventListener('click', event => {
  event.currentTarget.textContent = '✓ The crypt keeper accepts your offering';
  event.currentTarget.classList.add('accepted');
  event.currentTarget.setAttribute('aria-pressed','true');
});

const form = $('costumeForm');
const nameInput = $('guestName');
const costumeInput = $('costumeIdea');
const submitButton = $('costumeSubmit');
const deleteButton = $('deleteMyCostume');
const randomButton = $('randomCostume');
const status = $('costumeStatus');
let connected = false;
let busy = false;
let loading = false;
let mine = null;

function setStatus(message, error=false) {status.textContent=message;status.classList.toggle('error',error);}
function updateControls() {
  [nameInput,costumeInput,submitButton,randomButton].forEach(el=>{el.disabled=!connected||busy;});
  deleteButton.disabled=busy||!connected;
  deleteButton.hidden=!mine;
  submitButton.textContent=busy?'Sending…':mine?'Update my costume':'Add my costume +';
}
function connection(label, online) {
  for(const id of ['communityConnection','leaderboardConnection']) {
    const el=$(id);el.textContent=label;el.classList.toggle('live',online);el.classList.toggle('offline',!online);
  }
}
async function api(path, options={}) {
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),12000);
  try {
    const response=await fetch(path,{credentials:'same-origin',cache:'no-store',...options,signal:controller.signal});
    let data;
    try {data=await response.json();}catch{throw new Error('The crypt is unavailable right now. Try again shortly.');}
    if(!response.ok) throw new Error(data.message||'The request could not be completed.');
    return data;
  } catch(error) {
    if(error.name==='AbortError') throw new Error('The crypt took too long to answer. Please try again.');
    throw error;
  } finally {clearTimeout(timeout);}
}
function renderCostumes(entries) {
  const list=$('rollList');list.replaceChildren();
  mine=entries.find(entry=>entry.mine)||null;
  $('entryCount').textContent=`${entries.length} ${entries.length===1?'costume':'costumes'}`;
  if(!entries.length) {
    const empty=document.createElement('p');empty.className='empty-list';empty.textContent='The guest book is quiet… be the first apparition.';list.append(empty);
  }
  entries.forEach(entry=>{
    const row=document.createElement('div');row.className='roll-entry';
    const copy=document.createElement('div');copy.className='entry-copy';
    const name=document.createElement('span');name.className='entry-name';name.textContent=entry.name;
    const costume=document.createElement('span');costume.className='entry-costume';costume.textContent=entry.costume;
    copy.append(name,costume);row.append(copy);
    if(entry.mine){const stamp=document.createElement('span');stamp.className='mine-stamp';stamp.textContent='YOU';row.append(stamp);}
    list.append(row);
  });
  if(mine&&!nameInput.value&&!costumeInput.value){nameInput.value=mine.name;costumeInput.value=mine.costume;}
  updateControls();
}
function renderLeaderboard(entries) {
  const body=$('leaderboardBody');body.replaceChildren();
  if(!entries.length){const row=document.createElement('tr');const cell=document.createElement('td');cell.colSpan=3;cell.className='empty-score';cell.textContent='No ghosts on the board yet. Set the first score.';row.append(cell);body.append(row);return;}
  entries.slice(0,10).forEach((entry,index)=>{
    const row=document.createElement('tr');
    for(const value of [String(entry.rank||index+1).padStart(2,'0'),entry.name,Number(entry.score).toLocaleString()]){
      const cell=document.createElement('td');cell.textContent=value;row.append(cell);
    }
    body.append(row);
  });
}
async function refresh() {
  if(loading)return;
  loading=true;
  try {
    const data=await api('/api/community');
    connected=true;connection('Shared · live',true);
    renderCostumes(data.costumes||[]);renderLeaderboard(data.leaderboard||[]);
    if(status.dataset.networkError){setStatus('Back in touch with the crypt.');delete status.dataset.networkError;}
  } catch(error) {
    connected=false;connection('Reconnecting…',false);
    setStatus(error.message,true);status.dataset.networkError='true';
    if(!$('rollList').querySelector('.roll-entry'))$('rollList').querySelector('p').textContent='The guest book is temporarily unavailable. Please check back.';
    updateControls();
  } finally {loading=false;}
}
form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy||!connected)return;
  const name=nameInput.value.trim(),costume=costumeInput.value.trim();
  if(!name||!costume)return;
  busy=true;updateControls();
  try {
    await api('/api/costumes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,costume})});
    setStatus('You’re in the guest book. The crypt approves.');
    await refresh();
  }catch(error){setStatus(error.message,true);}finally{busy=false;updateControls();}
});
deleteButton.addEventListener('click',async()=>{
  if(busy||!connected||!mine)return;
  busy=true;updateControls();
  try {
    await api('/api/costumes',{method:'DELETE',headers:{'Content-Type':'application/json'},body:'{}'});
    mine=null;nameInput.value='';costumeInput.value='';setStatus('Your entry has left the crypt.');await refresh();
  }catch(error){setStatus(error.message,true);}finally{busy=false;updateControls();}
});
const ideas=['Mothman','A haunted Clemson tiger','Vampire rock star','Ghost with a day job','Swamp creature','Cursed fortune teller','Disco skeleton','Werewolf in a cardigan','The world’s tiniest gargoyle','Possessed marching band'];
randomButton.addEventListener('click',()=>{costumeInput.value=ideas[Math.floor(Math.random()*ideas.length)];costumeInput.focus();});
$('refreshCommunity').addEventListener('click',refresh);
window.addEventListener('rocktober:refresh',refresh);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
setInterval(()=>{if(!document.hidden&&!busy)refresh();},20000);
window.rocktoberSessionReady = refresh();
