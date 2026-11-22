import re,sys,glob,subprocess
sys.path.insert(0,'/home/crisap94/.cache/claude-tmp/claude-1000/-home-crisap94-Projects-homelab-herdr-plugins/5df8c745-d50d-4929-a82a-115aaadb2fdc/scratchpad/run/wt')
from sub import need
files=subprocess.run("find test src bin -name '*.ts'",shell=True,capture_output=True,text=True).stdout.split()
lit=r"('(?:[^'\\]|\\.)*'|`(?:[^`\\$]|\\.)*`)"
rules=[
 (r"(kind: 'located'(?: as const)?, source: )(`[^`]*`|[A-Za-z_][\w.]*(?:\([^()]*(?:\([^()]*\))?[^()]*\))?)(?=\s*[,}])", r"\1sourcePathOf(\2)", 'sourcePathOf','#src/ports/transcripts.ts'),
 (r"(position: \{ cursor: )([A-Za-z_][\w.]*(?: [+-] \d+)?)(?=\s*,)", r"\1cursorOf(\2)", 'cursorOf','#src/ports/transcripts.ts'),
 (r"(kind: 'located', source: )"+lit+r"(?=\s*[,}])", r"\1sourcePathOf(\2)", 'sourcePathOf','#src/ports/transcripts.ts'),
 (r"(kind: 'in-flight', count: )(\d+)(?=\s*[,}])", r"\1runningOf(\2)", 'runningOf','#src/recap/domain/in-flight.ts'),
 (r"(position: \{ cursor: )(\d+)(?=\s*[,}])", r"\1cursorOf(\2)", 'cursorOf','#src/ports/transcripts.ts'),
 (r"(kind: 'chunk'.*?\bgrew: )(true|false)(?=\s*[,}])", r"\1grewOf(\2)", 'grewOf','#src/ports/transcripts.ts'),
 (r"(kind: '(?:compacted|compaction-failed)', at: )(\d+)(?=\s*[,}])", r"\1instant(\2)", 'instant','#src/recap/domain/time.ts'),
 (r"(kind: '(?:compaction|away_summary)', at: )(\d+)(?=\s*[,}])", r"\1instant(\2)", 'instant','#src/recap/domain/time.ts'),
 (r"(kind: '(?:compaction|away_summary)', at: (?:instant\(\d+\)|null), text: )"+lit+r"(?=\s*[,}])", r"\1textOf(\2)", 'textOf','#src/recap/domain/text.ts'),
 (r"(tokensBefore: |tokensAfter: )(\d+)(?=\s*[,}])", r"\1countOf(\2)", 'countOf','#src/recap/domain/count.ts'),
 (r"(tookMs: )(\d+)(?=\s*[,}])", r"\1duration(\2)", 'duration','#src/recap/domain/time.ts'),
]
for f in files:
    s=open(f).read(); o=s; names=set()
    for pat,rep,name,mod in rules:
        if f.endswith('legacy.ts') and 'src/' in f: continue
        if f.startswith('src/') and not ('replay' in f): continue
        n=re.sub(pat,rep,s)
        if n!=s: names.add((name,mod)); s=n
    if s!=o:
        open(f,'w').write(s)
        for name,mod in names:
            if re.search(r"(?:import[^;]*\b"+name+r"\b[^;]*;|(?:const|function)\s+"+name+r"\b)",s) is None: need(f,mod,[name])
        print(f)
