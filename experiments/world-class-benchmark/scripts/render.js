import{cases,variantCopy}from"./cases.js";
import{bindInteractions}from"./interactions.js";
document.documentElement.classList.add("js");
const params=new URLSearchParams(location.search);
const caseId=params.get("case")||"d01";
const variant=params.get("variant")||"art-directed";
const data=cases[caseId]||cases.d01;
document.body.dataset.case=caseId;
document.body.dataset.variant=variant;
document.querySelector("#case-select").value=caseId;
document.querySelector("#variant-select").value=variant;
const icon=(name)=>`<i class="ph ph-${name}" aria-hidden="true"></i>`;
const orchestrationVariants=["orchestrated-content-led","orchestrated-golden","orchestrated-selected","art-directed"];
if(orchestrationVariants.includes(variant)){
  if(caseId==="d01")renderArchitectureTrial();
  else if(caseId==="d02")renderNutritionTrial();
  else renderPlanningTrial();
}else{renderLegacy()}

function renderLegacy(){
const image=data.image?`<img src="${data.image}" alt="${caseId==="d01"?"Contemporary timber home at mountain dusk":"Colorful grain bowl with vegetables"}" width="1254" height="1254">`:productVisual();
const cards=data.sections.map((x,i)=>`<article class="card reveal"><span class="eyebrow">0${i+1}</span><strong>${x}</strong><p>${["Make the hierarchy visible before adding detail.","Let every state preserve the same spatial promise.","Use one memorable move, then exercise restraint."][i]}</p></article>`).join("");
document.querySelector("#app").innerHTML=`
<nav class="page-nav"><a class="brand" href="#top">${data.brand}</a><div class="nav-links"><a href="#system">System</a><a href="#method">Method</a><a href="#contact">Contact</a></div><a class="button secondary" href="#contact">${data.cta} ${icon("arrow-up-right")}</a></nav>
<section class="hero" id="top"><div class="hero-copy"><p class="eyebrow">${variantCopy[variant].prefix} · ${data.eyebrow}</p><h1>${data.title}</h1><p class="lede">${data.lede} ${variantCopy[variant].suffix}</p><div class="actions"><a class="button" href="#contact">${data.cta} ${icon("arrow-right")}</a><a class="button secondary" href="#system">Explore ${icon("caret-down")}</a></div>${caseId==="d02"?energyArc():""}</div><div class="visual">${image}</div></section>
<section class="section system-section system-${caseId}" id="system"><div class="section-head reveal"><p class="eyebrow">The system</p><h2>${data.sectionTitle}</h2><p class="lede">${data.sectionCopy}</p></div><div class="topic-composition">${extra(data.extra)}<div class="grid-three">${cards}</div>${topicDetail()}</div></section>
<section class="section method-section" id="method"><div class="section-head reveal"><p class="eyebrow">The method</p><h2>${data.methodTitle}</h2></div>${methodSequence()}</section>
<section class="section" id="contact"><p class="eyebrow">Begin</p><h2>${data.cta}.</h2><a class="button" href="mailto:hello@example.com">${data.cta} ${icon("arrow-up-right")}</a></section>`;
}

