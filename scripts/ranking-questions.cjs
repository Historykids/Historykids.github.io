// Keep online answer validation in sync with the browser's era datasets.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),context=vm.createContext({window:{}});
for(const file of ['data/dataset.js','data/ancient.js','data/meiji.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
const questions=[];
for(const [era,set] of Object.entries(context.window.dataSets))for(const chapter of Object.values(set.chapters))for(const name of Object.keys(chapter))questions.push({id:era+'|'+name,era,answers:set.blanks[name]});
const content='// Public question IDs and answer validation for the online challenge.\nexport const questions='+JSON.stringify(questions)+';\n';
const target=path.join(root,'server/figure-api/ranking-questions.mjs');
if(process.argv.includes('--write'))fs.writeFileSync(target,content);
else assert.equal(fs.readFileSync(target,'utf8'),content,'Online questions are stale; run npm run ranking:write');
console.log(questions.length+' online questions '+(process.argv.includes('--write')?'generated':'verified')+'.');
