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
