const {test}=require('node:test'),assert=require('node:assert/strict');
const {parseKeyFile,EMPTY_KEY_TEMPLATE}=require('../dist/main/ai/key-file');
const fs=require('node:fs'),path=require('node:path');
test('JSON and env imports use named providers, tolerate blank template entries and never import consent flags',()=>{
 assert.deepEqual(parseKeyFile('\uFEFF'+JSON.stringify({DEEPSEEK_API_KEY:' fixture-one ',GEMINI_API_KEY:'fixture-two',MINIMAX_API_KEY:'',AI_ENABLED:true}),true),{deepseek:'fixture-one',gemini:'fixture-two'});
 assert.deepEqual(parseKeyFile('export MINIMAX_API_KEY="fixture-cn"\nDEEPSEEK_API_KEY=fixture-ds\nAI_ENABLED=true\nAI_PROVIDER=minimax',false),{minimax:'fixture-cn',deepseek:'fixture-ds'});
});
test('invalid configuration errors never reflect file contents or keys',()=>{
 for(const content of ['{bad-private-content', 'null','[]',JSON.stringify({DEEPSEEK_API_KEY:123}),JSON.stringify({DEEPSEEK_API_KEY:'part one'}),JSON.stringify({DEEPSEEK_API_KEY:'secret\u0000hidden'}),JSON.stringify({DEEPSEEK_API_KEY:'x'.repeat(4100)}),'x'.repeat(20001),EMPTY_KEY_TEMPLATE]){
   assert.throws(()=>parseKeyFile(content,true),e=>e.message.startsWith('配置文件需包含非空的 ')&&!e.message.includes('private-content')&&!e.message.includes('secret'));
 }
});
test('shipped and generated key templates are empty and limited to supported provider fields',()=>{
 const shipped=JSON.parse(fs.readFileSync(path.join(__dirname,'../api-keys.example.json'),'utf8')),generated=JSON.parse(EMPTY_KEY_TEMPLATE);
 assert.deepEqual(shipped,generated);assert.deepEqual(Object.keys(generated).sort(),['DEEPSEEK_API_KEY','GEMINI_API_KEY','MINIMAX_API_KEY']);assert.ok(Object.values(generated).every(v=>v===''));
});
