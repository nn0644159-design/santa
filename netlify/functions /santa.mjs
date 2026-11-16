import {getStore} from "@netlify/blobs";
import crypto from "node:crypto";
const T=process.env.BOT_TOKEN,SEC=process.env.WEBHOOK_SECRET,APP=process.env.APP_URL||process.env.URL,
ADM=(process.env.ADMIN_IDS||"").split(",").map(s=>s.trim()),
TIERS={1:{n:"Снежный Санта",p:0},2:{n:"Хрустальный Санта",p:+process.env.PRICE_2||99},3:{n:"Бриллиантовый Санта",p:+process.env.PRICE_3||241}};
const db=()=>getStore({name:"santa",consistency:"strong"}),get=k=>db().get(k,{type:"json"}),set=(k,v)=>db().setJSON(k,v);
const tg=(m,b)=>fetch(`https://api.telegram.org/bot${T}/${m}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(b)}).then(r=>r.json());
const esc=s=>String(s??"").replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
const J=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{"content-type":"application/json"}});
const users=async()=>(await Promise.all((await db().list({prefix:"u:"})).blobs.map(b=>get(b.key)))).filter(Boolean);
const game=async()=>await get("game")||{open:true,pairs:[]};
const nm=u=>u?`${esc(u.name)} ${esc(u.surname)} · ${esc(u.group)}${u.un?" @"+esc(u.un):""}`:"?";
const done=u=>u.wish?.dream&&u.name;
const btn=t=>({inline_keyboard:[[{text:t,web_app:{url:APP}}]]});
const say=async(id,t)=>{for(let i=0;i<t.length;i+=3800)await tg("sendMessage",{chat_id:id,text:t.slice(i,i+3800),parse_mode:"HTML"})};
const paidMap=async()=>{const m={};for(const b of (await db().list({prefix:"c:"})).blobs){const c=await get(b.key);if(c)(m[b.key.split(":")[1]]??={})[c.t]=1}return m};
const myPaid=async id=>{const m={};for(const b of (await db().list({prefix:`c:${id}:`})).blobs){const c=await get(b.key);if(c)m[c.t]=1}return m};
const TZH=+process.env.TZ_H||3,dayKey=()=>new Date(Date.now()+TZH*36e5).toISOString().slice(0,10),cdText=ts=>`🎄 До праздника осталось ${Math.max(0,Math.ceil((ts-Date.now())/864e5))} дн. ❄️`;
const ADMCMDS=[["admin","Панель админа"],["schedule","Автожеребьёвка: 25.12 18:00"],["grouprule","Правило «не из одной группы»"],["preview","Пробная жеребьёвка"],["replace","Замена выбывшего"],["thread","Переписка пары"],["remind","Напомнить без карточки"],["silent","Санты, что не писали"],["nudge","Пнуть молчунов"],["gifted","Кто вручил подарок"],["msg","Личное сообщение"],["ban","Заблокировать"],["unban","Разблокировать"],["settier","Сменить уровень"],["refund","Вернуть звёзды"],["remove","Убрать участника"],["income","Доходы в звёздах"],["export","Выгрузка CSV"],["broadcast","Рассылка"],["countdown","Отсчёт до праздника"],["vote","Конкурс карточек"],["votes","Итоги конкурса"],["refs","Рейтинг рефералов"],["payouts","Кому выплатить комиссию"],["paid","Отметить выплату"],["grant","Подарить уровень"],["revoke","Снять выданные уровни"]].map(([command,description])=>({command,description}));
const refRate=n=>Math.min(15,5+Math.floor(n/3));let BU;const botName=async()=>BU||(BU=(await tg("getMe",{})).result?.username);
const shuffle=a=>a.map(x=>[Math.random(),x]).sort((p,q)=>p[0]-q[0]).map(x=>x[1]);

function auth(init){const p=new URLSearchParams(init),h=p.get("hash");p.delete("hash");
 const s=[...p].map(([k,v])=>k+"="+v).sort().join("\n"),k=crypto.createHmac("sha256","WebAppData").update(T).digest();
 if(!h||crypto.createHmac("sha256",k).update(s).digest("hex")!==h||Date.now()/1000-(+p.get("auth_date")||0)>86400)return null;
 try{return JSON.parse(p.get("user"))}catch{return null}}

export default async req=>{const p=new URL(req.url).pathname;
 if(p=="/setup"){if(new URL(req.url).searchParams.get("key")!==SEC)return new Response("no",{status:403});
  const w=await tg("setWebhook",{url:APP+"/webhook",secret_token:SEC,allowed_updates:["message","callback_query","pre_checkout_query"]});
  const m=await tg("setChatMenuButton",{menu_button:{type:"web_app",text:"🎁 Санта",web_app:{url:APP}}});
  await tg("setMyCommands",{commands:[{command:"start",description:"Открыть Тайного Санту"}]});for(const a of ADM)if(a)await tg("setMyCommands",{commands:ADMCMDS,scope:{type:"chat",chat_id:+a}});return J({w,m})}
 return p=="/webhook"?hook(req):api(req)};
export const config={path:["/api","/webhook","/setup"]};

async function api(req){const tu=auth(req.headers.get("x-init")||"");if(!tu)return J({err:"auth"},401);
 const d=await req.json(),id=String(tu.id),g=await game();let u=await get("u:"+id);
 if(!u){if(!g.open)return J({closed:1});u={id,tier:1,ts:Date.now()}}
 u.un=tu.username||"";const paid=await myPaid(id);Object.assign(paid,u.gr||{});if(u.tier==1&&!u.man){const k=Object.keys(paid);if(k.length)u.tier=+k[k.length-1]}const c=(s,n)=>String(s||"").trim().slice(0,n);
 const pr=g.pairs.find(p=>p.g==id),sp=g.pairs.find(p=>p.r==id);
 if(d.a=="ref"){const n=(await db().list({prefix:`r:${id}:`})).blobs.length;let bal=0,tot=0;for(const b of (await db().list({prefix:`cm:${id}:`})).blobs){const c=await get(b.key);if(c){tot+=c.a;if(!c.p)bal+=c.a}}
  return J({n,rate:refRate(n),next:refRate(n)<15?(Math.floor(n/3)+1)*3-n:0,bal:+bal.toFixed(2),tot:+tot.toFixed(2),link:`https://t.me/${await botName()}?start=ref_${id}`})}
 let nw=0;if(d.a=="save"){nw=!u.wish?.dream;const w=d.w||{};u.name=c(d.name,40);u.surname=c(d.surname,40);u.group=c(d.group,20);
  u.wish={dream:c(w.dream,300),small:c(w.small,200),avoid:c(w.avoid,150),theme:c(w.theme,2),emoji:c(w.emoji,4)}}
 if(d.a=="gifted"&&pr)u.gifted=1;
 if(d.a=="tier"&&!g.drawn){const t=+d.tier;if(t==1||paid[t]){u.tier=t;u.man=1}}
 if(d.a=="invoice"&&!g.drawn&&TIERS[d.tier]?.p){const t=d.tier,r=await tg("createInvoiceLink",{title:TIERS[t].n,description:`Вступление в VIP-сообщество «${TIERS[t].n}»`,payload:`${t}:${id}`,currency:"XTR",prices:[{label:TIERS[t].n,amount:TIERS[t].p}]});return J({link:r.result})}
 if(d.a=="msgs"||d.a=="send"){const gid=d.role=="santa"?(pr?id:null):(sp?sp.g:null);if(!gid)return J({m:[]});
  const text=c(d.text,500);
  if(d.a=="send"&&text&&!u.ban){await set(`m:${gid}:${Date.now()}-${Math.random().toString(36).slice(2,6)}`,{f:d.role=="santa"?"g":"r",t:text});
   await tg("sendMessage",{chat_id:d.role=="santa"?pr.r:gid,text:d.role=="santa"?"🎅 Твой Тайный Санта написал тебе!":"🎁 Твой подопечный ответил!",reply_markup:btn("Открыть чат 💬")})}
  const ks=(await db().list({prefix:`m:${gid}:`})).blobs.map(b=>b.key).sort(),me=d.role=="santa"?"g":"r";
  return J({m:(await Promise.all(ks.map(get))).map(x=>({me:x.f==me,t:x.t}))})}
 await set("u:"+id,u);let ward=null;
 if(nw){const rp=await get("rp:"+id);if(rp&&!(await get(`r:${rp.by}:${id}`))){await set(`r:${rp.by}:${id}`,{ts:Date.now()});await tg("sendMessage",{chat_id:rp.by,text:`🎉 По твоей ссылке присоединился(лась) ${u.name}!`})}
  const n=(await users()).filter(done).length;for(const a of ADM)if(a)await tg("sendMessage",{chat_id:a,parse_mode:"HTML",text:`🆕 Новый участник #${n}: ${nm(u)}\nУровень: ${TIERS[u.tier].n}`})}
 if(pr){const w=await get("u:"+pr.r);ward=w&&{name:w.name,surname:w.surname,group:w.group,wish:w.wish}}
 return J({u:{name:u.name,surname:u.surname,group:u.group,wish:u.wish,tier:u.tier,paid},open:g.open,drawn:!!g.drawn,ward,hasSanta:!!sp,gifted:!!u.gifted,tiers:TIERS})}

