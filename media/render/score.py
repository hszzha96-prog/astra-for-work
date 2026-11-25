import argparse
import math
import wave
import numpy as np

parser = argparse.ArgumentParser(description='Generate the original Astra for Work stereo score.')
parser.add_argument('output', nargs='?', default='score.wav')
args = parser.parse_args()

rate = 48_000
duration = 30
total = rate * duration
mix = np.zeros((total, 2), dtype=np.float64)
rng = np.random.default_rng(261126)
sections = [(0, 5), (5, 10), (10, 17), (17, 23), (23, 30)]
chords = [[50,57,61,64], [47,54,57,62], [43,50,57,59], [45,52,57,62], [50,57,62,66]]
melodies = [
    [(0.48,74,.115), (2.22,69,.075), (3.98,76,.077)],
    [(0.22,71,.119), (1.83,74,.085), (3.33,78,.096)],
    [(0.16,71,.115), (1.48,74,.079), (3.05,81,.085), (5.5,78,.071)],
    [(0.14,69,.116), (1.68,76,.082), (3.62,74,.095), (4.89,69,.064)],
    [(0.25,74,.118), (1.9,78,.085), (3.28,81,.08), (4.37,78,.056), (5.21,74,.091)],
]

def ease(x):
    u = np.clip(x, 0, 1)
    return u*u*(3-2*u)

def add(start, mono, pan=0):
    k = round(rate*start)
    a, b = max(-k, 0), min(total-k, len(mono))
    if a < b:
        angle = (pan+1)*math.pi/4
        mix[k+a:k+b] += mono[a:b,None]*np.array([math.cos(angle), math.sin(angle)])

def freq(note):
    return 440*2**((note-69)/12)

def chime(start, midi, level, pan):
    t=np.arange(round(2.75*rate))/rate
    f=freq(midi)
    ring=np.zeros_like(t)
    for ratio,amp,decay in [(1,1,1.53),(2,.17,1.90),(3.01,.06,2.9),(4.1,.024,4.1)]:
        ring += amp * np.sin(2*np.pi*f*ratio*t) * np.exp(-t*decay)
    ring *= level*(1-np.exp(-t*45))*ease((2.75-t)/.38)
    add(start,ring,pan)
    for delay,scale,p in [(.18,.16,-pan),(.33,.08,pan*.62),(.49,.045,-pan*.54)]:
        add(start+delay,ring*scale,p)

for i,((begin,end),notes,phrase) in enumerate(zip(sections,chords,melodies)):
    start=max(0,begin-.8)
    length=min(duration-start,end+.83-start)
    t=np.arange(round(rate*length))/rate
    env=ease(t/1.3)*ease((length-t)/1.43)
    for j,n in enumerate(notes):
        f=freq(n); phase=rng.uniform(-np.pi,np.pi)
        wavelet=(np.sin(2*np.pi*f*t+phase+.054*np.sin(.72*t))
                 +.22*np.sin(2*np.pi*f*1.0019*t+phase+.13*np.sin(.44*t+j))
                 +.105*np.sin(2*np.pi*f*2*t+phase))
        add(start,wavelet*(.075 if j==0 else .032)*env*(.90+.10*np.cos(t*.47+j)),[-.14,.38,-.40,.13][j])
    for j,(offset,midi,level) in enumerate(phrase):
        chime(begin+offset,midi,level,[-.32,.36,-.16,.30,-.2][j])
    if i:
        t=np.arange(round(1.4*rate))/rate
        noise=np.convolve(rng.normal(size=len(t)),np.ones(23)/23,mode='same')
        noise-=np.convolve(noise,np.ones(79)/79,mode='same')
        sweep=np.sin(np.pi*t/1.4)**2 * .028 * noise
        add(begin-.83,sweep,-.35)
        add(begin-.79,sweep*.60,.46)

timeline=np.arange(total)/rate
mix *= (ease(timeline/.35)*ease((duration-timeline)/1.2))[:,None]
mix *= .48/np.max(np.abs(mix))
with wave.open(args.output,'wb') as w:
    w.setnchannels(2);w.setsampwidth(2);w.setframerate(rate);w.writeframes((mix*32767).astype('<i2').tobytes())
