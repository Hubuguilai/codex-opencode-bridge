// Remove only local $ref edges that close a cycle. Recursive argument validation
// stays with the Codex client; the provider receives a less restrictive schema.
// Literal data (enum/default/examples/const) is never interpreted as a schema.
const maps=['$defs','definitions','properties','patternProperties','dependentSchemas'];
const arrays=['allOf','anyOf','oneOf','prefixItems'];
const children=['items','additionalItems','additionalProperties','contains','not','if','then','else','propertyNames','unevaluatedItems','unevaluatedProperties','contentSchema'];
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function resolve(root,ref){
 if(typeof ref!=='string'||!ref.startsWith('#'))return;
 let pointer;try{pointer=decodeURIComponent(ref.slice(1));}catch{return;}
 if(pointer==='')return root;if(!pointer.startsWith('/'))return;
 let node=root;
 for(const part of pointer.slice(1).split('/')){
  if(/~(?:[^01]|$)/.test(part))return;
  const key=part.replace(/~1/g,'/').replace(/~0/g,'~');
  if(!node||typeof node!=='object'||!Object.hasOwn(node,key))return;
  node=node[key];
 }
 return object(node)?node:undefined;
}
function edges(node,root){
 const result=[];const ref=resolve(root,node.$ref);if(ref)result.push({target:ref,ref:true});
 const add=x=>{if(object(x))result.push({target:x});};
 for(const key of maps)if(object(node[key]))Object.values(node[key]).forEach(add);
 for(const key of arrays)if(Array.isArray(node[key]))node[key].forEach(add);
 for(const key of children){if(key==='items'&&Array.isArray(node[key]))node[key].forEach(add);else add(node[key]);}
 if(object(node.dependencies))Object.values(node.dependencies).forEach(add);
 return result;
}
export function repairRecursiveSchema(schema){
 if(!object(schema))return {schema,changed:false};
 const root=structuredClone(schema),active=new Set(),done=new Set();let changed=false;
 const stack=[{node:root,index:0,edges:edges(root,root)}];active.add(root);
 while(stack.length){
  const frame=stack.at(-1);
  if(frame.index===frame.edges.length){active.delete(frame.node);done.add(frame.node);stack.pop();continue;}
  const edge=frame.edges[frame.index++];
  if(active.has(edge.target)){if(edge.ref){delete frame.node.$ref;changed=true;}continue;}
  if(done.has(edge.target))continue;
  active.add(edge.target);stack.push({node:edge.target,index:0,edges:edges(edge.target,root)});
 }
 return {schema:changed?root:schema,changed};
}