async function hook(req){if(req.headers.get("x-telegram-bot-api-secret-token")!==SEC)return new Response("no",{status:403});
 const up=await req.json();
 try{if(up.pre_checkout_query)await tg("answerPreCheckoutQuery",{pre_checkout_query_id:up.pre_checkout_query.id,ok:!(await game()).drawn,error_message:"Жеребьёвка уже прошла"});
  else if(up.callback_query)await cb(up.callback_query);
  else if(up.message)await msg(up.message)}catch(e){console.error(e)}
 return new Response("ok")}

async function msg(m){const id=String(m.from.id),sp=m.successful_payment;
 if(sp){const t=sp.invoice_payload.split(":")[0];await set(`c:${id}:${sp.telegram_payment_charge_id}`,{t,id:sp.telegram_payment_charge_id});const pu=await get("u:"+id);await commission(id,t,sp.telegram_payment_charge_id);for(const a of ADM)if(a)await tg("sendMessage",{chat_id:a,parse_mode:"HTML",text:`💰 Оплата ${TIERS[t].p}⭐: ${pu?nm(pu):id} → ${TIERS[t].n}`});
  {
   await tg("sendMessage",{chat_id:id,text:`✨ Добро пожаловать в «${TIERS[t].n}»! Оплата получена.`,reply_markup:btn("Открыть Санту 🎁")})}return}
 const [cmd,...a]=(m.text||"").split(" ");
 if(cmd=="/start"&&a[0]?.startsWith("ref_")){const by=a[0].slice(4);if(by!=id&&!(await get("u:"+id))&&!(await get("rp:"+id))&&await get("u:"+by))await set("rp:"+id,{by})}
 if(ADM.includes(id)&&await admin(id,cmd,a))return;
 await tg("sendMessage",{chat_id:id,parse_mode:"HTML",text:`🎄 <b>Тайный Санта</b>\n\nЗаполни карточку желаний и выбери своего Санту:\n\n❄️ <b>Снежный</b> — бесплатно. Уютное сообщество, тёплые душевные подарки.\n✨ <b>Хрустальный</b> — ${TIERS[2].p}⭐. VIP-круг: желания участников заметно дороже.\n💎 <b>Бриллиантовый</b> — ${TIERS[3].p}⭐. Премиум-круг самых щедрых подарков.\n\nЖеребьёвка пройдёт позже — следи за уведомлениями.`,reply_markup:btn("🎁 Открыть Тайного Санту")})}

