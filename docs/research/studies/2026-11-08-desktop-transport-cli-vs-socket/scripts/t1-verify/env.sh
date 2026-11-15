source "$HOME/.cache/hcs/visual-env.sh"
export HC_SESSION=t1v
unset HC_TERMINAL_SOCKET HC_TERMINAL_ID HC_SCOPE WAYLAND_DISPLAY DISPLAY
export HC_SHIM_LOG="$HOME/.cache/hcs/t1-shim/hc-calls.log"
export PATH="$HOME/.cache/hcs/t1-shim:$PATH"
