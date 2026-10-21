import assert from "node:assert/strict";
import test from "node:test";
import { callAgent } from "./agent-client";

test("callAgent preserves raw output and records failed schema validation without changing it", async () => {
  const previousBaseUrl = process.env.LLM_BASE_URL;
  const previousApiKey = process.env.LLM_API_KEY;
  const previousModel = process.env.LLM_MODEL;
  const previousFetch = globalThis.fetch;
  process.env.LLM_BASE_URL = "https://llm.example.test";
  process.env.LLM_API_KEY = "test-key";
  process.env.LLM_MODEL = "test-model";
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: '{"unexpected":true}' } }],
    usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 }
  }), { status: 200 });

  try {
    const result = await callAgent<{ expected: string }>({
      agentName: "test-agent",
      promptVersion: "test.v1",
      input: { text: "test" },
      traceId: "trace-test",
      validate: (value): value is { expected: string } => Boolean(value && typeof value === "object" && "expected" in value)
    });

    assert.equal(result.rawOutput, '{"unexpected":true}');
    assert.deepEqual(result.parsedOutput, { unexpected: true });
    assert.deepEqual(result.validationResult, { valid: false, errors: ["schema validation returned false"] });
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnv("LLM_BASE_URL", previousBaseUrl);
    restoreEnv("LLM_API_KEY", previousApiKey);
    restoreEnv("LLM_MODEL", previousModel);
  }
});

function restoreEnv(name: string, value: string | undefined) {
  if (typeof value === "undefined") delete process.env[name];
  else process.env[name] = value;
}
import {loadWorkflowConfig,withWorkflowConfig,matchesWorkflowSchema} from '@class-reflect/config';
test('strict JSON object request carries the configured schema once, including warnings and array types',async()=>{
 const keys=['LLM_BASE_URL','LLM_API_KEY','LLM_MODEL'];const saved=keys.map(k=>process.env[k]);const old=globalThis.fetch;keys.forEach(k=>process.env[k]='mock-contract');let request:any;
 const config=JSON.parse(JSON.stringify(loadWorkflowConfig().config));config.schemas.normalizer.properties.contractProbe={type:'string'};
 globalThis.fetch=async(_url,init)=>{request=JSON.parse(String(init?.body));const system=request.messages[0].content;
 const configuredSchema=JSON.stringify(config.schemas.normalizer);assert.equal(system.split(configuredSchema).length-1,1);assert.ok(system.includes('"warnings"'));assert.ok(system.includes('"type":"array"'));assert.ok(system.startsWith('promptVersion=test.contract\n'));assert.equal(system.includes('test.contract\\n'),false);
 // The observed malformed shape remains invalid; a contract-aware mock emits only the valid form.
 const malformed={patches:[{i:0,correctedText:'文本。',confidence:0.9,'changeTypes([':'readability'}],needsHumanReview:false};
 assert.equal(configuredSchema.includes('contractProbe'),true);assert.equal(Object.hasOwn(malformed,'warnings'),false);assert.equal(matchesWorkflowSchema(malformed,config.schemas.normalizer),false);
 return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({patches:[],warnings:[]})}}]}),{status:200});};
 try{await withWorkflowConfig(loadWorkflowConfig(config),()=>callAgent({agentName:'transcript-normalizer-agent',promptVersion:'test.contract',input:{},validate:(_):_ is object=>true}));assert.equal(request.response_format.type,'json_object');}finally{globalThis.fetch=old;keys.forEach((k,i)=>restoreEnv(k,saved[i]));}
});
test('explicit native strict schema capability uses request parameter without duplicate textual contract',async()=>{
 const keys=['LLM_BASE_URL','LLM_API_KEY','LLM_MODEL'];const saved=keys.map(k=>process.env[k]);const old=globalThis.fetch;keys.forEach(k=>process.env[k]='mock-native');
 const config=JSON.parse(JSON.stringify(loadWorkflowConfig().config));config.llm.responseFormat='json_schema';config.llm.strictSchemaModels=['mock-native'];config.llm.strictSchemaEndpoints=['mock-native'];
 const strict=(schema:any)=>{if(schema.type==='object'){schema.additionalProperties=false;Object.values(schema.properties||{}).forEach(strict);}if(schema.type==='array')strict(schema.items);};Object.values(config.schemas).forEach(strict);
 globalThis.fetch=async(_url,init)=>{const request=JSON.parse(String(init?.body));assert.equal(request.response_format.type,'json_schema');assert.equal(request.response_format.json_schema.strict,true);assert.deepEqual(request.response_format.json_schema.schema,config.schemas.normalizer);assert.equal(request.messages[0].content.includes(config.prompts.schemaContractLabel),false);return new Response(JSON.stringify({choices:[{message:{content:'{"patches":[],"warnings":[]}'}}]}),{status:200});};
 try{await withWorkflowConfig(loadWorkflowConfig(config),()=>callAgent({agentName:'transcript-normalizer-agent',promptVersion:'test.native',input:{},validate:(_):_ is object=>true}));}finally{globalThis.fetch=old;keys.forEach((k,i)=>restoreEnv(k,saved[i]));}
});