const PANEL={inline_keyboard:[[{text:"📊 Статистика",callback_data:"st"},{text:"👥 Участники",callback_data:"ls"}],[{text:"🔍 Кто с кем",callback_data:"pr"},{text:"🎲 Жеребьёвка",callback_data:"dr"}],[{text:"🔓 Вкл/выкл регистрацию",callback_data:"op"},{text:"♻️ Сброс игры",callback_data:"rs"}],[{text:"📈 Доходы",callback_data:"inc"},{text:"📤 Экспорт",callback_data:"ex"}],[{text:"⏰ Напомнить",callback_data:"rm"},{text:"🧪 Проба",callback_data:"pv"}],[{text:"🎁 Подарки",callback_data:"gf"},{text:"🤫 Молчуны",callback_data:"sl"}],[{text:"📣 Пнуть молчунов",callback_data:"nd"},{text:"🏆 Итоги конкурса",callback_data:"vs"}]]};
async function admin(id,cmd,a){const A=t=>say(id,t);
 const M={"/remind":"rm","/preview":"pv","/gifted":"gf","/silent":"sl","/nudge":"nd","/income":"inc","/export":"ex","/votes":"vs"};if(M[cmd]){await cb({id:"0",from:{id:+id},data:M[cmd]});return 1}
 if(cmd=="/admin"){await tg("sendMessage",{chat_id:id,parse_mode:"HTML",text:"🎅 <b>Админ-панель</b>\n\n<b>Игра</b>\n/schedule 25.12 18:00 — автожеребьёвка (/schedule off)\n/grouprule — не давать людям из одной группы друг другу\n/preview — пробная жеребьёвка\n/replace СТАРЫЙ НОВЫЙ — замена выбывшего\n/thread N — переписка пары\n\n<b>Участники</b>\n/remind — напомнить тем, кто без карточки\n/silent, /nudge — Санты, что не писали\n/gifted — кто вручил подарок\n/msg ID текст — личное сообщение\n/ban ID, /unban ID\n/settier ID 1|2|3, /refund ID, /remove ID\n\n<b>Учёт</b>\n/income — звёзды, /export — таблица CSV\n/broadcast текст — рассылка\n/countdown 01.01 — отсчёт с закрепом\n/vote, /votes — конкурс карточек\n\n<b>Рефералы</b>\n/refs — рейтинг приглашений\n/payouts — кому сколько выплатить\n/paid ID — отметить выплату\n\n<b>Выдача уровней</b>\n/grant ID 2|3 — подарить уровень без оплаты\n/revoke ID — снять выданные",reply_markup:PANEL});return 1}
 if(cmd=="/schedule"){const g=await game();if(a[0]=="off"){g.sched=0;await set("game",g);await A("Автожеребьёвка выключена");return 1}
  const m=(a[0]||"").match(/^(\d+)\.(\d+)$/),t=(a[1]||"").match(/^(\d+):(\d+)$/);if(!m||!t){await A("Формат: /schedule 25.12 18:00 или /schedule off");return 1}
  const Y=new Date().getFullYear();let ts=Date.UTC(Y,m[2]-1,m[1],t[1]-TZH,t[2]);if(ts<Date.now())ts=Date.UTC(Y+1,m[2]-1,m[1],t[1]-TZH,t[2]);
  g.sched=ts;await set("game",g);await A(`⏰ Жеребьёвка запланирована на ${a[0]} ${a[1]} (UTC+${TZH}). Проверка раз в 5 минут.`);return 1}
 if(cmd=="/grouprule"){const g=await game();g.ng=!g.ng;await set("game",g);await A(g.ng?"✅ Одногруппники не будут выпадать друг другу (если это возможно)":"Правило групп выключено");return 1}
 if(cmd=="/msg"){await tg("sendMessage",{chat_id:a[0],text:"📩 "+a.slice(1).join(" ")});await A("Отправлено");return 1}
 if(cmd=="/ban"||cmd=="/unban"){const u=await get("u:"+a[0]);if(!u){await A("Не найден");return 1}u.ban=cmd=="/ban"?1:0;await set("u:"+u.id,u);await A("Готово ✅");return 1}
 if(cmd=="/replace"){const g=await game(),[o,n]=a,nu=await get("u:"+n);
  if(!g.drawn||!nu||!done(nu)||g.pairs.some(p=>p.g==n||p.r==n)){await A("Нужны: проведённая жеребьёвка, новый участник с карточкой и вне пар");return 1}
  let hit=0;g.pairs.forEach(p=>{if(p.g==o){p.g=n;hit=1}if(p.r==o){p.r=n;hit=1}});if(!hit){await A("Старый участник не в парах");return 1}
  for(const b of (await db().list({prefix:`m:${o}:`})).blobs){const v=await get(b.key);await set(`m:${n}:`+b.key.split(":").slice(2).join(":"),v);await db().delete(b.key)}
  await set("game",g);const ou=await get("u:"+o);if(ou){ou.ban=1;await set("u:"+o,ou)}
  for(const p of g.pairs.filter(p=>p.g==n||p.r==n))for(const t of [p.g,p.r])await tg("sendMessage",{chat_id:t,text:"🔄 В вашей паре произошла замена — загляни в приложение.",reply_markup:btn("Открыть")});
  await A("Замена выполнена ✅");return 1}
 if(cmd=="/countdown"){const m=(a[0]||"").match(/^(\d+)\.(\d+)$/);if(!m){await A("Формат: /countdown 01.01");return 1}
  const g=await game(),Y=new Date().getFullYear();let ts=Date.UTC(Y,m[2]-1,m[1],-TZH);if(ts<Date.now())ts=Date.UTC(Y+1,m[2]-1,m[1],-TZH);g.cd={ts,ids:{},last:dayKey()};
  for(const u of (await users()).filter(done)){const r=await tg("sendMessage",{chat_id:u.id,text:cdText(ts)});if(r.result){g.cd.ids[u.id]=r.result.message_id;await tg("pinChatMessage",{chat_id:u.id,message_id:r.result.message_id,disable_notification:true})}}
  await set("game",g);await A("Отсчёт запущен и закреплён");return 1}
 if(cmd=="/vote"){const g=await game();if(a[0]=="end"){g.vote={on:0};await set("game",g);await cb({id:"0",from:{id:+id},data:"vs"});return 1}
  g.vote={on:1};await set("game",g);for(const b of (await db().list({prefix:"v:"})).blobs)await db().delete(b.key);
  const ok=(await users()).filter(u=>done(u)&&!u.ban);
  for(const u of ok){const c=shuffle(ok.filter(x=>x.id!=u.id)).slice(0,8);
   await tg("sendMessage",{chat_id:u.id,parse_mode:"HTML",text:"🏆 <b>Конкурс: лучшее желание!</b>\n\n"+c.map((x,i)=>`${i+1}. «${esc(x.wish.dream.slice(0,70))}»`).join("\n"),reply_markup:{inline_keyboard:[c.map((x,i)=>({text:String(i+1),callback_data:"v:"+x.id}))]}})}
  await A(`Голосование запущено: ${ok.length}. Закрыть: /vote end`);return 1}
 if(cmd=="/refs"||cmd=="/payouts"){const by=Object.fromEntries((await users()).map(u=>[u.id,u])),n={},bal={};
  for(const b of (await db().list({prefix:"r:"})).blobs){const k=b.key.split(":")[1];n[k]=(n[k]||0)+1}
  for(const b of (await db().list({prefix:"cm:"})).blobs){const c=await get(b.key);if(c&&!c.p){const k=b.key.split(":")[1];bal[k]=(bal[k]||0)+c.a}}
  const ids=[...new Set([...Object.keys(n),...Object.keys(bal)])].sort((x,y)=>cmd=="/payouts"?(bal[y]||0)-(bal[x]||0):(n[y]||0)-(n[x]||0));
  await A((cmd=="/refs"?"👥 <b>Рефералы</b>":"💸 <b>К выплате</b>")+"\n"+(ids.map(k=>`<code>${k}</code> ${nm(by[k])} · приглашено ${n[k]||0} (${refRate(n[k]||0)}%) · к выплате ${(bal[k]||0).toFixed(2)}⭐`).join("\n")||"Пока пусто"));return 1}
 if(cmd=="/paid"){let s=0;for(const b of (await db().list({prefix:`cm:${a[0]}:`})).blobs){const c=await get(b.key);if(c&&!c.p){c.p=1;s+=c.a;await set(b.key,c)}}
  await tg("sendMessage",{chat_id:a[0],text:`✅ Комиссия ${s.toFixed(2)}⭐ выплачена. Спасибо, что зовёшь друзей!`});await A(`Отмечено выплаченным: ${s.toFixed(2)}⭐`);return 1}
 if(cmd=="/grant"||cmd=="/revoke"){const u=await get("u:"+a[0]),t=+a[1];if(!u){await A("Участник не найден (он должен хотя бы раз открыть приложение)");return 1}
  if(cmd=="/grant"){if(!(t==2||t==3)){await A("Формат: /grant ID 2|3");return 1}if((await game()).drawn){await A("Жеребьёвка уже прошла");return 1}
   u.gr={...u.gr,[t]:1};u.tier=t;u.man=1;await set("u:"+u.id,u);await tg("sendMessage",{chat_id:u.id,text:`🎁 Тебе подарили доступ: «${TIERS[t].n}»!`,reply_markup:btn("Открыть")});await A(`Выдано: ${nm(u)} → ${TIERS[t].n}`)}
  else{u.gr={};u.tier=1;await set("u:"+u.id,u);await A("Выданные уровни сняты")}return 1}
 if(cmd=="/thread"){const g=await game(),p=g.pairs.find(p=>p.n==a[0]);if(!p){await A("Пара не найдена");return 1}
  const ks=(await db().list({prefix:`m:${p.g}:`})).blobs.map(b=>b.key).sort(),ms=await Promise.all(ks.map(get));
  await A(`<b>Пара #${p.n}</b>\n`+(ms.map(x=>`${x.f=="g"?"🎅 Санта":"🎁 Подопечный"}: ${esc(x.t)}`).join("\n")||"Сообщений нет"));return 1}
 if(cmd=="/broadcast"){const t=a.join(" ");if(!t)return 1;const us=(await users()).filter(done);
  for(let i=0;i<us.length;i+=20)await Promise.all(us.slice(i,i+20).map(u=>tg("sendMessage",{chat_id:u.id,text:"📣 "+t,reply_markup:btn("🎁 Открыть")})));
  await A(`Отправлено: ${us.length}`);return 1}
 if(cmd=="/settier"||cmd=="/refund"||cmd=="/remove"){const u=await get("u:"+a[0]);if(!u){await A("Участник не найден");return 1}
  if(cmd=="/remove")await db().delete("u:"+u.id);
  else if(cmd=="/settier"&&TIERS[a[1]]){u.tier=+a[1];u.adm=1;await set("u:"+u.id,u)}
  else if(cmd=="/refund"){for(const b of (await db().list({prefix:`c:${u.id}:`})).blobs){const c=await get(b.key);await tg("refundStarPayment",{user_id:+u.id,telegram_payment_charge_id:c.id});await db().delete(b.key);for(const k of (await db().list({prefix:"cm:"})).blobs)if(k.key.endsWith(":"+c.id))await db().delete(k.key)}u.tier=1;u.adm=0;await set("u:"+u.id,u)}
  await A("Готово ✅");return 1}}

