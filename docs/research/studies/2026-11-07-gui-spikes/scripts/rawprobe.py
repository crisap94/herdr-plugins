import sys,tty,termios,os,time
tty.setraw(0); sys.stdout.write("\x1b[?2004h"); sys.stdout.flush()
log=open(sys.argv[1],"ab",buffering=0)
while True:
    b=os.read(0,4096)
    if not b: break
    log.write(repr(b).encode()+b"\n")
