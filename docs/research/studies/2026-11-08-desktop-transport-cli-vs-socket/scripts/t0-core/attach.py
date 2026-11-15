import pty,os,sys,fcntl,termios,struct,time,select
name=sys.argv[1]
pid,fd=pty.fork()
if pid==0:
    os.execvp("hc",["hc","attach",name])
def setsz(r,c): fcntl.ioctl(fd,termios.TIOCSWINSZ,struct.pack("HHHH",r,c,0,0))
setsz(30,100)
def drain(t):
    end=time.time()+t
    while time.time()<end:
        r,_,_=select.select([fd],[],[],0.2)
        if r:
            try: os.read(fd,65536)
            except OSError: return
drain(2); setsz(40,120); drain(2); setsz(25,80); drain(2)
os.write(fd,b"\x1c"); drain(1)
