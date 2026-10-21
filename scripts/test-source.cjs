const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process');
const root=path.resolve(__dirname,'..');const files=[];
function visit(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(e.name==='node_modules'||e.name==='dist')continue;const p=path.join(dir,e.name);if(e.isDirectory())visit(p);else if(e.name.endsWith('.test.ts'))files.push(p);}}
for(const dir of ['packages','apps/worker/src','validation/workflow-foundation'])visit(path.join(root,dir));
const result=spawnSync(process.execPath,['--require',path.join(__dirname,'register-source.cjs'),'--test',...files],{cwd:root,stdio:'inherit'});process.exitCode=result.status??1;
