#!/usr/bin/env python3
"""Print "light" or "dark" for the terminal's background, for any terminal.

1. Ask the terminal (OSC 11). Ghostty, iTerm2, kitty, WezTerm, Alacritty, foot, Terminal.app,
   the VS Code terminal, Windows Terminal and tmux 3.3+ answer; the reply may end in BEL or ESC \\.
   A device-attributes query (DA1, which every terminal answers) goes out right after it: if the
   DA1 reply comes back with no OSC 11 reply, the terminal does not support the question, so we stop
   at once instead of waiting.
2. Else COLORFGBG ("fg;bg", set by rxvt, Konsole and others): bg 0-6 or 8 is dark.
3. Else print nothing; the launcher falls back to the macOS appearance.

Replaces a bash `read -t 0.4` that macOS's bash 3.2 rejects (no fractional timeouts).
"""
import os, re, select, sys, time

OSC11 = re.compile(rb"\x1b\]11;rgb:([0-9a-fA-F]+)/([0-9a-fA-F]+)/([0-9a-fA-F]+)")
DA1 = re.compile(rb"\x1b\[\?[0-9;]*c")


def ask_terminal(timeout: float) -> str:
    try:
        import termios, tty
        fd = os.open("/dev/tty", os.O_RDWR | os.O_NOCTTY)
    except (OSError, ImportError):
        return ""
    reply = b""
    try:
        old = termios.tcgetattr(fd)
    except termios.error:
        os.close(fd)
        return ""
    try:
        tty.setraw(fd)
        os.write(fd, b"\x1b]11;?\x1b\\\x1b[c")
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            r, _, _ = select.select([fd], [], [], max(0.0, deadline - time.monotonic()))
            if not r:
                break
            reply += os.read(fd, 512)
            if DA1.search(reply):  # DA1 always answers last, so the OSC 11 reply (if any) is in
                break
    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, old)
        os.close(fd)
    m = OSC11.search(reply)
    if not m:
        return ""
    # 1 to 4 hex digits per channel (ff or ffff); scale each to 0-255.
    r, g, b = (int(x, 16) * 255 / (16 ** len(x) - 1) for x in m.groups())
    return "light" if (r * 299 + g * 587 + b * 114) / 1000 > 127 else "dark"


def from_colorfgbg(value: str) -> str:
    parts = value.split(";")
    if len(parts) < 2 or not parts[-1].isdigit():
        return ""
    bg = int(parts[-1])
    return "dark" if bg < 7 or bg == 8 else "light"


def main() -> int:
    kind = ask_terminal(float(os.environ.get("LAURELIN_BG_TIMEOUT", "0.8")))
    if not kind:
        kind = from_colorfgbg(os.environ.get("COLORFGBG", ""))
    if kind:
        print(kind)
    return 0


if __name__ == "__main__":
    sys.exit(main())
