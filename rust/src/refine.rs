//! The second look (SPEC.md, decoder step 8): when the ordinary search finds
//! nothing, a few maps whose format information already agrees are read again
//! with their module centres moved onto the edges the picture shows, sampling
//! grey rather than black and white.

use crate::binarise::{threshold_at, Luminance, Thresholds};
use crate::locate::Work;
use crate::place::{Location, Point};
use crate::symbol::{read_symbol, read_version, Ecc, Payload, FORMATS, FORMAT_COORDS};
use crate::tables::ALIGNMENT_CENTRES;

/// Both format copies within this many bits of the same format word.
const AGREEMENT: u32 = 2;
/// Maps read again, at most, per decode.
pub const SECOND_LOOKS: usize = 4;

/// A map the ordinary read could not use, retained for a later read.
#[derive(Clone, Debug)]
pub struct Candidate {
    pub location: Location,
    pub inverted: bool,
    pub mirrored: bool,
    pub ecc: Ecc,
    pub mask: u8,
    /// Ordinary candidates use the larger format distance; deferred candidates use the smaller.
    pub distance: u32,
}

/// The format word both copies are nearest, with its orientation and distance.
pub struct Agreed {
    pub mirrored: bool,
    pub ecc: Ecc,
    pub mask: u8,
    pub distance: u32,
}

/// The two copies of the format information, as 15-bit words, read through `read`.
fn format_words<R: Fn(usize, usize) -> bool>(read: &R, size: usize) -> (u32, u32) {
    let mut first = 0u32;
    let mut second = 0u32;
    for i in (0..15).rev() {
        let (x, y) = FORMAT_COORDS[i];
        first = (first << 1) | read(x, y) as u32;
        let (sx, sy) = if i < 8 { (size - 1 - i, 8) } else { (8, size - 7 + (i - 8)) };
        second = (second << 1) | read(sx, sy) as u32;
    }
    (first, second)
}

/// The format word both copies are nearest, read from sampled modules, when
/// both lie within `AGREEMENT` bits of it; straight before mirrored, and within
/// each the first word in level and mask order.
pub fn agreement(modules: &[u8], size: usize) -> Option<Agreed> {
    agreement_read(&|x, y| modules[y * size + x] == 1, size)
}

pub(crate) fn agreement_read<R: Fn(usize, usize) -> bool>(read: &R, size: usize) -> Option<Agreed> {
    let mut best: Option<Agreed> = None;
    for mirrored in [false, true] {
        let (first, second) = if mirrored {
            format_words(&|x, y| read(y, x), size)
        } else {
            format_words(read, size)
        };
        for &(bits, ecc, mask) in FORMATS.iter() {
            let distance = (bits ^ first).count_ones().max((bits ^ second).count_ones());
            if distance <= AGREEMENT && best.as_ref().map_or(true, |b| distance < b.distance) {
                best = Some(Agreed { mirrored, ecc, mask, distance });
            }
        }
    }
    best
}

/// True when both format copies, read through `read`, lie within `AGREEMENT`
/// bits of the format word for this level and mask. A read at reduced size
/// counts only then (SPEC.md, decoder step 9).
pub fn format_agrees<R: Fn(usize, usize) -> bool>(read: &R, size: usize, ecc: Ecc, mask: u8) -> bool {
    let bits = FORMATS.iter().find(|f| f.1 == ecc && f.2 == mask).expect("a format word for every level and mask").0;
    let (first, second) = format_words(read, size);
    (bits ^ first).count_ones() <= AGREEMENT && (bits ^ second).count_ones() <= AGREEMENT
}

/// False when a version block, read in the orientation the format copies
/// agreed in, decodes to a version whose size is not the map's. A block that
/// does not decode leaves the size to decide.
pub fn sized(modules: &[u8], size: usize, mirrored: bool) -> bool {
    let version = if mirrored {
        read_version(&|x, y| modules[x * size + y] == 1, size)
    } else {
        read_version(&|x, y| modules[y * size + x] == 1, size)
    };
    match version {
        None => true,
        Some(v) => 17 + 4 * v == size,
    }
}

