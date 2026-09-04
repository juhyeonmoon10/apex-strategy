"""F1 공식 서킷 지도(PNG, 섹터별 색 선)에서 트랙 중심선을 뽑아 순서 있는 점 목록으로 만든다.

    python tools/trace_maps.py            # tools/maps/*.png → src/data/trackPaths.js

원리
  1. 섹터 색(빨강 S1 · 파랑 S2 · 노랑 S3)과 스피드트랩 점(자홍) 픽셀만 남긴다.
     DRS 존(초록 점선·상자)과 글자(흰색)는 빠진다.
  2. 작은 덩어리("SECTOR 1" 글자)를 버리고 Zhang-Suen 세선화로 1픽셀 선을 만든다.
  3. 끝점에서 출발해 이웃을 따라 걷고, 끊긴 곳(DRS 감지점 등)은 가장 가까운 끝점으로 건너뛴다.
  4. 색 순서가 빨강→파랑→노랑이 되도록 방향을 맞추고, 노랑→빨강으로 바뀌는 곳(결승선)을 시작점으로 돌린다.
  5. 호 길이로 균등하게 240점을 다시 찍고 1000×562 좌표로 정규화한다.
검증에 실패한 서킷은 목록에서 빠지고, 화면은 도식 트랙으로 대체한다.
"""
import json, os, sys, math
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'maps')
OUT = os.path.join(HERE, '..', 'src', 'data', 'trackPaths.js')
N_POINTS = 240
VW, VH = 1000, 562

# 지도 파일명 → 서킷 id (src/data/circuits.js)
KEYS = {
    'Australia': 'australia', 'China': 'china', 'Japan': 'japan', 'Bahrain': 'bahrain', 'Saudi_Arabia': 'saudi',
    'Miami': 'miami', 'Canada': 'canada', 'Monaco': 'monaco', 'Spain': 'barcelona', 'Austria': 'austria',
    'Great_Britain': 'britain', 'Belgium': 'belgium', 'Hungary': 'hungary', 'Netherlands': 'netherlands',
    'Italy': 'italy', 'Singapore': 'singapore', 'USA': 'usa', 'Mexico': 'mexico', 'Brazil': 'brazil',
    'Las_Vegas': 'lasvegas', 'Qatar': 'qatar', 'Abu_Dhabi': 'abudhabi',
}
RED, BLUE, YELLOW, MAGENTA = (255, 0, 0), (0, 178, 228), (255, 211, 0), (255, 0, 255)


def near(rgb, c, tol=70):
    return np.abs(rgb.astype(int) - np.array(c)).sum(axis=2) < tol


def components(mask):
    """8-연결 성분 라벨링 (BFS). 반환: labels(int32), 개수"""
    H, W = mask.shape
    labels = np.zeros((H, W), np.int32)
    ys, xs = np.nonzero(mask)
    n = 0
    for y0, x0 in zip(ys, xs):
        if labels[y0, x0]:
            continue
        n += 1
        stack = [(y0, x0)]
        labels[y0, x0] = n
        while stack:
            y, x = stack.pop()
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    yy, xx = y + dy, x + dx
                    if 0 <= yy < H and 0 <= xx < W and mask[yy, xx] and not labels[yy, xx]:
                        labels[yy, xx] = n
                        stack.append((yy, xx))
    return labels, n


def zhang_suen(img):
    """img: bool 배열. 1픽셀 두께 골격을 돌려준다."""
    img = img.copy().astype(np.uint8)
    changed = True
    while changed:
        changed = False
        for step in (0, 1):
            P = np.pad(img, 1)
            p2 = P[:-2, 1:-1]; p3 = P[:-2, 2:]; p4 = P[1:-1, 2:]; p5 = P[2:, 2:]
            p6 = P[2:, 1:-1]; p7 = P[2:, :-2]; p8 = P[1:-1, :-2]; p9 = P[:-2, :-2]
            nb = [p2, p3, p4, p5, p6, p7, p8, p9]
            B = sum(n.astype(int) for n in nb)
            A = sum(((nb[k] == 0) & (nb[(k + 1) % 8] == 1)).astype(int) for k in range(8))
            if step == 0:
                c1 = (p2 * p4 * p6) == 0; c2 = (p4 * p6 * p8) == 0
            else:
                c1 = (p2 * p4 * p8) == 0; c2 = (p2 * p6 * p8) == 0
            rem = (img == 1) & (B >= 2) & (B <= 6) & (A == 1) & c1 & c2
            if rem.any():
                img[rem] = 0
                changed = True
    return img.astype(bool)


