import {deflateSync} from 'node:zlib';
const digits=['111101101101111','010110010010111','111001111100111','111001111001111','101101111001001','111100111001111','111100111101111','111001001001001','111101111101111','111101111001111'];
function crc(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function chunk(name,data){const type=Buffer.from(name),size=Buffer.alloc(4),sum=Buffer.alloc(4);size.writeUInt32BE(data.length);sum.writeUInt32BE(crc(Buffer.concat([type,data])));return Buffer.concat([size,type,data,sum]);}
// Random visual challenge rendered locally. The expected digits are never sent
// in text, file names, metadata or the user prompt.
export function verificationImage(code){
 if(!/^\d{6}$/.test(code))throw Error('Image challenge needs six digits.');
 const scale=18,w=6*4*scale+scale,h=7*scale,rows=Buffer.alloc((w*3+1)*h,255);
 for(let y=0;y<h;y++)rows[y*(w*3+1)]=0;
 for(let i=0;i<6;i++)for(let y=0;y<5;y++)for(let x=0;x<3;x++)if(digits[Number(code[i])][y*3+x]==='1')for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++){
  const offset=(y*scale+scale+dy)*(w*3+1)+1+(i*4*scale+scale+x*scale+dx)*3;rows.fill(0,offset,offset+3);
 }
 const header=Buffer.alloc(13);header.writeUInt32BE(w,0);header.writeUInt32BE(h,4);header[8]=8;header[9]=2;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
}
