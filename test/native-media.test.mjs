import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {nativeContent} from '../src/native-media.mjs';
import {normalizeNativeRequest} from '../src/native-protocol.mjs';
import plugin from '../src/runtime-plugin.mjs';

const data=Buffer.from('test image bytes').toString('base64');
const image={type:'input_image',image_url:'data:image/png;base64,'+data};
const config={models:['opencode/vision','opencode/text'],imageModels:['opencode/vision'],maxBodyBytes:100000};
test('Inline image bytes and interleaved text reach native messages, never prompt prose',()=>{
 const result=normalizeNativeRequest({model:'opencode/vision',input:[{role:'user',content:[{type:'input_text',text:'before'},image,{type:'input_text',text:'after'}]}]},'responses',config);
 assert.deepEqual(result.messages[0].content,[{type:'text',text:'before'},{type:'media',mediaType:'image/png',data},{type:'text',text:'after'}]);
 assert.ok(!result.prompt.includes(data));
 assert.deepEqual(nativeContent([{type:'image_url',image_url:{url:image.image_url}}],{images:true}),result.messages[0].content.slice(1,2));
 assert.throws(()=>normalizeNativeRequest({model:'opencode/text',input:[{role:'user',content:[image]}]},'responses',config),{status:422});
});
test('Unsupported or malformed image requests fail before any network access',()=>{
 for(const part of [{...image,image_url:'https://example.com/a.png'},{...image,image_url:'file:///tmp/a.png'},{...image,detail:'high'},{type:'input_audio',data}])assert.throws(()=>nativeContent([part],{images:true}),{status:422});
 assert.throws(()=>nativeContent([image],{images:true,role:'system'}),{status:422});
 assert.throws(()=>nativeContent([{...image,image_url:'data:image/png;base64,AB=='}],{images:true}),{status:400});
 assert.throws(()=>normalizeNativeRequest({model:'opencode/vision',input:[{role:'user',content:[image]}]},'responses',{...config,maxBodyBytes:5}),{status:413});
});
test('Desktop image detail fallback requires explicit opt-in and reports degradation',()=>{
 const payload={model:'opencode/vision',input:[{role:'user',content:[{...image,detail:'original'}]}]};
 assert.throws(()=>normalizeNativeRequest(payload,'responses',config),{status:422});
 const actual=normalizeNativeRequest(payload,'responses',{...config,imageDetailPolicy:'auto'});
 assert.deepEqual(actual.warnings,['image_detail_auto']);assert.equal(actual.messages[0].content[0].data,data);
 assert.throws(()=>nativeContent([{...image,detail:'invented'}],{images:true,detailPolicy:'auto'}),{status:422});
});
test('Plugin reuses native media class instances, preserves order and refuses missing attachments',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'bridge-media-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const hooks={};const ctx={location:{directory:root},session:{hook:async(name,fn)=>{hooks[name]=fn;}},permission:{hook:async()=>{}},tool:{hook:async()=>{},transform:async()=>({dispose:async()=>{}})}};
 await plugin.setup(ctx);
 const messages=[{role:'user',content:[{type:'text',text:'before'},{type:'media',mediaType:'image/png',data},{type:'text',text:'after'}]}];
 fs.writeFileSync(path.join(root,'bridge-request.json'),JSON.stringify({requestId:'r',tools:[],messages}));await hooks.prompt();
 class Asset{bytes(){return 'actual image';}}
 const media={type:'media',media:new Asset()};
 const context={tools:{},system:[],options:{},messages:[{role:'user',content:[{type:'text',text:'seed'},media]}]};
 hooks.context(context);assert.equal(context.messages[0].content[1],media);assert.equal(context.messages[0].content[1].media.bytes(),'actual image');
 await hooks.prompt();assert.throws(()=>hooks.context({tools:{},system:[],options:{},messages:[]}),/NATIVE_IMAGE_ATTACHMENT_MISSING/);
});
