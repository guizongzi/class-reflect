/** Small fail-closed validator for the JSON Schema subset used by this project. */
export function matchesWorkflowSchema(value:unknown,schema:any):boolean{
 if(!schema||typeof schema!=='object')return false;
 if(Array.isArray(schema.type))return schema.type.some((type:string)=>matchesWorkflowSchema(value,{...schema,type}));
 if(schema.enum&&!schema.enum.includes(value))return false;
 if(schema.type==='object'){
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const record=value as Record<string,unknown>;
  if((schema.required||[]).some((key:string)=>!(key in record)))return false;
  if(schema.additionalProperties===false&&Object.keys(record).some(k=>!(k in (schema.properties||{}))))return false;
  return Object.entries(schema.properties||{}).every(([key,child])=>!(key in record)||matchesWorkflowSchema(record[key],child));
 }
 if(schema.type==='array')return Array.isArray(value)&&(!schema.minItems||value.length>=schema.minItems)&&value.every(v=>matchesWorkflowSchema(v,schema.items));
 if(schema.type==='string')return typeof value==='string';
 if(schema.type==='number'||schema.type==='integer')return typeof value==='number'&&Number.isFinite(value)&&(schema.type!=='integer'||Number.isInteger(value))&&(schema.minimum===undefined||value>=schema.minimum)&&(schema.maximum===undefined||value<=schema.maximum);
 if(schema.type==='boolean')return typeof value==='boolean';
 if(schema.type==='null')return value===null;
 return false;
}
