import {test} from 'node:test';
import assert from 'node:assert/strict';
import {providerGenerationError} from '../src/provider-errors.mjs';
for(const message of ['Too many tools: maximum 128. PRIVATE','Invalid tools: maximum 128 tools allowed. PRIVATE','Maximum 128 functions are allowed. PRIVATE'])test('Explicit provider tool-count rejection: '+message,()=>{
 const error=providerGenerationError({type:'provider.invalid-request',status:400,message});
 assert.equal(error.code,'upstream_tool_limit');assert.equal(error.status,422);assert.doesNotMatch(error.message,/PRIVATE/);
});
for(const error of [{type:'unknown',status:500,message:'Too many tools'},{type:'provider.invalid-request',status:400,message:'Unknown setting'},{type:'provider.invalid-request',status:400,message:'Invalid schema for function tools: maximum string length 256'}])test('Does not invent a tool-count rejection: '+error.message,()=>assert.notEqual(providerGenerationError(error).code,'upstream_tool_limit'));
