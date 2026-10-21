const fs=require('fs'),path=require('path'),Module=require('module');
const root=path.resolve(__dirname,'..');const ts=require(root+'/node_modules/typescript');const resolve=Module._resolveFilename;
Module._resolveFilename=function(name,parent,...rest){if(name==='@class-reflect/config/browser')return path.join(root,'packages/config/src/browser.ts');if(name.startsWith('@class-reflect/')){const p=path.join(root,'packages',name.slice('@class-reflect/'.length),'src/index.ts');if(fs.existsSync(p))return p;}return resolve.call(this,name,parent,...rest);};
require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
