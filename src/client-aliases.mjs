// Optional, honest client-executed aliases. Never execute an operation here.
// These schemas advertise only the subset that can be translated accurately.
const quote=value=>"'"+value.replaceAll("'","'\\''")+"'";
const readProgram=`import base64,itertools,json,pathlib,sys
p=json.loads(base64.b64decode(sys.argv[1]));target=pathlib.Path(p['path'])
offset=p.get('offset',1);limit=p.get('limit',2000)
if target.is_dir():
    lines=sorted(x.name+('/' if x.is_dir() else '') for x in target.iterdir())
else:
    with target.open(encoding='utf-8',newline='') as f:
        lines=[line.rstrip('\\r\\n') for line in itertools.islice(f,offset-1,offset-1+limit)]
    print('\\n'.join(str(i+offset)+': '+line for i,line in enumerate(lines)))
    sys.exit(0)
print('\\n'.join(str(i+1)+': '+line for i,line in enumerate(lines) if offset-1<=i<offset-1+limit))
`;
const mutateProgram=`import base64,json,os,pathlib,stat,sys,tempfile
p=json.loads(base64.b64decode(sys.argv[1]));target=pathlib.Path(p['path'])
if target.is_symlink(): target=target.resolve(strict=True)
if target.exists() and not target.is_file(): raise ValueError('Target is not a regular file')
if p['operation']=='edit':
    content=target.read_bytes().decode('utf-8');count=content.count(p['oldString'])
    if count==0 or (count!=1 and not p.get('replaceAll',False)): raise ValueError('Expected one exact match unless replaceAll is true')
    content=content.replace(p['oldString'],p['newString'])
else: content=p['content'];target.parent.mkdir(parents=True,exist_ok=True)
descriptor,temporary=tempfile.mkstemp(prefix='.codex-bridge-',dir=target.parent)
try:
    with os.fdopen(descriptor,'wb') as output:
        if target.exists(): os.fchmod(output.fileno(),stat.S_IMODE(target.stat().st_mode))
        output.write(content.encode('utf-8'))
    os.replace(temporary,target)
finally:
    if os.path.exists(temporary): os.unlink(temporary)
print('Updated '+str(target))
`;
const validKeys=(input,keys)=>input&&typeof input==='object'&&!Array.isArray(input)&&Object.keys(input).every(key=>keys.includes(key));
export function clientAliases(tools){
 const candidates=tools.filter(tool=>tool.kind==='function'&&tool.name==='exec_command'&&(!tool.namespace||tool.namespace==='functions'));
 if(candidates.length!==1)return [];
 const target=candidates[0],schema=target.parameters;
 if(schema?.type!=='object'||schema.properties?.cmd?.type!=='string'||(schema.required||[]).some(key=>key!=='cmd'))return [];
 const make=(name,description,properties,required,translate)=>({name,description,input:{type:'object',properties,required,additionalProperties:false},target,translate});
 const string={type:'string'};
 const command=(program,input)=>{
  const data=Buffer.from(JSON.stringify(input)).toString('base64');
  if(data.length>48000)throw new Error('CLIENT_ALIAS_INPUT_TOO_LARGE');
  return {cmd:`python3 -c ${quote(program)} ${quote(data)}`,
   ...(schema.properties.shell?.type==='string'?{shell:'/bin/sh'}:{}),
   ...(schema.properties.login?.type==='boolean'?{login:false}:{}),
  };
 };
 return [
  make('shell','Client-executed shell command. Runs through Codex exec_command in the Codex workspace, subject to Codex approval. Long commands can return a client session ID; use the supplied client write_stdin tool to continue. Background and execution timeout options are not supported.',{command:string,...(schema.properties.workdir?.type==='string'?{workdir:string}:{})},['command'],input=>{
   if(!input||typeof input.command!=='string'||Object.keys(input).some(key=>!['command','workdir'].includes(key)))throw new Error('UNSUPPORTED_SHELL_ALIAS_INPUT');
   if(input.workdir!==undefined&&(typeof input.workdir!=='string'||schema.properties.workdir?.type!=='string'))throw new Error('UNSUPPORTED_SHELL_ALIAS_WORKDIR');
   return {cmd:input.command,...(input.workdir!==undefined?{workdir:input.workdir}:{})};
  }),
  make('read','Client-executed UTF-8 file or directory read through Codex exec_command. Requires python3 in the Codex client environment. Returns numbered text lines or sorted directory entries. Offset is one-based; at most 2000 entries. Never reads the OpenCode workspace.',{path:string,offset:{type:'integer',minimum:1},limit:{type:'integer',minimum:0,maximum:2000}},['path'],input=>{
   if(!input||typeof input.path!=='string'||Object.keys(input).some(key=>!['path','offset','limit'].includes(key))||
      (input.offset!==undefined&&(!Number.isInteger(input.offset)||input.offset<1))||
      (input.limit!==undefined&&(!Number.isInteger(input.limit)||input.limit<0||input.limit>2000)))throw new Error('UNSUPPORTED_READ_ALIAS_INPUT');
   return command(readProgram,input);
  }),
  make('write','Client-executed UTF-8 file write through Codex exec_command and its permissions. Requires client python3. Replaces the complete file atomically; creates parent directories. UTF-8 payload limit approximately 36 KB; use the supplied client tools for larger changes.',{path:string,content:string},['path','content'],input=>{
   if(!validKeys(input,['path','content'])||typeof input.path!=='string'||typeof input.content!=='string')throw new Error('UNSUPPORTED_WRITE_ALIAS_INPUT');
   return command(mutateProgram,{...input,operation:'write'});
  }),
  make('edit','Client-executed exact UTF-8 string replacement through Codex exec_command and its permissions. Requires client python3. Exactly one occurrence must match unless replaceAll is true. The old string must be nonempty and differ from the replacement. Writes atomically and preserves existing file mode.',{path:string,oldString:{type:'string',minLength:1},newString:string,replaceAll:{type:'boolean'}},['path','oldString','newString'],input=>{
   if(!validKeys(input,['path','oldString','newString','replaceAll'])||typeof input.path!=='string'||typeof input.oldString!=='string'||!input.oldString||typeof input.newString!=='string'||input.oldString===input.newString||(input.replaceAll!==undefined&&typeof input.replaceAll!=='boolean'))throw new Error('UNSUPPORTED_EDIT_ALIAS_INPUT');
   return command(mutateProgram,{...input,operation:'edit'});
  }),
 ];
}
