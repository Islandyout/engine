/* Presentation only. All simulation state is read from the C++ WASM module. */
(async () => {
  const $ = id => document.getElementById(id);
  let engine;
  try {
    if (typeof createEngine !== 'function') throw new Error('The compiled engine file is unavailable.');
    engine = await createEngine(); engine._lab_init();
  } catch (error) {
    $('loading').replaceChildren();
    const title=document.createElement('strong'), message=document.createElement('p');
    title.textContent='The engine could not start'; message.textContent=`${error.message || error} Please reload, or check the latest build on GitHub.`;
    $('loading').append(title,message); $('status').textContent='Engine unavailable'; return;
  }
  $('loading').hidden=true; $('loading').style.display='none';
  $('status').textContent='C++ engine connected · running locally';
  for(const id of ['demo','spawn','reset','record','lock','new-field']) $(id).disabled=false;
  const canvas=$('scene'), ctx=canvas.getContext('2d');
  if(!ctx){ $('status').textContent='This browser cannot draw the field.'; return; }
  const keyMap={KeyW:0,ArrowUp:0,KeyA:1,ArrowLeft:1,KeyS:2,ArrowDown:2,KeyD:3,ArrowRight:3,Space:4,KeyP:5};
  const held=new Set();
  function key(id,down){ const had=held.has(id); if(down===had)return; down?held.add(id):held.delete(id); engine._lab_key(id,down?1:0); }
  function release(){for(const id of [...held])key(id,false);}
  function pulse(id){engine._lab_key(id,1);engine._lab_key(id,0);}
  document.addEventListener('keydown',e=>{if(e.code in keyMap && !['BUTTON','A','INPUT'].includes(document.activeElement.tagName)){e.preventDefault();key(keyMap[e.code],true);}});
  document.addEventListener('keyup',e=>{if(e.code in keyMap){key(keyMap[e.code],false);}});
  window.addEventListener('blur',release);document.addEventListener('visibilitychange',()=>{if(document.hidden)release();last=performance.now();});
  for(const button of document.querySelectorAll('[data-key]')) {
    const id=Number(button.dataset.key);let started=0, timer;
    button.addEventListener('pointerdown',e=>{e.preventDefault();clearTimeout(timer);button.setPointerCapture(e.pointerId);started=performance.now();key(id,true);button.classList.add('held');});
    const up=()=>{timer=setTimeout(()=>{key(id,false);button.classList.remove('held');},Math.max(0,120-(performance.now()-started)));};
    button.addEventListener('pointerup',up);button.addEventListener('pointercancel',up);button.addEventListener('lostpointercapture',up);
    button.addEventListener('click',e=>{if(e.detail===0){key(id,true);setTimeout(()=>key(id,false),120);}});
  }
  function command(n){release();engine._lab_control(n);last=performance.now();canvas.focus({preventScroll:true});}
  $('new-field').onclick=()=>command(5);$('demo').onclick=()=>command(4);$('reset').onclick=()=>command(0);
  $('record').onclick=()=>command(engine._lab_value(3)===1?2:1);
  $('replay').onclick=()=>command(3);$('spawn').onclick=()=>{pulse(4);canvas.focus({preventScroll:true});};
  $('lock').onclick=()=>{pulse(5);canvas.focus({preventScroll:true});};
  let yaw=.65,targetYaw=.65,scale=24,W=0,H=0,last=performance.now(),visualTime=0;
  $('camera').onclick=()=>{targetYaw+=Math.PI/2;};
  const reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function project(x,z,y=0){const c=Math.cos(yaw),s=Math.sin(yaw);return [W/2+(x*c-z*s)*scale,H*.51+(x*s+z*c)*scale*.48-y*scale*.98];}
  function polygon(points,color,stroke){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();ctx.fillStyle=color;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=.6;ctx.stroke();}}
  function quad(x,z,w,d,y,color){polygon([project(x-w/2,z-d/2,y),project(x+w/2,z-d/2,y),project(x+w/2,z+d/2,y),project(x-w/2,z+d/2,y)],color);}
  function box(x,z,w,d,h,y,palette){
    const a=project(x-w/2,z-d/2,y),b=project(x+w/2,z-d/2,y),c=project(x+w/2,z+d/2,y),d0=project(x-w/2,z+d/2,y);
    const A=project(x-w/2,z-d/2,y+h),B=project(x+w/2,z-d/2,y+h),C=project(x+w/2,z+d/2,y+h),D=project(x-w/2,z+d/2,y+h);
    if(Math.sin(yaw)>0)polygon([b,c,C,B],palette[1]);else polygon([a,d0,D,A],palette[1]);
    if(Math.cos(yaw)>0)polygon([d0,c,C,D],palette[2]);else polygon([a,b,B,A],palette[2]);
    polygon([A,B,C,D],palette[0]);
  }
  function ring(x,z,r,color,width=1){ctx.beginPath();for(let i=0;i<=48;i++){const a=i*Math.PI/24,p=project(x+Math.cos(a)*r,z+Math.sin(a)*r,.03);i?ctx.lineTo(...p):ctx.moveTo(...p);}ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
  const props=[];
  for(let i=0;i<11;i++){const x=-8+i*1.6;props.push({x,z:-8.7,kind:4,h:1.2+(i*7%5)*.5});}
  for(let i=0;i<7;i++)props.push({x:8.6,z:-6+i*1.9,kind:4,h:1.7+(i*3%5)*.4});
  function draw(){
    const rect=canvas.getBoundingClientRect(),ratio=Math.min(window.devicePixelRatio||1,2);
    if(W!==rect.width||H!==rect.height||canvas.width!==Math.round(rect.width*ratio)){W=rect.width;H=rect.height;canvas.width=Math.round(W*ratio);canvas.height=Math.round(H*ratio);}
    ctx.setTransform(ratio,0,0,ratio,0,0);scale=Math.min(W/29,H/20);ctx.clearRect(0,0,W,H);
    const bg=ctx.createRadialGradient(W*.5,H*.4,0,W*.5,H*.4,W*.7);bg.addColorStop(0,'#203642');bg.addColorStop(1,'#0d1922');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
    // A floating test platform, not a physics terrain or a native renderer.
    box(0,0,19,19,.65,-.75,['#394f58','#142630','#1c3540']);
    for(let x=-9;x<9;x++)for(let z=-9;z<9;z++){
      const path=(x>=-6&&x<=5&&(z===-2||z===3))||(z>=-6&&z<=3&&(x===-6||x===0||x===5));
      quad(x+.5,z+.5,.98,.98,0,path?'#80928e':((x+z)%2?'#536a64':'#586f69'));
    }
    for(let i=-8;i<=8;i+=2){quad(i,-9.3,.65,.1,.02,'#8da68d');quad(-9.3,i,.1,.65,.02,'#8da68d');}
    ring(0,0,2.1,'#a8c8ae35');ring(0,0,2.3,'#a8c8ae15');
    const entities=[];for(let i=0;i<engine._lab_value(1);i++)entities.push({x:engine._lab_entity(i,0),z:engine._lab_entity(i,1),kind:engine._lab_entity(i,2)});
    const items=[...props,...entities];items.sort((a,b)=>(a.x-b.x)*Math.sin(yaw)+(a.z-b.z)*Math.cos(yaw));
    for(const item of items){const {x,z,kind}=item;quad(x+.25,z+.3,kind===4?1.1:.85,kind===4?1.2:.8,.01,'#182f3855');
      if(kind===1){
        ring(x,z,.7,'#d9ef84aa',1.4);box(x,z,.6,.5,.16,0,['#9eafa2','#566863','#6f8677']);
        const bob=reduceMotion?0:Math.sin(visualTime*3)*.025;
        box(x,z,.5,.43,.48,.18+bob,['#f1f7dc','#a7c28a','#cedda9']);
        box(x,z,.39,.38,.28,.7+bob,['#e5f2bf','#829b80','#a7c0a0']);
        box(x-.01,z+.2,.3,.025,.1,.77+bob,['#172e38','#172e38','#172e38']);
        box(x,z,.1,.08,.24,1+bob,['#dbef80','#97a861','#b4c976']);
        const label=project(x,z,1.8);ctx.font='9px monospace';ctx.textAlign='center';ctx.fillStyle='#e1edb4';ctx.fillText('YOU',...label);
      }else if(kind===2){
        const lift=.65+(reduceMotion?0:Math.sin(visualTime*2+x)*.09);ring(x,z,.7,'#efc77677');box(x,z,.65,.65,.12,0,['#9e9c79','#625f4c','#7b785c']);
        box(x,z,.28,.28,.45,lift,['#ffe2a0','#b88f47','#e5b35c']);
        const p=project(x,z,.85);ctx.fillStyle='#f2ce7320';ctx.beginPath();ctx.ellipse(p[0],p[1],scale*.6,scale*.85,0,0,Math.PI*2);ctx.fill();
      }else if(kind===3){box(x,z,.64,.64,.64,0,['#c9b692','#82775f','#a79878']);box(x,z,.12,.66,.02,.64,['#635c4c','#635c4c','#635c4c']);}
      else {box(x,z,.22,.22,.6,0,['#617469','#3c4f47','#485e50']);box(x,z,.95,.95,item.h,.5,['#749782','#3d625b','#527966']);box(x,z,.65,.65,.3,.5+item.h,['#91a98c','#4f7765','#6d9278']);}
    }
    // Four cardinal markers keep controls understandable after camera rotation.
    ctx.font='10px monospace';ctx.textAlign='center';ctx.fillStyle='#8aa2ad';
    for(const [x,z,t] of [[0,-10.3,'W / ↑'],[-10.3,0,'A / ←'],[0,10.3,'S / ↓'],[10.3,0,'D / →']])ctx.fillText(t,...project(x,z));
  }
  function updateUI(){
    const mode=engine._lab_value(3),count=engine._lab_value(2),hash=engine._lab_value(6),expected=engine._lab_value(7),duration=engine._lab_value(5);
    $('seed').textContent=engine._lab_value(10);$('ticks').textContent=engine._lab_value(0).toLocaleString();$('entities').textContent=engine._lab_value(1);$('score').textContent=count;$('progress').style.width=`${count*20}%`;
    $('hash').textContent=hash.toString(16).toUpperCase().padStart(8,'0');
    $('position').textContent=`${engine._lab_entity(0,0).toFixed(2)} / ${engine._lab_entity(0,1).toFixed(2)}`;
    $('mode-label').textContent=['LIVE FIELD','RECORDING','REPLAYING','REPLAY COMPLETE'][mode];
    $('record').textContent=mode===1?'■ Stop recording':'● Record path';$('replay').disabled=!duration||mode===1;
    $('spawn').disabled=mode>=2;$('lock').disabled=mode>=2;$('lock-value').textContent=engine._lab_value(4)?'ON':'OFF';
    $('lock').setAttribute('aria-pressed',String(!!engine._lab_value(4)));
    $('replay-status').textContent=mode===1?`Recording ${(engine._lab_value(0)/60).toFixed(1)}s / 30s`:
      mode===2?`Replaying tick ${engine._lab_value(0)} of ${duration}…`:
      mode===3?(expected?(hash===expected?'Verified: recorded and replayed states match.':'Mismatch: replay ended in a different state.'):'Guided run complete. Reset to explore, or replay it again.'):
      duration?'Recording ready. Replay to verify the final state.':'Up to 30 seconds. Stored only in this tab.';
  }
  function frame(now){const dt=now-last;last=now;if(!document.hidden)engine._lab_advance(dt);visualTime+=Math.min(dt,50)/1000;
    yaw=reduceMotion?targetYaw:yaw+(targetYaw-yaw)*.09;draw();updateUI();requestAnimationFrame(frame);}
  requestAnimationFrame(frame);
})();