async function cb(q){const id=String(q.from.id);await tg("answerCallbackQuery",{callback_query_id:q.id});if(q.data?.startsWith("v:"))return vote(id,q);if(!ADM.includes(id))return;
 const us=await users(),g=await game(),d=q.data,pd=await paidMap(),ok=us.filter(done),by=Object.fromEntries(us.map(u=>[u.id,u])),A=t=>say(id,t);
 const inT=(u,t)=>u.tier==t&&(t==1||pd[u.id]?.[t]||u.adm||u.gr?.[t]);
 if(d=="st")await A(`📊 <b>Статистика</b>\nЗашли: ${us.length}\nС карточкой: ${ok.length}\n`+[1,2,3].map(t=>`${TIERS[t].n}: ${ok.filter(u=>inT(u,t)).length}`).join("\n")+`\nРегистрация: ${g.open?"открыта":"закрыта"}\nЖеребьёвка: ${g.drawn?"проведена":"не проводилась"}`);
 if(d=="ls")await A(ok.map(u=>`<code>${u.id}</code> ${nm(u)} · ур.${u.tier}`).join("\n")||"Пока никого");
 if(d=="pr")await A(g.pairs.map(p=>`#${p.n} [${p.t}] ${nm(by[p.g])} → ${nm(by[p.r])}`).join("\n")||"Жеребьёвки ещё не было");
 if(d=="dr")await tg("sendMessage",{chat_id:id,text:g.drawn?"Жеребьёвка уже проведена.":`Запустить жеребьёвку для ${ok.length} участников?`,reply_markup:g.drawn?undefined:{inline_keyboard:[[{text:"✅ Да, запустить",callback_data:"dr!"}]]}});
 if(d=="dr!")await A(await doDraw());
 if(d=="op"){g.open=!g.open;await set("game",g);await A(g.open?"🔓 Регистрация открыта":"🔒 Регистрация закрыта")}
 if(d=="rs")await tg("sendMessage",{chat_id:id,text:"Сбросить пары и всю переписку?",reply_markup:{inline_keyboard:[[{text:"♻️ Да, сбросить",callback_data:"rs!"}]]}});
 if(d=="rs!"){for(const b of (await db().list({prefix:"m:"})).blobs)await db().delete(b.key);await set("game",{open:true,pairs:[],ng:g.ng});await A("Игра сброшена")}
 await extra(id,d,g,us,pd,ok,by,A)}