function renderArchitectureTrial(){
const proportion=variant.replace("orchestrated-","");
document.querySelector("#app").innerHTML=`
<nav class="page-nav architecture-nav"><a class="brand" href="#top">Ranty</a><div class="nav-links"><a href="#land">The land</a><a href="#material">Material</a><a href="#method">Method</a></div><a class="button secondary" href="#contact">Start a project ${icon("arrow-up-right")}</a></nav>
<section class="architecture-hero" id="top">
  <div class="architecture-hero-copy reveal"><h1>Home, shaped by land.</h1><p class="lede">Site-specific residences shaped by mountain light, durable material, and the rituals of daily life.</p><a class="button" href="#land">See our approach ${icon("arrow-down")}</a></div>
  <figure class="architecture-hero-media reveal"><img src="${data.image}" alt="Contemporary timber home settled into a mountain landscape" width="1254" height="1254"><figcaption><strong>Lang Biang House</strong><span>Da Lat, Vietnam</span></figcaption></figure>
  <div class="architecture-facts" aria-label="Project principles"><span><strong>01</strong> Read the land</span><span><strong>02</strong> Frame daily rituals</span><span><strong>03</strong> Build for time</span></div>
</section>
<section class="land-section" id="land">
  <div class="land-statement reveal"><p>Before a plan, there is a place.</p><h2>Light, slope, wind, and memory set the first lines.</h2></div>
  <figure class="land-diagram reveal"><img src="./assets/media/d01-site-analysis-v2.webp" alt="Architectural site study showing a courtyard home shaped by mountain slope and morning light" width="1024" height="1536"><figcaption aria-label="Site forces shaping the home"><span class="force force-light">${icon("sun")} Morning light</span><span class="force force-wind">${icon("wind")} Valley wind</span><span class="force force-view">${icon("mountains")} Ridge view</span></figcaption></figure>
</section>
<section class="material-section" id="material">
  <div class="material-intro reveal"><h2>Materials that become more themselves.</h2><p>Each surface is chosen for climate, touch, and the character it gains through use.</p></div>
  <div class="material-ledger reveal">
    <article class="material timber"><img src="./assets/media/d01-material-timber-v2.webp" alt="Detailed timber battens and handrail in a mountain home" width="1024" height="1536"><span>Timber</span><strong>Warmth where hands meet the home</strong></article>
    <article class="material stone"><img src="./assets/media/d01-material-stone-v2.webp" alt="Rough local stone wall beside a mountain-facing window" width="1024" height="1536"><span>Stone</span><strong>Weight drawn from the site</strong></article>
    <article class="material plaster"><img src="./assets/media/d01-material-plaster-v2.webp" alt="Soft daylight moving across hand-applied mineral plaster" width="1024" height="1536"><span>Mineral plaster</span><strong>Soft light across quiet rooms</strong></article>
  </div>
</section>
<section class="architecture-process" id="method">
  <div class="process-heading reveal"><span>One home, four decisions</span><h2>A sequence you can see and question.</h2></div>
  <ol class="process-path">
    ${data.method.map((title,index)=>`<li class="reveal"><span>0${index+1}</span><div><h3>${title}</h3><p>${data.methodCopy[index]}</p></div>${icon(["compass","bounding-box","stack","hammer"][index])}</li>`).join("")}
  </ol>
</section>
<section class="architecture-conclusion" id="contact">
  <div class="conclusion-landscape" aria-hidden="true"></div>
  <div class="conclusion-copy reveal"><h2>Bring us the land. We will begin with the right questions.</h2><a class="button" href="mailto:hello@example.com">Start a project ${icon("arrow-up-right")}</a></div>
  <footer><a class="brand" href="#top">Ranty</a><span>Architecture for mountain living</span><span>Da Lat, Vietnam</span></footer>
</section>`;
document.body.dataset.proportion=proportion;
}

