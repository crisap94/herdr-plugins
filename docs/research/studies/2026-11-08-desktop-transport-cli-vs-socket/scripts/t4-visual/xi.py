import ctypes, sys, time
x11 = ctypes.CDLL("libX11.so.6"); xt = ctypes.CDLL("libXtst.so.6")
x11.XOpenDisplay.restype = ctypes.c_void_p
d = x11.XOpenDisplay(b":74")
def move(x, y):
    xt.XTestFakeMotionEvent(ctypes.c_void_p(d), -1, int(x), int(y), 0); x11.XFlush(ctypes.c_void_p(d))
def button(n, down):
    xt.XTestFakeButtonEvent(ctypes.c_void_p(d), n, 1 if down else 0, 0); x11.XFlush(ctypes.c_void_p(d))
def click(x, y):
    move(x, y); time.sleep(0.3); button(1, True); time.sleep(0.08); button(1, False)
def wheel(x, y, n):
    move(x, y); time.sleep(0.2)
    for _ in range(abs(n)):
        b = 5 if n > 0 else 4
        button(b, True); button(b, False); time.sleep(0.05)
cmd = sys.argv[1]; a = [int(v) for v in sys.argv[2:]]
{"move": move, "click": click, "wheel": wheel}[cmd](*a)
