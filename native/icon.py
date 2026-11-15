# icon.py — the app icon from one drawing: the field of the app (dark window, strand arcs where they sit: a right,
# x bottom, v left, l on top), coral on cream. Writes the web sizes (copy them to signclip/sign app/icons/) and the
# Android launcher icons (native/android/res). Run once when the icon changes: python3 native/icon.py (needs rsvg-convert).
import math, subprocess, os
BG, CORAL, WIN = '#FFFBF7', '#f5a08a', '#2F323A'
def arc(cx, cy, r, a, b):  # app degrees: 0 = top, clockwise
    p = lambda d: (cx + r*math.sin(math.radians(d)), cy - r*math.cos(math.radians(d)))
    (x0,y0),(x1,y1) = p(a), p(b)
    return f'M{x0:.1f} {y0:.1f} A{r} {r} 0 {1 if b-a>180 else 0} 1 {x1:.1f} {y1:.1f}'
def mark(s=1.0, c=256):
    # window r 112, strand arcs r 156 w 30 (a right, x bottom, v left), l on top outside r 192 w 18
    parts = [f'<circle cx="{c}" cy="{c}" r="{112*s:.1f}" fill="{WIN}"/>']
    for a, b in [(60,140),(140,220),(220,300)]:
        parts.append(f'<path d="{arc(c,c,156*s,a+7,b-7)}" stroke="{CORAL}" stroke-width="{30*s:.1f}" stroke-linecap="round" fill="none"/>')
    parts.append(f'<path d="{arc(c,c,192*s,-26,26)}" stroke="{CORAL}" stroke-width="{18*s:.1f}" stroke-linecap="round" fill="none"/>')
    return ''.join(parts)
def svg(bg, s=1.0):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">{bg}{mark(s)}</svg>'
full = f'<rect width="512" height="512" fill="{BG}"/>'
rounded = f'<rect width="512" height="512" rx="112" fill="{BG}"/>'
circle = f'<circle cx="256" cy="256" r="256" fill="{BG}"/>'
os.chdir(os.path.dirname(os.path.abspath(__file__))); os.makedirs('web', exist_ok=True); os.makedirs('android/res', exist_ok=True)
open('web/icon.svg','w').write(svg(rounded))           # browser tab, PWA "any"
open('web/maskable.svg','w').write(svg(full, 0.86))          # PWA maskable: everything inside the 80 % circle
open('web/round.svg','w').write(svg(circle, 0.92))
open('web/fg.svg','w').write(svg('', 0.62))                  # Android adaptive foreground: inside the 66/108 safe zone
def png(src, size, out): subprocess.run(['rsvg-convert', '-w', str(size), '-h', str(size), src, '-o', out], check=True)
png('web/icon.svg', 192, 'web/icon-192.png'); png('web/icon.svg', 512, 'web/icon-512.png')
png('web/maskable.svg', 512, 'web/icon-maskable-512.png'); png('web/maskable.svg', 180, 'web/apple-touch-icon.png')
for d, n in [('mdpi',48),('hdpi',72),('xhdpi',96),('xxhdpi',144),('xxxhdpi',192)]:
    o = f'android/res/mipmap-{d}'; os.makedirs(o, exist_ok=True)
    png('web/icon.svg', n, f'{o}/ic_launcher.png'); png('web/round.svg', n, f'{o}/ic_launcher_round.png'); png('web/fg.svg', round(n*108/48), f'{o}/ic_launcher_foreground.png')
os.makedirs('android/res/values', exist_ok=True)
open('android/res/values/ic_launcher_background.xml','w').write(f'<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">{BG}</color>\n</resources>\n')
