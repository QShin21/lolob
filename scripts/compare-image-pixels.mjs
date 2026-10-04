import {execFileSync} from 'node:child_process';

/** Decode PNG pixels, avoiding enormous Buffer diffs and encoded-file metadata. */
export function imagePixelDifference(before,after,{inset=0}={}){
 if(before.equals(after))return{changedPixels:0,maxChannelDelta:0};
 const python=process.env.RIFTCAST_PYTHON_EXECUTABLE||'python';
 const code=`import sys,json,base64,io
from PIL import Image,ImageChops
p=json.load(sys.stdin)
a=Image.open(io.BytesIO(base64.b64decode(p['before']))).convert('RGBA')
b=Image.open(io.BytesIO(base64.b64decode(p['after']))).convert('RGBA')
if a.size!=b.size: raise ValueError('PNG dimensions differ')
if p['inset']:
 n=p['inset']; a=a.crop((n,n,a.width-n,a.height-n)); b=b.crop((n,n,b.width-n,b.height-n))
diff=ImageChops.difference(a,b)
d=list(diff.get_flattened_data() if hasattr(diff,'get_flattened_data') else diff.getdata())
print(json.dumps({'changedPixels':sum(any(v) for v in d),'maxChannelDelta':max((max(v) for v in d),default=0)}))`;
 return JSON.parse(execFileSync(python,['-c',code],{input:JSON.stringify({before:before.toString('base64'),after:after.toString('base64'),inset}),encoding:'utf8',env:{...process.env,PYTHONIOENCODING:'utf-8'}}));
}
