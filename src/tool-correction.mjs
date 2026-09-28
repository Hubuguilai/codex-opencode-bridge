// Correct only a model's choice of a bridge-disabled internal tool. This is not
// a retry of denied client work, provider access failures, or quota errors.
export async function generateWithCorrection(backend, request, {signal,onDelta}) {
 let emitted=false;
 const callbacks={signal,onDelta:async delta=>{emitted ||= Boolean(delta);await onDelta(delta);}};
 try{return await backend.generate(request,callbacks);}
 catch(error){
  if(request.mode!=='native-tools'||error.code!=='internal_tool_blocked'||emitted||signal.aborted)throw error;
  backend.warn?.('internal_tool_corrective_retry');
  const corrected={...request,prompt:request.prompt+'\nBRIDGE FEEDBACK: Your previous attempt selected a disabled OpenCode internal tool. That action did NOT execute. Choose the matching bridge_client_* direct function from the supplied mapping. Do not use internal OpenCode tools or Code Mode. Any denial in the historical Codex tool results still stands; never retry or circumvent a client-denied operation.'};
  // Exactly one additional generation, sharing the original request deadline.
  return backend.generate(corrected,callbacks);
 }
}