def prune(skel, n=14):
    """짧은 가지(스퍼) 제거: 끝점을 n 번 깎는다."""
    img = skel.copy()
    for _ in range(n):
        P = np.pad(img, 1).astype(int)
        nb = sum(P[1 + dy:P.shape[0] - 1 + dy, 1 + dx:P.shape[1] - 1 + dx]
                 for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dy or dx)
        ends = img & (nb <= 1)
        if not ends.any():
            break
        img = img & ~ends
    return img


def order_points(skel):
    """골격 픽셀을 한 줄로 잇는다.
    지나간 자리 반경 2px 를 방문 처리해 계단 모양의 대각 이웃이 남지 않게 하고,
    막히면 90px 이내의 가장 가까운 미방문 픽셀로 건너뛴다 (DRS 감지점 등으로 끊긴 곳)."""
    skel = prune(skel)
    ys, xs = np.nonzero(skel)
    arr = np.stack([ys, xs], axis=1).astype(float)
    n = len(arr)
    vis = np.zeros(n, bool)
    # 끝점(이웃 1개)에서 출발하면 방향이 안정적이다
    P = np.pad(skel, 1).astype(int)
    nb = sum(P[1 + dy:P.shape[0] - 1 + dy, 1 + dx:P.shape[1] - 1 + dx]
             for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dy or dx)
    ends = np.nonzero(nb[ys, xs] == 1)[0]
    cur = int(ends[0]) if len(ends) else 0
    path = []
    jumps = []
    vel = np.zeros(2)
    while True:
        path.append(cur)
        d2 = ((arr - arr[cur]) ** 2).sum(axis=1)
        vis[d2 <= 4.0] = True
        d2[vis] = 1e12
        near = np.nonzero(d2 <= 8.0)[0]
        if len(near):
            if len(path) >= 2:
                dirs = arr[near] - arr[cur]
                score = dirs @ vel
                nxt = int(near[int(score.argmax())])
            else:
                nxt = int(near[0])
        else:
            k = int(d2.argmin())
            d = math.sqrt(d2[k])
            if d > 90:
                break
            jumps.append(d)
            nxt = k
        step = arr[nxt] - arr[cur]
        L = np.linalg.norm(step)
        if L > 0:
            vel = 0.7 * vel + 0.3 * (step / L)
        cur = nxt
    pts_out = [tuple(int(v) for v in arr[i]) for i in path]
    return pts_out, jumps, int((~vis).sum())


def resample(path, n):
    P = np.array(path, float)
    P = np.vstack([P, P[:1]])          # 닫기
    seg = np.linalg.norm(np.diff(P, axis=0), axis=1)
    cum = np.concatenate([[0], np.cumsum(seg)])
    L = cum[-1]
    t = np.linspace(0, L, n, endpoint=False)
    out = []
    for v in t:
        k = np.searchsorted(cum, v, side='right') - 1
        k = min(k, len(seg) - 1)
        f = (v - cum[k]) / seg[k] if seg[k] else 0
        out.append(P[k] + (P[k + 1] - P[k]) * f)
    return np.array(out), L