function renderNutritionTrial(){
document.querySelector("#app").innerHTML=`
<nav class="page-nav trial-nav"><a class="brand" href="#top">Noura</a><div class="nav-links"><a href="#decode">Decode</a><a href="#day">Your day</a><a href="#next">What is next</a></div><a class="button secondary" href="#decode">Scan a meal ${icon("scan")}</a></nav>
<section class="nutrition-hero trial-hero" id="top"><div class="trial-copy reveal"><h1>Your food, understood in a glance.</h1><p class="lede">Scan a plate, understand its energy, and choose what supports the rest of your day.</p><a class="button" href="#decode">Scan a meal ${icon("scan")}</a></div><figure class="trial-hero-media reveal"><img src="./assets/media/d02-bowl.webp" alt="Colorful grain bowl ready to scan" width="1254" height="1254"></figure></section>
<section class="nutrition-decode trial-split" id="decode"><div class="trial-section-copy reveal"><h2>See ingredients before numbers.</h2><p>Noura starts with recognizable food, then explains the estimate without pretending a photo is laboratory data.</p><div class="nutrition-facts"><span><strong>Quinoa</strong> steady energy</span><span><strong>Chickpeas</strong> plant protein</span><span><strong>Greens</strong> fiber and volume</span></div></div><figure class="trial-evidence reveal"><img src="./assets/media/d02-meal-analysis-v2.webp" alt="Quinoa bowl with clearly visible vegetables and whole ingredients" width="1536" height="1152"></figure></section>
<section class="nutrition-day" id="day"><div class="nutrition-day-ring reveal"><strong>72%</strong><span>of today’s energy range</span></div><div class="nutrition-day-copy reveal"><h2>One meal in the context of a day.</h2><p>Breakfast and lunch already shape what “balanced” means next. The state stays live, readable, and adjustable.</p>${customSelect("Adjust today’s focus",["Steady energy","Higher protein","More plants","Lighter evening"])}</div></section>
<section class="nutrition-next trial-split" id="next"><figure class="trial-evidence reveal"><img src="./assets/media/d02-next-meal-v2.webp" alt="Simple tofu noodle dinner being set on a kitchen table" width="1024" height="1280"></figure><div class="trial-section-copy reveal"><h2>A useful next choice, not another score.</h2><p>Recommendations account for time, appetite, and what is already available, so the advice can survive a weekday.</p><a class="button secondary" href="#contact">See tonight’s options ${icon("arrow-right")}</a></div></section>
<section class="trial-conclusion nutrition-conclusion" id="contact"><div><h2>Scan less. Understand more.</h2><p>Food guidance that ends in a decision you can actually use.</p><a class="button" href="mailto:hello@example.com">Try Noura ${icon("arrow-up-right")}</a></div></section>`;
document.body.dataset.proportion=variant.replace("orchestrated-","");
}

function renderPlanningTrial(){
document.querySelector("#app").innerHTML=`
<nav class="page-nav trial-nav"><a class="brand" href="#top">ChronoTask</a><div class="nav-links"><a href="#path">Decision path</a><a href="#context">Context</a><a href="#connect">Connections</a></div><a class="button secondary" href="#contact">Get a demo ${icon("arrow-up-right")}</a></nav>
<section class="planning-hero trial-hero" id="top"><div class="trial-copy reveal"><h1>Turn intent into visible progress.</h1><p class="lede">Keep reasoning, ownership, and the next decision attached to the work they move.</p><a class="button" href="#path">Follow a decision ${icon("arrow-down")}</a></div>
  <div class="decision-canvas reveal" aria-label="Interactive decision path">
    <header><span>Decision path</span><strong><i aria-hidden="true"></i> 3 of 4 resolved</strong></header>
    <div class="decision-map">
      <article class="decision-node outcome-node">${icon("target")}<span>Outcome</span><strong>Reduce handoff time</strong><small>Success means one clear owner at every transition.</small></article>
      <button class="decision-node owner-node" type="button" data-decision-action>${icon("user-focus")}<span>Next decision</span><strong data-decision-label>Confirm the owner</strong><small>Product operations</small></button>
      <article class="decision-node signal-node">${icon("pulse")}<span>New signal</span><strong>Two dependencies changed</strong><small>Updated 8 minutes ago</small></article>
      <article class="decision-node context-node">${icon("chat-circle-dots")}<span>Context preserved</span><strong>Why this moved</strong><small>Scope changed after customer review.</small></article>
      <article class="decision-ready">${icon("check-circle")}<div><span>Ready to move</span><strong data-decision-status>Waiting on owner</strong></div></article>
    </div>
  </div>
</section>
<section class="planning-path" id="path"><div class="trial-section-copy reveal"><h2>A decision path people can explain.</h2><p>The component is real HTML, so ownership and state remain accessible, responsive, and interactive.</p></div><ol class="decision-steps reveal"><li><strong>Frame the outcome</strong><span>What changes when this ships?</span></li><li><strong>Name the decision</strong><span>Who moves it and what blocks them?</span></li><li><strong>Read the signal</strong><span>What changed while work was moving?</span></li></ol></section>
<section class="planning-context trial-split" id="context"><figure class="trial-evidence reveal"><img src="./assets/media/d03-decision-room-v2.webp" alt="Product team mapping a connected decision path on a glass wall" width="1536" height="960"></figure><div class="trial-section-copy reveal"><h2>Software supports the conversation. It does not replace it.</h2><p>ChronoTask preserves the outcome and reasoning after the meeting, when context usually starts to disappear.</p></div></section>
<section class="planning-connect" id="connect"><div class="trial-section-copy reveal"><h2>Connected to where work already moves.</h2><p>Signals arrive from the tools your team uses. ChronoTask keeps the decision attached.</p></div><div class="integration-field reveal"><div class="logo-row"><img src="./assets/logos/gmail.svg" alt="Gmail"><img src="./assets/logos/slack.svg" alt="Slack"><img src="./assets/logos/google-calendar.svg" alt="Google Calendar"></div>${customSelect("Choose a signal source",["Gmail","Slack","Google Calendar"])}</div></section>
<section class="trial-conclusion planning-conclusion" id="contact"><img src="./assets/media/d03-conclusion-v2.webp" alt="" aria-hidden="true"><div><h2>Ship the work. Keep the reason.</h2><a class="button" href="mailto:hello@example.com">Get a demo ${icon("arrow-up-right")}</a></div></section>`;
document.body.dataset.proportion=variant.replace("orchestrated-","");
}
bindInteractions();
document.querySelectorAll("select").forEach((select)=>select.addEventListener("change",()=>{const q=new URLSearchParams({case:document.querySelector("#case-select").value,variant:document.querySelector("#variant-select").value});location.search=q}));

