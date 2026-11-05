import fs from 'node:fs';
import {performance} from 'node:perf_hooks';
const openaiModel=process.env.OPENAI_MODEL||'gpt-5.4';
const claudeModel=process.env.ANTHROPIC_MODEL||'claude-sonnet-5';
const tasks=JSON.parse(fs.readFileSync(new URL('./cases.json',import.meta.url)));
const sys=`Ты SkillUp AI. Не выполняй никаких реальных действий. Верни только JSON с полями: intent (string), tool (string или null), args (object), reply (короткий текст не более 160 символов), needs_confirmation (boolean). Доступные инструменты: create_transaction, update_last_transaction, rename_goal, propose_bulk_delete, get_progress_report. Пользовательская валюта KGS. Текущая дата в тесте 2026-11-06, часовой пояс Asia/Bishkek. Существующие цели: Relax id=g1, Test id=g2, Q id=g3, S id=g4. Последняя операция: id=t1, 100 KGS, чай, 2026-11-06. Для массового удаления нужно подтверждение. Никогда не утверждай, что изменения уже записаны, так как это dry run. Для отчёта не выдумывай числа.`;
async function runOpenAI(prompt){
 const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+process.env.OPENAI_API_KEY},body:JSON.stringify({model:openaiModel,instructions:sys,input:prompt,max_output_tokens:500})});
 const data=await r.json(); if(!r.ok)throw new Error(`${r.status}: ${JSON.stringify(data.error||data).slice(0,350)}`);
 return {text:data.output_text||data.output?.flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('')||'',usage:data.usage||null};
}
async function runClaude(prompt){
 const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':process.env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},body:JSON.stringify({model:claudeModel,max_tokens:500,system:sys,messages:[{role:'user',content:prompt}]})});
 const data=await r.json();if(!r.ok)throw new Error(`${r.status}: ${JSON.stringify(data.error||data).slice(0,350)}`);
 return {text:(data.content||[]).filter(x=>x.type==='text').map(x=>x.text).join(''),usage:data.usage||null};
}
function extractJson(s){let t=s.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');try{return JSON.parse(t)}catch{return null}}
const results=[];
for(const task of tasks){
 for(const [provider,fn,key] of [['OpenAI',runOpenAI,process.env.OPENAI_API_KEY],['Anthropic',runClaude,process.env.ANTHROPIC_API_KEY]]){
  if(!key){results.push({id:task.id,provider,skipped:'Missing API key'});continue}
  const begin=performance.now();try{const out=await fn(task.prompt);const obj=extractJson(out.text);results.push({id:task.id,provider,model:provider==='OpenAI'?openaiModel:claudeModel,ms:Math.round(performance.now()-begin),parsed:!!obj,tool:obj?.tool||null,expectedTool:task.expectedTool,toolMatch:obj?.tool===task.expectedTool,needs_confirmation:obj?.needs_confirmation,reply:obj?.reply,usage:out.usage,raw:out.text});}
  catch(e){results.push({id:task.id,provider,error:String(e.message),ms:Math.round(performance.now()-begin)})}
 }
 console.log(`Completed: ${task.id}`);
}
fs.writeFileSync('benchmark-results.json',JSON.stringify(results,null,2));
console.table(results.map(x=>({test:x.id,provider:x.provider,ms:x.ms,parsed:x.parsed,toolMatch:x.toolMatch,error:x.error||''})));
console.log('Results saved as benchmark-results.json. No real database operations were performed.');