/// Keeps the best `SECOND_LOOKS` candidates: least distance first, then the order found.
pub fn keep(list: &mut Vec<Candidate>, candidate: Candidate) {
    let mut i = list.len();
    while i > 0 && list[i - 1].distance > candidate.distance {
        i -= 1;
    }
    if i >= SECOND_LOOKS {
        return;
    }
    list.insert(i, candidate);
    if list.len() > SECOND_LOOKS {
        list.pop();
    }
}

/// Darkness at a picture point: positive for dark, from the grey against the
/// binariser's threshold.
struct Probe<'a> {
    image: &'a Luminance,
    t: &'a Thresholds,
    inverted: bool,
}

impl Probe<'_> {
    fn at(&self, x: f64, y: f64) -> f64 {
        let (width, height) = (self.image.width, self.image.height);
        // Outside the picture counts as light, as in the ordinary read. A NaN fails.
        if !(x >= 0.0 && y >= 0.0 && x < width as f64 && y < height as f64) {
            return -1.0;
        }
        let data = &self.image.data;
        // Bilinear grey, with pixel centres at i + 0.5.
        let fx = x - 0.5;
        let fy = y - 0.5;
        let x0 = fx.floor().min((width - 1) as f64).max(0.0);
        let y0 = fy.floor().min((height - 1) as f64).max(0.0);
        let (x0i, y0i) = (x0 as usize, y0 as usize);
        let x1i = (width - 1).min(x0i + 1);
        let y1i = (height - 1).min(y0i + 1);
        let ax = 1.0f64.min(fx - x0).max(0.0);
        let ay = 1.0f64.min(fy - y0).max(0.0);
        let g = |xi: usize, yi: usize| data[yi * width + xi] as f64;
        let top = g(x0i, y0i) * (1.0 - ax) + g(x1i, y0i) * ax;
        let bottom = g(x0i, y1i) * (1.0 - ax) + g(x1i, y1i) * ax;
        let grey = top * (1.0 - ay) + bottom * ay;
        let d = threshold_at(self.t, width, height, x.floor() as usize, y.floor() as usize) - grey;
        if self.inverted {
            -d
        } else {
            d
        }
    }
}

const STEP: f64 = 1.0 / 16.0;

