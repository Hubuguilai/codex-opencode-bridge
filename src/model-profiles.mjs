// One source of model metadata for prepared clients, routing and compatibility.
// A profile is not an entitlement check. Historical entries keep their test budget.
const historical = (name) => ({name, context:32000, compact:26000, images:false, evidence:'historical text/tool acceptance budget; not a maximum-context claim'});
export const MODEL_PROFILES = Object.freeze({
 'opencode/space-bunny-free':historical('Space Bunny Free'),
 'opencode/nemotron-3-ultra-free':historical('Nemotron 3 Ultra Free'),
 'opencode/mimo-v2.6-flash-free':historical('MiMo V2.6 Flash Free'),
 'opencode/longcat-2.5-preview-free':historical('LongCat 2.5 Preview Free'),
 'opencode/big-pickle':{name:'Big Pickle',context:200000,compact:160000,images:false,evidence:'catalog 200k context/160k input; text and client-tool workflow tested'},
 'opencode/muse-spark-1.3-contributor-free':{name:'Muse Spark 1.3 Contributor Free',context:1048576,compact:891289,images:true,recursiveTools:'flatten',evidence:'uploaded and tool-result images verified; ten workflow scenarios passed on frozen source 3a096e9; near-1M text input tested'},
});
export function modelProfile(id){return MODEL_PROFILES[id];}
export function modelCatalogEntry(id,template){
 const p=modelProfile(id);if(!p)throw new Error('Unknown model profile.');
 return {...template,slug:id,display_name:p.name+' (OpenCode Bridge)',description:p.evidence,
 context_window:p.context,max_context_window:p.context,auto_compact_token_limit:p.compact,
 input_modalities:p.images?['text','image']:['text'],supports_reasoning_summaries:false};
}
