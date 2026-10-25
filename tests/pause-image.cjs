const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),sharp=require('sharp');
(async()=>{
 const root=path.resolve(__dirname,'..'),jpg=path.join(root,'assets/ui/멈춤버튼.jpg'),png=path.join(root,'assets/ui/멈춤버튼.png');
 const original=await sharp(jpg).removeAlpha().raw().toBuffer({resolveWithObject:true}),output=await sharp(png).raw().toBuffer({resolveWithObject:true}),meta=await sharp(png).metadata();
 const {width:w,height:h,channels}=output.info,src=original.data,rgba=output.data;
 assert.equal(meta.format,'png');assert.equal(channels,4);assert.equal(meta.hasAlpha,true);assert.equal(w,original.info.width);assert.equal(h,original.info.height);
 let clear=0,opaque=0,soft=0,bright=0;
 for(let i=0;i<w*h;i++){const a=rgba[i*4+3];if(a===0)clear++;else if(a===255){opaque++;for(let c=0;c<3;c++)assert.equal(rgba[i*4+c],src[i*3+c],'opaque original RGB unchanged');if(Math.min(...src.subarray(i*3,i*3+3))>215)bright++;}else soft++;}
 for(let x=0;x<w;x++){assert.equal(rgba[x*4+3],0);assert.equal(rgba[((h-1)*w+x)*4+3],0);}for(let y=0;y<h;y++){assert.equal(rgba[y*w*4+3],0);assert.equal(rgba[(y*w+w-1)*4+3],0);}
 const samples=[[525,423],[577,456],[557,518],[501,529],[474,466],[330,340],[257,91],[476,579]];
 for(const[x,y]of samples)assert.equal(rgba[(y*w+x)*4+3],255,`preserved petal/highlight/artwork at ${x},${y}`);
 assert(clear>w*h*.4);assert(opaque>w*h*.5);assert(soft>100);assert(bright>8500);
 // Neutral exterior check pixels in the wide surrounding margin are all invisible.
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(y<30||y>650||x<18||x>640)assert.equal(rgba[(y*w+x)*4+3],0,'exterior checker removed');
 console.log(JSON.stringify({result:'PASS',format:meta.format,channels,width:w,height:h,clear,opaque,soft,interiorBrightPixelsPreserved:bright,checks:['actual RGBA transparency','original dimensions','all opaque subject RGB copied exactly','white flower petals and highlights opaque','all outer margin checker pixels transparent','soft edge alpha']}));
})();
