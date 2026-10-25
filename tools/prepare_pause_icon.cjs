/* Remove only edge-connected neutral checker pixels. Never redraw or recolor artwork.
 * npm install --no-save sharp (development only); originals are never overwritten.
 */
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),sharp=require('sharp');
(async()=>{
 const root=path.resolve(__dirname,'..'),source=path.join(root,'assets/ui/멈춤버튼.jpg'),target=path.join(root,'assets/ui/멈춤버튼.png');
 const {data:rgb,info:{width:w,height:h}}=await sharp(source).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const n=w*h,bg=new Uint8Array(n),queue=new Int32Array(n);let head=0,tail=0;
 const neutral=i=>{const k=i*3,r=rgb[k],g=rgb[k+1],b=rgb[k+2];return Math.min(r,g,b)>=130&&Math.max(r,g,b)-Math.min(r,g,b)<=30;};
 const visit=i=>{if(!bg[i]&&neutral(i)){bg[i]=1;queue[tail++]=i;}};
 for(let x=0;x<w;x++){visit(x);visit((h-1)*w+x);}for(let y=0;y<h;y++){visit(y*w);visit(y*w+w-1);}
 while(head<tail){const i=queue[head++],x=i%w;if(x)visit(i-1);if(x<w-1)visit(i+1);if(i>=w)visit(i-w);if(i<n-w)visit(i+w);}
 // Discard detached JPEG speckles in the exterior; the full button/decorations
 // are one connected subject. Enclosed white highlights are never flood-filled.
 const seen=new Uint8Array(n);let largest=[];
 for(let seed=0;seed<n;seed++)if(!bg[seed]&&!seen[seed]){const component=[];head=0;tail=0;queue[tail++]=seed;seen[seed]=1;
  while(head<tail){const i=queue[head++],x=i%w;component.push(i);for(const j of [x?i-1:-1,x<w-1?i+1:-1,i>=w?i-w:-1,i<n-w?i+w:-1])if(j>=0&&!bg[j]&&!seen[j]){seen[j]=1;queue[tail++]=j;}}
  if(component.length>largest.length)largest=component;
 }
 const mask=new Uint8Array(n);for(const i of largest)mask[i]=1;
 // Remove a single low-chroma exterior matte pixel, not the painted brown/green
 // outline, before antialiasing. This prevents pale JPEG checker fringes.
 const matte=[];
 for(let i=0;i<n;i++)if(mask[i]){const x=i%w,k=i*3;const boundary=(!x||x===w-1||i<w||i>=n-w||!mask[i-1]||!mask[i+1]||!mask[i-w]||!mask[i+w]);if(boundary&&Math.min(rgb[k],rgb[k+1],rgb[k+2])>100&&Math.max(rgb[k],rgb[k+1],rgb[k+2])-Math.min(rgb[k],rgb[k+1],rgb[k+2])<55)matte.push(i);}
 for(const i of matte)mask[i]=0;
 const rgba=Buffer.alloc(n*4);let opaque=0,transparent=0,soft=0,protectedWhite=0;
 for(let i=0;i<n;i++){const x=i%w,k=i*3,o=i*4;let alpha=0;
  if(mask[i]){const boundary=(!x||x===w-1||i<w||i>=n-w||!mask[i-1]||!mask[i+1]||!mask[i-w]||!mask[i+w]);alpha=boundary?128:255;}
  // RGB is copied directly, including every interior white petal and highlight.
  rgba[o]=rgb[k];rgba[o+1]=rgb[k+1];rgba[o+2]=rgb[k+2];rgba[o+3]=alpha;
  if(alpha===255){opaque++;if(Math.min(rgb[k],rgb[k+1],rgb[k+2])>215)protectedWhite++;}else if(alpha===0)transparent++;else soft++;
 }
 await sharp(rgba,{raw:{width:w,height:h,channels:4}}).png().toFile(target);
 const report={sourceSha256:createHash('sha256').update(fs.readFileSync(source)).digest('hex'),outputSha256:createHash('sha256').update(fs.readFileSync(target)).digest('hex'),source:'assets/ui/멈춤버튼.jpg',output:'assets/ui/멈춤버튼.png',dimensions:[w,h],format:'PNG',channels:'RGBA',method:'edge-connected neutral-background flood fill; enclosed whites protected; largest subject component; one-pixel alpha antialiasing',opaquePixels:opaque,transparentPixels:transparent,edgePixels:soft,interiorLightPixelsPreserved:protectedWhite,exteriorMattePixelsRemoved:matte.length,subjectRgb:'copied byte-for-byte from source JPEG decode; no recoloring or synthesis',threshold:{minimumChannel:130,maximumChannelSpread:30}};
 fs.writeFileSync(path.join(root,'tools/pause-icon-processing-report.json'),JSON.stringify(report,null,2)+'\n');
 // Inspection artifacts, not shipped to the game.
 const out=path.join(root,'work/validation');fs.mkdirSync(out,{recursive:true});
 for(const [label,color]of [['dark','#263f50'],['green','#91b8a2'],['cream','#fff5df']])await sharp(target).flatten({background:color}).png().toFile(path.join(out,`pause-cutout-${label}.png`));
 console.log(JSON.stringify(report));
})();