const inTier=(u,t,pd)=>u.tier==t&&(t==1||pd[u.id]?.[t]||u.adm||u.gr?.[t]);
function makePairs(ok,pd,ng){const pairs=[],skip=[];
 for(const t of [1,2,3]){const a=ok.filter(u=>inTier(u,t,pd));if(a.length<3){if(a.length)skip.push(`${TIERS[t].n}: ${a.length} чел.`);continue}
  let best=null;for(let k=0;k<300&&!best;k++){const s=shuffle(a);if(!ng||s.every((u,i)=>String(u.group).toLowerCase()!=String(s[(i+1)%s.length].group).toLowerCase()))best=s}
  if(!best){best=shuffle(a);skip.push(`${TIERS[t].n}: группы не удалось развести, пары смешаны`)}
  best.forEach((u,i)=>pairs.push({n:pairs.length+1,g:u.id,r:best[(i+1)%best.length].id,t}))}
 return {pairs,skip}}
export async function doDraw(){const g=await game();if(g.drawn)return "Жеребьёвка уже проведена";
 const ok=(await users()).filter(u=>done(u)&&!u.ban),{pairs,skip}=makePairs(ok,await paidMap(),g.ng);
 g.open=false;g.drawn=Date.now();g.pairs=pairs;g.sched=0;await set("game",g);
 for(let i=0;i<pairs.length;i+=20)await Promise.all(pairs.slice(i,i+20).map(p=>tg("sendMessage",{chat_id:p.g,text:"🎄 Жеребьёвка состоялась! Узнай, кому ты даришь подарок 🎁",reply_markup:btn("Узнать")})));
 return `🎲 Готово: пар ${pairs.length}.`+(skip.length?`\n⚠️ Пропущено/замечания:\n${skip.join("\n")}\nМало людей (<3) можно перенести через /settier.`:"")}
