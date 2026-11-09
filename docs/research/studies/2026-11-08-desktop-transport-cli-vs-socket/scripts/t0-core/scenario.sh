#!/bin/bash
osc() { printf '\033]7501;app=fakeagent:state=%s\007' "$1"; }
title() { printf '\033]0;%s\007' "$1"; }
sleep 6
title "t03 first title"; sleep 4
osc working; sleep 5
title "t03 second title"; sleep 3
osc blocked; sleep 5
osc idle; sleep 4
osc done; sleep 4
osc working; sleep 3
osc idle; sleep 3
exec sleep 3000
