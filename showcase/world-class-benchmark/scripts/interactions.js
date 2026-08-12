export function bindInteractions(){
const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;
const observer=new IntersectionObserver((entries)=>entries.forEach((entry)=>{if(entry.isIntersecting){entry.target.classList.add("seen");observer.unobserve(entry.target)}}),{threshold:.18});
document.querySelectorAll(".reveal").forEach((el)=>reduce?el.classList.add("seen"):observer.observe(el));
document.querySelectorAll(".custom-select").forEach((root)=>{
const trigger=root.querySelector(".select-trigger");
const menu=root.querySelector(".select-menu");
const options=[...menu.querySelectorAll('[role="option"]')];
const close=()=>{root.classList.remove("open");trigger.setAttribute("aria-expanded","false");trigger.focus()};
const open=()=>{root.classList.add("open");trigger.setAttribute("aria-expanded","true");options.find((x)=>x.getAttribute("aria-selected")==="true")?.focus()};
trigger.addEventListener("click",()=>root.classList.contains("open")?close():open());
trigger.addEventListener("keydown",(event)=>{if(["ArrowDown","Enter"," "].includes(event.key)){event.preventDefault();open()}});
options.forEach((option,index)=>{
option.addEventListener("click",()=>select(option));
option.addEventListener("keydown",(event)=>{if(event.key==="Escape"){event.preventDefault();close()}if(event.key==="ArrowDown"){event.preventDefault();options[(index+1)%options.length].focus()}if(event.key==="ArrowUp"){event.preventDefault();options[(index-1+options.length)%options.length].focus()}if(event.key==="Enter"){event.preventDefault();select(option)}});
});
function select(option){options.forEach((item)=>item.setAttribute("aria-selected",String(item===option)));trigger.firstChild.textContent=option.textContent;close()}
});
document.querySelectorAll(".method-step button").forEach((button)=>{
button.addEventListener("click",()=>{const step=button.closest(".method-step");const sequence=step.closest(".method-sequence");const open=button.getAttribute("aria-expanded")==="true";sequence.querySelectorAll(".method-step button").forEach((item)=>item.setAttribute("aria-expanded","false"));button.setAttribute("aria-expanded",String(!open))});
});
document.querySelectorAll("[data-decision-action]").forEach((button)=>{
button.addEventListener("click",()=>{
const canvas=button.closest(".decision-canvas");
const resolved=canvas.classList.toggle("is-resolved");
canvas.querySelector("[data-decision-label]").textContent=resolved?"Owner confirmed":"Confirm the owner";
canvas.querySelector("[data-decision-status]").textContent=resolved?"Ready for review":"Waiting on owner";
});
});
}
