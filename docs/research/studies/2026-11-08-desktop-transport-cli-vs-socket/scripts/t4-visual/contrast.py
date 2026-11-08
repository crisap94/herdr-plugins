import sys
from PIL import Image
from collections import Counter
def lum(c):
    def f(v):
        v/=255
        return v/12.92 if v<=0.03928 else ((v+0.055)/1.055)**2.4
    r,g,b=c[:3]; return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)
def ratio(a,b):
    la,lb=lum(a),lum(b); hi,lo=max(la,lb),min(la,lb); return (hi+0.05)/(lo+0.05)
def measure(path, box):
    im=Image.open(path).convert('RGB').crop(box)
    px=list(im.getdata())
    bg=Counter(px).most_common(1)[0][0]
    fg=max(px,key=lambda p:ratio(p,bg))
    return bg,fg,round(ratio(bg,fg),2)
if __name__=='__main__':
    path=sys.argv[1]; box=tuple(int(v) for v in sys.argv[2:6]); print(measure(path,box))
