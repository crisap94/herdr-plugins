import sys,subprocess,re
sys.path.insert(0,'/home/crisap94/.cache/claude-tmp/claude-1000/-home-crisap94-Projects-homelab-herdr-plugins/5df8c745-d50d-4929-a82a-115aaadb2fdc/scratchpad/run/wt')
from sub import need
files=subprocess.run(['git','diff','--name-only','--relative','.'],capture_output=True,text=True).stdout.split()
for f in files:
    if not f.endswith('.ts'): continue
    s=open(f).read()
    def declared(name):
        return re.search(r"(?:import[^;]*\b"+name+r"\b[^;]*;|(?:const|function)\s+"+name+r"\b)",s) is not None
    if re.search(r"\btextOf\(",s) and not declared('textOf'): need(f,'#src/recap/domain/text.ts',['textOf']); print('text',f)
    if re.search(r"\binstant\(",s) and not declared('instant'): need(f,'#src/recap/domain/time.ts',['instant']); print('instant',f)
