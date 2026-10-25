"""Extract only exterior white matte; never redraw, resize, recolor or replace originals.
Requires Pillow, numpy and scipy. Opaque subject RGB is copied byte-for-byte.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image
from scipy.ndimage import binary_fill_holes, distance_transform_edt
ROOT=Path(__file__).resolve().parents[1]
report=[]
for index in range(1,7):
    source=ROOT/f'assets/items/귤{index}.jpg'
    im=Image.open(source).convert('RGB')
    rgb=np.array(im)
    # Enclosed highlights belong to the artwork. Retain the source's narrow
    # cream rim, while excluding the broad near-white JPEG background/glow.
    minimum=rgb.min(axis=2).astype(float)
    subject=binary_fill_holes(minimum<205)
    outside_distance=distance_transform_edt(~subject)
    alpha=np.clip((7.5-outside_distance)/1.5,0,1)
    # JPEG white-matte colors are unassociated at translucent edges. On white,
    # the result reconstructs the source (apart from discarded near-white noise).
    unmatte=255-(255-rgb.astype(float))/np.maximum(alpha[:,:,None],1/255)
    output=np.clip(np.rint(unmatte),0,255).astype(np.uint8)
    output[alpha==1]=rgb[alpha==1]
    output[alpha==0]=0
    rgba=np.dstack([output,np.rint(alpha*255).astype(np.uint8)])
    target=source.with_suffix('.png')
    Image.fromarray(rgba,'RGBA').save(target,icc_profile=im.info.get('icc_profile'))
    assert np.array_equal(output[alpha==1],rgb[alpha==1])
    assert np.all(rgba[0,:,3]==0) and np.all(rgba[-1,:,3]==0)
    assert np.all(rgba[:,0,3]==0) and np.all(rgba[:,-1,3]==0)
    report.append({'source':str(source.relative_to(ROOT)),'output':str(target.relative_to(ROOT)),
                   'size':list(im.size),'opaque_pixels_unchanged':int((alpha==1).sum()),
                   'transparent_pixels':int((alpha==0).sum()),'edge_alpha_zero':True})
print(json.dumps(report,ensure_ascii=False,indent=2))
