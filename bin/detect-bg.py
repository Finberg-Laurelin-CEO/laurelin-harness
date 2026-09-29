#!/usr/bin/env python3
"""Print "light" or "dark" for the terminal's background.

Asks the terminal with OSC 11 and accepts either reply ending (BEL or ESC \\), which
Ghostty, iTerm2, WezTerm, kitty and Terminal.app use. Prints nothing when there is no
answer, so the caller can fall back. Replaces a bash `read -t 0.4` that macOS's bash 3.2
rejects (no fractional timeouts), which made every terminal look dark on a dark-mode Mac.
"""
import os, re, select, sys, termios, time, tty

def main() -> int:
    try:
        fd = os.open("/dev/tty", os.O_RDWR | os.O_NOCTTY)
    except OSError:
        return 0
    old = termios.tcgetattr(fd)
    reply = b""
    try:
        tty.setraw(fd)
        os.write(fd, b"\x1b]11;?\x1b\\")
        deadline = time.monotonic() + float(os.environ.get("LAURELIN_BG_TIMEOUT", "0.6"))
        while time.monotonic() < deadline:
            r, _, _ = select.select([fd], [], [], max(0.0, deadline - time.monotonic()))
            if not r:
                break
            reply += os.read(fd, 256)
            if b"\x07" in reply or b"\x1b\\" in reply:
                break
    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, old)
        os.close(fd)
    m = re.search(rb"rgb:([0-9a-fA-F]+)/([0-9a-fA-F]+)/([0-9a-fA-F]+)", reply)
    if not m:
        return 0
    r, g, b = (int(x[:2], 16) for x in m.groups())
    print("light" if (r * 299 + g * 587 + b * 114) / 1000 > 127 else "dark")
    return 0

if __name__ == "__main__":
    sys.exit(main())
