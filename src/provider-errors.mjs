import {BridgeError} from './errors.mjs';
const denialMessages={
 401:'OpenCode provider returned HTTP 401: authentication was rejected. Check the provider authentication configured in OpenCode.',
 403:'OpenCode provider returned HTTP 403: access was rejected. Check model entitlement or provider access restrictions in OpenCode; this does not establish quota exhaustion.',
 429:'OpenCode provider returned HTTP 429: a rate or quota limit was reached. Check the provider allowance or retry timing; the bridge will not retry automatically.',
};
// OpenCode v2 exposes Session.StructuredError {type,message,status}; it does
// not retain the provider JSON code. Recognize only explicit invalid-request
// explanations and return fixed safe messages, never upstream payload text.
export function providerGenerationError(error){
 if([401,403,429].includes(error?.status))return new BridgeError(error.status,'upstream_access_or_quota',denialMessages[error.status]);
 if(error?.type==='provider.invalid-request'&&[400,413,422].includes(error.status)){
  const message=typeof error.message==='string'?error.message.slice(0,16384):'';
  if(/context_length_exceeded|maximum context length.{0,80}exceed|exceed.{0,80}maximum context length|context window.{0,40}(?:exceed|too (?:large|long))|prompt is too long/i.test(message)){
   return new BridgeError(400,'context_length_exceeded','The provider explicitly reported that the input exceeds its context limit. Reduce or compact the conversation in Codex; the bridge did not truncate it.');
  }
  if(/invalid (?:json )?schema for (?:function|tool)|invalid (?:function|tool) (?:schema|parameters)|tool(?:_call)? arguments.{0,40}(?:invalid|schema)/i.test(message)){
   return new BridgeError(422,'upstream_tool_schema','The provider rejected the supplied tool schema or arguments. Check model compatibility; do not remove tool results or conversation content to hide the failure.');
  }
 }
 return new BridgeError(502,'generation_failed','OpenCode generation failed without a recognized safe error category. Inspect private runtime diagnostics; do not assume this means quota exhaustion or context overflow.');
}
