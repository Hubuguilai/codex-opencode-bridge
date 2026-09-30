import {test} from 'node:test';import assert from 'node:assert/strict';
import {repairRecursiveSchema} from '../src/tool-schema.mjs';
import {normalizeNativeRequest} from '../src/native-protocol.mjs';
const recursive={type:'object',properties:{node:{$ref:'#/$defs/node'}},$defs:{node:{type:'object',properties:{label:{type:'string'},child:{$ref:'#/$defs/node',description:'child'}}}}};
test('Cycles are removed without deleting definitions, literal data or sibling constraints',()=>{
 const schema={...recursive,examples:[{$ref:'#/$defs/node'}]};const r=repairRecursiveSchema(schema);
 assert.equal(r.changed,true);assert.deepEqual(r.schema.$defs.node.properties.child,{description:'child'});
 assert.equal(r.schema.properties.node.$ref,'#/$defs/node');assert.deepEqual(r.schema.examples,schema.examples);
 assert.equal(schema.$defs.node.properties.child.$ref,'#/$defs/node');assert.equal(repairRecursiveSchema(r.schema).schema,r.schema);
});
test('Mutual cycles and root refs are bounded; ordinary shared refs remain unchanged',()=>{
 const schema={$defs:{a:{properties:{b:{$ref:'#/$defs/b'}}},b:{properties:{a:{$ref:'#/$defs/a'}}}},properties:{value:{$ref:'#/$defs/a'}}};
 assert.equal(repairRecursiveSchema(schema).changed,true);
 assert.deepEqual(repairRecursiveSchema({type:'object',properties:{self:{$ref:'#'}}}).schema,{type:'object',properties:{self:{}}});
 const plain={$defs:{node:{type:'string'}},properties:{a:{$ref:'#/$defs/node'},b:{$ref:'#/$defs/node'}}};assert.equal(repairRecursiveSchema(plain).schema,plain);
});
test('Muse native relay repairs namespace tools directly without an installed Router patch',()=>{
 const model='opencode/muse-spark-1.3-contributor-free';const payload={model,input:'hello',tools:[{type:'namespace',name:'trees',tools:[{type:'function',name:'read',parameters:recursive}]}]};
 const normalized=normalizeNativeRequest(payload,'responses',{models:[model],maxBodyBytes:100000});
 assert.equal(normalized.tools[0].namespace,'trees');assert.deepEqual(normalized.tools[0].parameters.$defs.node.properties.child,{description:'child'});assert.deepEqual(normalized.warnings,['recursive_tool_schema_relaxed']);
 const other=normalizeNativeRequest({...payload,model:'opencode/big-pickle'},'responses',{models:['opencode/big-pickle'],maxBodyBytes:100000});assert.equal(other.tools[0].parameters,recursive);
});