def trace(fn):
    im = Image.open(fn).convert('RGBA')
    a = np.array(im)
    rgb = a[:, :, :3].copy()
    rgb[a[:, :, 3] < 128] = 0
    mask = near(rgb, RED) | near(rgb, BLUE) | near(rgb, YELLOW) | near(rgb, MAGENTA)
    labels, n = components(mask)
    keep = np.zeros_like(mask)
    for k in range(1, n + 1):
        m = labels == k
        cnt = int(m.sum())
        ys, xs = np.nonzero(m)
        bw, bh = xs.max() - xs.min() + 1, ys.max() - ys.min() + 1
        if cnt >= 3000 or (cnt >= 800 and min(bw, bh) >= 70):
            keep |= m
    skel = zhang_suen(keep)
    path, jumps, left = order_points(skel)
    P = np.array(path, float)
    # 방향: 빨강 → 파랑 → 노랑 순이어야 한다. 색 중심의 순서로 판단
    def colour_at(p):
        y, x = int(p[0]), int(p[1])
        win = rgb[max(0, y - 6):y + 7, max(0, x - 6):x + 7].reshape(-1, 3)
        best, bd = None, 1e9
        for name, c in (('r', RED), ('b', BLUE), ('y', YELLOW)):
            d = np.abs(win.astype(int) - np.array(c)).sum(axis=1).min()
            if d < bd: best, bd = name, d
        return best if bd < 70 else None
    cols = [colour_at(p) for p in P[:: max(1, len(P) // 400)]]
    cols = [c for c in cols if c]
    def first_index(c):
        return cols.index(c) if c in cols else 10 ** 9
    order = sorted('rby', key=first_index)
    # 회전 순서 r→b→y 인지 (r,b,y) / (b,y,r) / (y,r,b) 중 하나
    forward = ''.join(order) in ('rby', 'byr', 'yrb')
    if not forward:
        P = P[::-1]
    # 시작점: 노랑 → 빨강 전환 (결승선)
    step = max(1, len(P) // 600)
    seq = [(i, colour_at(P[i])) for i in range(0, len(P), step)]
    seq = [(i, c) for i, c in seq if c]
    start = 0
    for (i0, c0), (i1, c1) in zip(seq, seq[1:] + seq[:1]):
        if c0 == 'y' and c1 == 'r':
            start = i1; break
    P = np.vstack([P[start:], P[:start]])
    closure = math.dist(P[0], P[-1])
    Q, L = resample(P.tolist(), N_POINTS)
    # 정규화 → 1000×562 안에 여백 6% 로 맞춤
    ymin, xmin = Q.min(axis=0); ymax, xmax = Q.max(axis=0)
    w, hgt = xmax - xmin, ymax - ymin
    s = min((VW * 0.88) / w, (VH * 0.88) / hgt)
    ox = (VW - w * s) / 2 - xmin * s; oy = (VH - hgt * s) / 2 - ymin * s
    pts = [[round(float(x * s + ox), 1), round(float(y * s + oy), 1)] for y, x in Q]
    info = dict(pixels=int(skel.sum()), jumps=[round(j) for j in jumps], unvisited=int(left), closure=round(closure), length=round(L))
    ok = closure < 90 and left < 0.15 * skel.sum() and all(j < 90 for j in jumps)
    return pts, info, ok


def main():
    out = {}
    for key, cid in KEYS.items():
        fn = os.path.join(SRC, key + '.png')
        if not os.path.exists(fn):
            print(f'{key:14} (없음)'); continue
        try:
            pts, info, ok = trace(fn)
        except Exception as e:  # noqa
            print(f'{key:14} 실패: {e}'); continue
        print(f'{key:14} {"OK " if ok else "X  "} skel={info["pixels"]} jumps={info["jumps"]} unvisited={info["unvisited"]} closure={info["closure"]}')
        if ok:
            out[cid] = pts
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write('// 자동 생성 — tools/trace_maps.py. F1 공식 서킷 지도에서 뽑은 트랙 중심선 (1000×562 좌표, 결승선에서 시작, 주행 방향 순).\n')
        f.write(f'export const TRACK_VIEW = [{VW}, {VH}];\n')
        f.write('export const TRACK_PATHS = {\n')
        for cid, pts in out.items():
            f.write(f'  {cid}: {json.dumps(pts, separators=(",", ":"))},\n')
        f.write('};\n')
    print(f'{len(out)}개 서킷 → {OUT}')


if __name__ == '__main__':
    main()
