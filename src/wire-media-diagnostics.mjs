// Counts only; never persist images, URLs, text, tool arguments or credentials.
export function wireImageCounts(body){
 const counts={imageParts:0,inlineImages:0,remoteImages:0};
 const visit=part=>{
  if(!part||typeof part!=='object')return;
  if(Array.isArray(part)){for(const item of part)visit(item);return;}
  if(['image_url','input_image','image'].includes(part.type)){
   counts.imageParts++;
   const url=part.image_url?.url??part.image_url??part.url;
   if(typeof url==='string'&&url.startsWith('data:image/'))counts.inlineImages++;
   else if(typeof url==='string'&&/^https?:/.test(url))counts.remoteImages++;
   return;
  }
  // Traverse message content, not schemas, tool arguments or arbitrary text.
  for(const key of ['content','output','value'])visit(part[key]);
 };
 visit(body.messages);visit(body.input);return counts;
}

// Compare in memory; persist only counts and the equality result, never hashes.
export function wireImageIntegrity(body,messages){
 const collect=(roots,native)=>{
  const images=[];
  const walk=part=>{
   if(!part||typeof part!=='object')return;
   if(Array.isArray(part)){for(const value of part)walk(value);return;}
   if(native&&part.type==='media'&&typeof part.data==='string'){images.push(Buffer.from(part.data,'base64'));return;}
   let url;
   if(['image_url','input_image','image'].includes(part.type))url=part.image_url?.url??part.image_url??part.url;
   else if(native&&part.type==='file'&&typeof part.mime==='string'&&part.mime.startsWith('image/'))url=part.uri;
   if(url!==undefined){const match=typeof url==='string'&&/^data:image\/[^;,]+;base64,(.+)$/.exec(url);images.push(match?Buffer.from(match[1],'base64'):null);return;}
   for(const key of ['content','output','value','result'])walk(part[key]);
  };walk(roots);return images;
 };
 const expected=collect(messages,true),actual=collect(body.messages??body.input,false);
 return {expectedImages:expected.length,wireImages:actual.length,exactBytesInOrder:expected.length===actual.length&&expected.every((bytes,i)=>bytes&&actual[i]&&bytes.equals(actual[i]))};
}