/// A sampling map: the candidate's own projective map, or that bent onto the
/// alignment patterns the picture shows.
enum Map {
    Plain([f64; 9]),
    Bent { matrix: [f64; 9], c: &'static [u8], n: usize, size: usize, ox: Vec<f64>, oy: Vec<f64>, trusted: Vec<bool> },
}

fn plain(m: &[f64; 9], x: f64, y: f64) -> Point {
    // Module (x, y), whose centre is at (x + 0.5, y + 0.5).
    let x = x + 0.5;
    let y = y + 0.5;
    let w = m[6] * x + m[7] * y + m[8];
    Point { x: (m[0] * x + m[1] * y + m[2]) / w, y: (m[3] * x + m[4] * y + m[5]) / w }
}

/// Which lattice cell a coordinate falls in, and how far along it.
fn cell(c: &[u8], n: usize, z: f64, size: usize, extend: bool) -> (usize, f64) {
    let (first, last) = if extend { (0.0, (size - 1) as f64) } else { (c[0] as f64, c[n - 1] as f64) };
    // Math.min and Math.max pass a NaN on.
    let t = if z.is_nan() { z } else { first.max(last.min(z)) };
    let mut i = 0;
    while i < n - 2 && t > c[i + 1] as f64 {
        i += 1;
    }
    (i, (t - c[i] as f64) / (c[i + 1] as f64 - c[i] as f64))
}

impl Map {
    fn project(&self, x: f64, y: f64) -> Point {
        match self {
            Map::Plain(m) => plain(m, x, y),
            Map::Bent { matrix, c, n, size, ox, oy, trusted } => {
                let n = *n;
                let (mut i, mut s) = cell(c, n, x, *size, true);
                let (mut j, mut t) = cell(c, n, y, *size, true);
                let mut o = j * n + i;
                let outside = x < c[0] as f64 || x > c[n - 1] as f64 || y < c[0] as f64 || y > c[n - 1] as f64;
                if outside && !(trusted[o] && trusted[o + 1] && trusted[o + n] && trusted[o + n + 1]) {
                    (i, s) = cell(c, n, x, *size, false);
                    (j, t) = cell(c, n, y, *size, false);
                    o = j * n + i;
                }
                let dx = (1.0 - t) * ((1.0 - s) * ox[o] + s * ox[o + 1]) + t * ((1.0 - s) * ox[o + n] + s * ox[o + n + 1]);
                let dy = (1.0 - t) * ((1.0 - s) * oy[o] + s * oy[o + 1]) + t * ((1.0 - s) * oy[o + n] + s * oy[o + n + 1]);
                plain(matrix, x + dx, y + dy)
            }
        }
    }
}

/// Walks one timing pattern from module 8 to size - 9, finding each module's
/// run of its colour near where the last one was, and returns each module's
/// offset along the line in modules (0 where the finders are). A run under
/// 0.4 or over 1.6 modules is no measurement; gaps are filled from their
/// neighbours after a median of three.
fn walk(size: usize, along: impl Fn(usize) -> Point, next: impl Fn(usize) -> Point, probe: &Probe) -> Vec<f64> {
    let mut measured = vec![f64::NAN; size];
    let mut prior = 0.0f64;
    for k in 8..=size - 9 {
        let p = along(k);
        let q = next(k);
        let ux = q.x - p.x;
        let uy = q.y - p.y;
        let dark = k % 2 == 0;
        let right = |t: f64| -> bool {
            let d = probe.at(p.x + ux * t, p.y + uy * t);
            if dark {
                d > 0.0
            } else {
                d <= 0.0
            }
        };
        let mut seed = f64::NAN;
        let mut s = 0;
        while s <= 12 && seed.is_nan() {
            if s == 0 {
                if right(prior) {
                    seed = prior;
                }
            } else if right(prior - s as f64 * STEP) {
                seed = prior - s as f64 * STEP;
            } else if right(prior + s as f64 * STEP) {
                seed = prior + s as f64 * STEP;
            }
            s += 1;
        }
        if seed.is_nan() {
            continue;
        }
        let mut a = seed;
        let mut b = seed;
        while a - seed > -1.6 && right(a - STEP) {
            a -= STEP;
        }
        while b - seed < 1.6 && right(b + STEP) {
            b += STEP;
        }
        let width = b - a + STEP;
        if width < 0.4 || width > 1.6 {
            continue;
        }
        measured[k] = (a + b) / 2.0;
        prior = measured[k];
    }
    let mut out = vec![0.0f64; size];
    for k in 0..size {
        if k < 8 || k > size - 9 {
            continue;
        }
        // Sorted by insertion, so equal values keep their order.
        let mut near: Vec<f64> = Vec::with_capacity(3);
        for v in [measured[k - 1], measured[k], measured[k + 1]] {
            if v.is_nan() {
                continue;
            }
            let mut i = near.len();
            while i > 0 && near[i - 1] > v {
                i -= 1;
            }
            near.insert(i, v);
        }
        out[k] = if near.is_empty() { f64::NAN } else { near[near.len() / 2] };
    }
    for k in 0..size {
        if !out[k].is_nan() {
            continue;
        }
        let mut l = k as i64 - 1;
        while l >= 0 && out[l as usize].is_nan() {
            l -= 1;
        }
        let mut r = k + 1;
        while r < size && out[r].is_nan() {
            r += 1;
        }
        let lv = if l >= 0 { out[l as usize] } else { 0.0 };
        let rv = if r < size { out[r] } else { 0.0 };
        out[k] = if l < 0 {
            rv
        } else if r >= size {
            lv
        } else {
            lv + ((rv - lv) * (k as i64 - l) as f64) / (r as i64 - l) as f64
        };
    }
    out
}

/// Where the colour changes between two module centres, as an offset in
/// modules from the midpoint, searched in sixteenths from the first centre;
/// `None` if the first centre is not the colour expected.
fn edge(from: Point, to: Point, dark_from: bool, probe: &Probe) -> Option<f64> {
    let mut previous = 0.0f64;
    for s in 0..=16 {
        let t = s as f64 / 16.0;
        let d = probe.at(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
        if if dark_from { d > 0.0 } else { d <= 0.0 } {
            previous = d;
            continue;
        }
        if s == 0 {
            return None;
        }
        let f = if previous == d { 0.5 } else { previous / (previous - d) };
        return Some((s - 1) as f64 / 16.0 + 1.0f64.min(f).max(0.0) / 16.0 - 0.5);
    }
    None
}

/// A least-squares line through (index, offset) pairs, as `a + b * t`; zero
/// with fewer than three.
#[derive(Clone, Copy)]
struct Line {
    a: f64,
    b: f64,
    zero: bool,
}

impl Line {
    fn at(&self, t: f64) -> f64 {
        if self.zero {
            0.0
        } else {
            self.a + self.b * t
        }
    }
}

fn line(points: &[(f64, f64)]) -> Line {
    let n = points.len() as f64;
    if points.len() < 3 {
        return Line { a: 0.0, b: 0.0, zero: true };
    }
    let mut sx = 0.0f64;
    let mut sy = 0.0f64;
    let mut sxx = 0.0f64;
    let mut sxy = 0.0f64;
    for &(x, y) in points {
        sx += x;
        sy += y;
        sxx += x * x;
        sxy += x * y;
    }
    let den = n * sxx - sx * sx;
    let b = if den == 0.0 { 0.0 } else { (n * sxy - sx * sy) / den };
    let a = (sy - b * sx) / n;
    Line { a, b, zero: false }
}

/// Furthest an alignment pattern is looked for from its prediction, in modules either way.
const REACH: i32 = 3;
/// Steps of the search, a quarter module.
const QUARTER: i32 = 4;
/// Of the 25 modules of an alignment pattern, how many must match for it to count as found.
const FOUND: i32 = 24;

/// The map bent onto the alignment patterns the picture shows (decoder step 8,
/// the mesh). `None` below version 7, or when no pattern is found.
fn mesh(location: &Location, probe: &Probe, work: Option<&mut Work>, late: bool) -> Option<Map> {
    let size = location.size;
    let matrix = location.matrix;
    let version = (size - 17) / 4;
    let c: &'static [u8] = ALIGNMENT_CENTRES[version - 1];
    if c.len() < 3 {
        return None;
    }
    let n = c.len();
    let mut ox = vec![0.0f64; n * n];
    let mut oy = vec![0.0f64; n * n];
    // 0 not yet placed; 1 a finder's corner, placed by the map; 2 found; 3 predicted.
    let mut state = vec![0u8; n * n];
    state[0] = 1;
    state[n - 1] = 1;
    state[(n - 1) * n] = 1;
    let mut order: Vec<usize> = Vec::new();
    for r in 0..n {
        for q in 0..n {
            if state[r * n + q] == 0 {
                order.push(r * n + q);
            }
        }
    }
    // Lattice steps to the nearest finder; row, then column, on a tie.
    let away = |i: usize| -> usize {
        let q = i % n;
        let r = (i - q) / n;
        (q + r).min(n - 1 - q + r).min(q + n - 1 - r)
    };
    order.sort_by(|&a, &b| away(a).cmp(&away(b)).then(a.cmp(&b)));
    let steps = REACH * QUARTER;
    let mut found = 0;
    let mut probed = 0u64;
    let map = Map::Plain(matrix);
    for pass in 0..if late { 2 } else { 1 } {
        let frozen = if pass == 1 { Some((state.clone(), ox.clone(), oy.clone())) } else { None };
        for &i in &order {
            if pass == 1 && state[i] != 3 { continue; }
            let q = i % n;
            let r = (i - q) / n;
            // The prediction: the mean offset of the neighbours already placed.
            let mut px = 0.0f64;
            let mut py = 0.0f64;
            let mut k = 0u32;
            for (a, b) in [(q as i64 - 1, r as i64), (q as i64 + 1, r as i64), (q as i64, r as i64 - 1), (q as i64, r as i64 + 1)] {
                if a < 0 || b < 0 || a >= n as i64 || b >= n as i64 || state[b as usize * n + a as usize] == 0 {
                    continue;
                }
                px += ox[b as usize * n + a as usize];
                py += oy[b as usize * n + a as usize];
                k += 1;
            }
            if k > 0 {
                px /= k as f64;
                py /= k as f64;
            }
            if let Some((frozen_state, frozen_x, frozen_y)) = &frozen {
                let mut nearest_distance = f64::INFINITY;
                let mut second_distance = f64::INFINITY;
                for (dq, dr) in [(-1i64, 0i64), (1, 0), (0, -1), (0, 1)] {
                    let (mut a, mut b) = (q as i64 + dq, r as i64 + dr);
                    let mut anchors = [0usize; 2];
                    let mut count = 0;
                    while a >= 0 && b >= 0 && a < n as i64 && b < n as i64 {
                        let index = b as usize * n + a as usize;
                        if frozen_state[index] == 2 { anchors[count] = index; count += 1; }
                        if count == 2 { break; }
                        a += dq; b += dr;
                    }
                    if count != 2 { continue; }
                    let [first, second] = anchors;
                    let axis = |j: usize| c[if dq != 0 { j % n } else { j / n }] as f64;
                    let here = c[if dq != 0 { q } else { r }] as f64;
                    let distance = (here - axis(first)).abs();
                    let further = (here - axis(second)).abs();
                    if distance > nearest_distance || (distance == nearest_distance && further >= second_distance) { continue; }
                    nearest_distance = distance;
                    second_distance = further;
                    let ratio = (here - axis(first)) / (axis(first) - axis(second));
                    px = frozen_x[first] + ratio * (frozen_x[first] - frozen_x[second]);
                    py = frozen_y[first] + ratio * (frozen_y[first] - frozen_y[second]);
                }
                if nearest_distance == f64::INFINITY { continue; }
            }
            let cx = c[q] as f64 + px;
            let cy = c[r] as f64 + py;
            let mut best = -1i32;
            let mut sx = 0.0f64;
            let mut sy = 0.0f64;
            let mut count = 0.0f64;
            let mut low = 0i32;
            let mut high = 0i32;
            let mut low_y = 0i32;
            let mut high_y = 0i32;
            for j in -steps..=steps {
                for s in -steps..=steps {
                    let u = s as f64 / QUARTER as f64;
                    let v = j as f64 / QUARTER as f64;
                    let mut score = 0i32;
                    for b in -2i32..=2 {
                        for a in -2i32..=2 {
                            let p = map.project(cx + u + a as f64, cy + v + b as f64);
                            if (probe.at(p.x, p.y) > 0.0) == (a.abs().max(b.abs()) != 1) {
                                score += 1;
                            }
                        }
                    }
                    if score > best {
                        best = score;
                        sx = 0.0;
                        sy = 0.0;
                        count = 0.0;
                        low = s;
                        high = s;
                        low_y = j;
                        high_y = j;
                    }
                    if score == best {
                        sx += s as f64;
                        sy += j as f64;
                        count += 1.0;
                        low = low.min(s);
                        high = high.max(s);
                        low_y = low_y.min(j);
                        high_y = high_y.max(j);
                    }
                }
            }
            probed += ((2 * steps + 1) * (2 * steps + 1) * 25) as u64;
            // In quarter modules: the best offsets' centre, and how far they spread from it.
            let mx = sx / count;
            let my = sy / count;
            let spread = (mx - low as f64).max(high as f64 - mx).max(my - low_y as f64).max(high_y as f64 - my);
            if best >= FOUND && spread <= 3.0 && mx.abs() <= (steps - 1) as f64 && my.abs() <= (steps - 1) as f64 {
                ox[i] = px + mx / QUARTER as f64;
                oy[i] = py + my / QUARTER as f64;
                state[i] = 2;
                found += 1;
            } else {
                if pass == 0 { ox[i] = px; oy[i] = py; }
                state[i] = 3;
            }
        }
    }
    if let Some(w) = work {
        w.probed += probed;
        if found > 0 {
            w.meshes += 1;
        }
    }
    if found == 0 {
        return None;
    }
    // Synthetic corners constrain the measured map at the actual finder centres.
    // Only measured neighbours justify a fit or subsequent extrapolation.
    let mut trusted: Vec<bool> = state.iter().map(|&value| value == 2).collect();
    let mut fit_corner = |q: usize, r: usize, finder_x: f64, finder_y: f64| {
        let i = if q == 0 { 0 } else { n - 2 };
        let j = if r == 0 { 0 } else { n - 2 };
        let o = j * n + i;
        let indices = [o, o + 1, o + n, o + n + 1];
        let corner = r * n + q;
        if indices.iter().any(|&k| k != corner && state[k] != 2) { return; }
        let s = (finder_x - c[i] as f64) / (c[i + 1] as f64 - c[i] as f64);
        let t = (finder_y - c[j] as f64) / (c[j + 1] as f64 - c[j] as f64);
        let weights = [(1.0 - t) * (1.0 - s), (1.0 - t) * s, t * (1.0 - s), t * s];
        let mut x = 0.0;
        let mut y = 0.0;
        let mut coefficient = 0.0;
        for k in 0..indices.len() {
            let index = indices[k];
            if index == corner { coefficient = weights[k]; }
            else { x += weights[k] * ox[index]; y += weights[k] * oy[index]; }
        }
        if !coefficient.is_finite() || coefficient == 0.0 { return; }
        let fitted_x = -x / coefficient;
        let fitted_y = -y / coefficient;
        if !fitted_x.is_finite() || !fitted_y.is_finite() { return; }
        ox[corner] = fitted_x;
        oy[corner] = fitted_y;
        trusted[corner] = true;
    };
    fit_corner(0, 0, 3.0, 3.0);
    fit_corner(n - 1, 0, (size - 4) as f64, 3.0);
    fit_corner(0, n - 1, 3.0, (size - 4) as f64);
    Some(Map::Bent { matrix, c, n, size, ox, oy, trusted })
}

/// Reads one candidate again; the result must keep its selected level and mask.
/// Ordinary candidates already have agreeing format copies. With `strict`, the
/// newly sampled copies must also agree, including for deferred candidates.
pub fn second_look(image: &Luminance, t: &Thresholds, candidate: &Candidate, work: Option<&mut Work>, strict: bool) -> Option<Payload> {
    second_look_with_late(image, t, candidate, work, strict, false)
}

pub(crate) fn second_look_with_late(image: &Luminance, t: &Thresholds, candidate: &Candidate, work: Option<&mut Work>, strict: bool, late: bool) -> Option<Payload> {
    second_look_collect(image, t, candidate, work, strict, late, None)
}

pub(crate) fn second_look_collect(image: &Luminance, t: &Thresholds, candidate: &Candidate, work: Option<&mut Work>, strict: bool, late: bool, collect_mesh: Option<&mut Vec<u8>>) -> Option<Payload> {
    let (inverted, mirrored) = (candidate.inverted, candidate.mirrored);
    let probe = Probe { image, t, inverted };
    // 0. From version 7, the map bent onto the alignment patterns it can find.
    let map = mesh(&candidate.location, &probe, work, late).unwrap_or(Map::Plain(candidate.location.matrix));
    let size = candidate.location.size;
    // 1. The timing patterns: shift whole columns and rows by what they show.
    let cols = walk(size, |k| map.project(k as f64, 6.0), |k| map.project((k + 1) as f64, 6.0), &probe);
    let rows = walk(size, |k| map.project(6.0, k as f64), |k| map.project(6.0, (k + 1) as f64), &probe);
    let mut centres: Vec<Point> = Vec::with_capacity(size * size);
    for y in 0..size {
        for x in 0..size {
            centres.push(map.project(x as f64 + cols[x], y as f64 + rows[y]));
        }
    }
    let grid: Vec<u8> = centres.iter().map(|p| (probe.at(p.x, p.y) > 0.0) as u8).collect();
    // 2. Each boundary between unlike neighbours: where the edge really is, as a line along the boundary.
    let mut across: Vec<Line> = Vec::with_capacity(size - 1);
    let mut down: Vec<Line> = Vec::with_capacity(size - 1);
    for i in 0..size - 1 {
        let mut points_across: Vec<(f64, f64)> = Vec::new();
        let mut points_down: Vec<(f64, f64)> = Vec::new();
        for j in 0..size {
            let a = grid[j * size + i];
            if a != grid[j * size + i + 1] {
                if let Some(o) = edge(centres[j * size + i], centres[j * size + i + 1], a == 1, &probe) {
                    points_across.push((j as f64, o));
                }
            }
            let b = grid[i * size + j];
            if b != grid[(i + 1) * size + j] {
                if let Some(o) = edge(centres[i * size + j], centres[(i + 1) * size + j], b == 1, &probe) {
                    points_down.push((j as f64, o));
                }
            }
        }
        across.push(line(&points_across));
        down.push(line(&points_down));
    }
    // 3. Each module centre moves by the mean of its two boundaries' offsets; sample grey there.
    let mut modules = vec![0u8; size * size];
    for y in 0..size {
        for x in 0..size {
            let dx = if x == 0 {
                across[0].at(y as f64)
            } else if x == size - 1 {
                across[size - 2].at(y as f64)
            } else {
                (across[x - 1].at(y as f64) + across[x].at(y as f64)) / 2.0
            };
            let dy = if y == 0 {
                down[0].at(x as f64)
            } else if y == size - 1 {
                down[size - 2].at(x as f64)
            } else {
                (down[y - 1].at(x as f64) + down[y].at(x as f64)) / 2.0
            };
            let p = map.project(x as f64 + cols[x] + dx, y as f64 + rows[y] + dy);
            modules[y * size + x] = (probe.at(p.x, p.y) > 0.0) as u8;
        }
    }
    // 4. Read as in step 6, in the orientation the candidate's format copies agreed in only.
    let keeps = |r: &Payload| r.ecc == candidate.ecc && r.mask == candidate.mask;
    let result = if mirrored {
        let read = |x: usize, y: usize| modules[x * size + y] == 1;
        read_symbol(read, size).filter(keeps).filter(|r| !strict || format_agrees(&read, size, r.ecc, r.mask))
    } else {
        let read = |x: usize, y: usize| modules[y * size + x] == 1;
        read_symbol(read, size).filter(keeps).filter(|r| !strict || format_agrees(&read, size, r.ecc, r.mask))
    };
    if result.is_some() { return result; }
    if let (Map::Bent { .. }, Some(collected)) = (&map, collect_mesh) {
        collected.resize(size * size, 0);
        for y in 0..size {
            for x in 0..size {
                let p = map.project(x as f64, y as f64);
                collected[y * size + x] = (probe.at(p.x, p.y) > 0.0) as u8;
            }
        }
    }
    None
}