export async function tick(){const g=await game();
 if(g.sched&&!g.drawn&&Date.now()>=g.sched){const r=await doDraw();for(const a of ADM)if(a)await say(a,"⏰ Автожеребьёвка\n"+r)}
 if(g.cd&&g.cd.last!=dayKey()){const g2=await game();g2.cd.last=dayKey();await set("game",g2);for(const [u,m] of Object.entries(g2.cd.ids))await tg("editMessageText",{chat_id:u,message_id:m,text:cdText(g2.cd.ts)})}}
async function vote(id,q){const g=await game();if(!g.vote?.on)return;await set("v:"+id,{c:q.data.slice(2)});await tg("sendMessage",{chat_id:id,text:"💚 Голос принят! Можно переголосовать."})}
async function extra(id,d,g,us,pd,ok,by,A){
 const cnt=async()=>{const c={};for(const b of (await db().list({prefix:"m:"})).blobs){const m=await get(b.key);if(m)(c[b.key.split(":")[1]]??={g:0,r:0})[m.f]++}return c};
 if(d=="rm"){const l=us.filter(u=>!done(u));for(const u of l)await tg("sendMessage",{chat_id:u.id,text:"⏰ Ты ещё не заполнил(а) карточку желаний! Без неё жеребьёвка тебя не учтёт.",reply_markup:btn("Заполнить 🎁")});await A(`Напомнил: ${l.length}`)}
 if(d=="pv"){const {pairs,skip}=makePairs(ok.filter(u=>!u.ban),pd,g.ng);await A("🧪 <b>Проба (ничего не сохранено)</b>\n"+pairs.map(p=>`#${p.n} [${p.t}] ${nm(by[p.g])} → ${nm(by[p.r])}`).join("\n")+(skip.length?"\n⚠️ "+skip.join("; "):""))}
 if(d=="gf"){const n=g.pairs.filter(p=>by[p.g]?.gifted).length;await A(`🎁 Вручили: ${n} из ${g.pairs.length}\nЕщё нет:\n`+g.pairs.filter(p=>!by[p.g]?.gifted).map(p=>nm(by[p.g])).join("\n"))}
 if(d=="sl"||d=="nd"){const c=await cnt(),l=g.pairs.filter(p=>!c[p.g]?.g);
  if(d=="sl")await A(`🤫 Не писали подопечному: ${l.length}\n`+l.map(p=>nm(by[p.g])).join("\n"));
  else{for(const p of l)await tg("sendMessage",{chat_id:p.g,text:"🎅 Твой подопечный ждёт весточки! Напиши ему пару слов.",reply_markup:btn("Написать 💬")});await A(`Напомнил Сантам: ${l.length}`)}}
 if(d=="inc"){const t={};for(const u in pd)for(const k in pd[u])t[k]=(t[k]||0)+1;let s=0;const rows=[2,3].map(k=>{const n=t[k]||0;s+=n*TIERS[k].p;return `${TIERS[k].n}: ${n} × ${TIERS[k].p}⭐ = ${n*TIERS[k].p}⭐`});await A("📈 <b>Доходы</b>\n"+rows.join("\n")+`\nИтого: ${s}⭐`)}
 if(d=="ex"){const rows=[["id","username","name","surname","group","tier","gifted","gives_to"],...us.map(u=>{const p=g.pairs.find(p=>p.g==u.id);return [u.id,u.un,u.name,u.surname,u.group,u.tier,u.gifted?1:0,p&&by[p.r]?`${by[p.r].name} ${by[p.r].surname}`:""]})];
  const csv="\ufeff"+rows.map(r=>r.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\n"),fd=new FormData();fd.append("chat_id",id);fd.append("document",new Blob([csv],{type:"text/csv"}),"santa.csv");await fetch(`https://api.telegram.org/bot${T}/sendDocument`,{method:"POST",body:fd})}
 if(d=="vs"){const c={};for(const b of (await db().list({prefix:"v:"})).blobs){const v=await get(b.key);if(v)c[v.c]=(c[v.c]||0)+1}
  await A("🏆 <b>Итоги конкурса</b>\n"+(Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([k,n],i)=>`${i+1}. ${nm(by[k])} — ${n}`).join("\n")||"Голосов нет"))}}

async function commission(id,t,cid){const rp=await get("rp:"+id);if(!rp)return;
 const n=(await db().list({prefix:`r:${rp.by}:`})).blobs.length,r=refRate(n),a=+(TIERS[t].p*r/100).toFixed(2);
 await set(`cm:${rp.by}:${cid}`,{f:id,t,r,a,p:0,ts:Date.now()});
 await tg("sendMessage",{chat_id:rp.by,text:`💸 Друг оплатил Санту: тебе +${a}⭐ комиссии (${r}%).`})}