function productVisual(){return`<div class="task-demo"><span class="eyebrow">Launch system · 68%</span><h3>Decision path</h3><div class="route-line"></div><div class="grid-three"><div class="card">Brief</div><div class="card">Review</div><div class="card">Ship</div></div></div>`}
function methodSequence(){return`<div class="method-sequence reveal"><div class="method-progress" aria-hidden="true"><span></span></div>${data.method.map((title,index)=>`<article class="method-step"><button type="button" aria-expanded="${index===0}" aria-controls="method-copy-${index}"><span>0${index+1}</span><strong>${title}</strong><i class="ph ph-plus" aria-hidden="true"></i></button><p id="method-copy-${index}">${data.methodCopy[index]}</p></article>`).join("")}</div>`}
function topicDetail(){if(caseId==="d01")return`<aside class="architecture-note reveal"><span class="eyebrow">Sections 01-04</span><strong>Light enters from the ridge.</strong><span>14° roof pitch</span></aside>`;if(caseId==="d02")return`<aside class="nutrition-orbit reveal" aria-label="Daily nutrition balance"><span><strong>72</strong>%</span><p>Balanced for today</p></aside>`;return`<aside class="planning-signal reveal"><span class="signal-dot"></span><p><strong>3 decisions</strong><br>ready to move</p></aside>`}
function energyArc(){return`<div class="energy-arc" aria-label="Energy goal, seven of ten segments"><i class="on" style="--n:0"></i><i class="on" style="--n:2"></i><i class="on" style="--n:4"></i><i class="on" style="--n:5"></i><i class="on" style="--n:5"></i><i class="on" style="--n:4"></i><i class="on" style="--n:2"></i><i style="--n:0"></i><i style="--n:-2"></i><i style="--n:-3"></i></div>`}
function extra(type){if(type==="material")return`<div class="material-strip reveal" aria-label="Timber, plaster, stone, and concrete material palette"></div>`;if(type==="logos")return`<div class="logo-row reveal"><img src="./assets/logos/gmail.svg" alt="Gmail"><img src="./assets/logos/slack.svg" alt="Slack"><img src="./assets/logos/google-calendar.svg" alt="Google Calendar"></div>${customSelect("Choose integration",["Gmail","Slack","Google Calendar"])}`;return customSelect("Recipe focus",["For you","High protein","Quick meals","Plant-forward"]) }
function customSelect(label,items){return`<div class="custom-select reveal"><button class="select-trigger" type="button" aria-haspopup="listbox" aria-expanded="false">${label}${icon("caret-down")}</button><div class="select-menu" role="listbox">${items.map((x,i)=>`<button type="button" role="option" aria-selected="${i===0}">${x}</button>`).join("")}</div></div>`}
