import {test} from 'node:test';
import assert from 'node:assert/strict';
import {usage} from '../src/protocol.mjs';

test('OpenCode cached prompt tokens remain part of Responses context usage',()=>{
 const actual=usage({input:124,output:132,reasoning:1263,cache:{read:998257,write:0}});
 assert.equal(actual.input_tokens,998381);
 assert.equal(actual.input_tokens_details.cached_tokens,998257);
 assert.equal(actual.output_tokens,1395);
 assert.equal(actual.total_tokens,999776);
 assert.equal(usage({input:5,cache:{read:10,write:20}}).input_tokens,35);
 assert.equal(usage({input:5}).input_tokens,5);
});
