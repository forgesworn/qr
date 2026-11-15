//! Finder triples, size estimates and sampling maps (SPEC.md decoder steps 4
//! and 5).

use crate::binarise::BitImage;
use crate::locate::{Edges, Finder, Work};

/// A point in picture coordinates.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

/// Where a symbol sits in the picture, and how to sample it.
#[derive(Clone, Debug, PartialEq)]
pub struct Location {
    pub top_left: Point,
    pub top_right: Point,
    pub bottom_left: Point,
    pub alignment: Option<Point>,
    pub size: usize,
    /// The nine numbers of the projective map taking module (x + 0.5, y + 0.5)
    /// to the picture, row by row.
    pub matrix: [f64; 9],
}

const POOL: usize = 12;

/// `sqrt(dx * dx + dy * dy)`, never `hypot`.
fn length(dx: f64, dy: f64) -> f64 {
    (dx * dx + dy * dy).sqrt()
}

fn distance(a: Point, b: Point) -> f64 {
    length(a.x - b.x, a.y - b.y)
}

fn at(f: &Finder) -> Point {
    Point { x: f.x, y: f.y }
}

/// The larger of two, NaN if either is: as the reference's `Math.max`.
fn jmax(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        f64::NAN
    } else if a > b {
        a
    } else {
        b
    }
}

/// The smaller of two, NaN if either is: as the reference's `Math.min`.
fn jmin(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        f64::NAN
    } else if a < b {
        a
    } else {
        b
    }
}

#[inline]
fn dark(image: &BitImage, x: i64, y: i64) -> bool {
    image.data[y as usize * image.width + x as usize] == 1
}

/// Length of the dark-light-dark run from a finder centre outwards, through
/// and beyond the finder edge; NaN when either direction finds none.
fn black_white_black(image: &BitImage, from: Point, to: Point) -> f64 {
    let (width, height) = (image.width as i64, image.height as i64);
    let run = |sx: i64, sy: i64, tx: i64, ty: i64| -> f64 {
        let steep = (ty - sy).abs() > (tx - sx).abs();
        let (sx, sy, tx, ty) = if steep { (sy, sx, ty, tx) } else { (sx, sy, tx, ty) };
        let dx = (tx - sx).abs();
        let dy = (ty - sy).abs();
        let mut error = -(dx as f64) / 2.0;
        let xstep = if sx < tx { 1 } else { -1 };
        let ystep = if sy < ty { 1 } else { -1 };
        let mut state = 0;
        let mut y = sy;
        let mut x = sx;
        while x != tx + xstep {
            let (rx, ry) = if steep { (y, x) } else { (x, y) };
            if rx < 0 || ry < 0 || rx >= width || ry >= height {
                break;
            }
            if (state == 1) == dark(image, rx, ry) {
                if state == 2 {
                    return length((x - sx) as f64, (y - sy) as f64);
                }
                state += 1;
            }
            error += dy as f64;
            if error > 0.0 {
                if y == ty {
                    break;
                }
                y += ystep;
                error -= dx as f64;
            }
            x += xstep;
        }
        if state == 2 {
            length((tx + xstep - sx) as f64, (ty - sy) as f64)
        } else {
            f64::NAN
        }
    };
    let sx = from.x.floor() as i64;
    let sy = from.y.floor() as i64;
    let tx = to.x.floor() as i64;
    let ty = to.y.floor() as i64;
    let forward = run(sx, sy, tx, ty);
    // The same distance the other way, clipped to the picture.
    let (sxf, syf) = (sx as f64, sy as f64);
    let mut ox = sxf - (tx as f64 - sxf);
    let mut oy = syf - (ty as f64 - syf);
    let mut scale = 1.0f64;
    if ox < 0.0 {
        scale = scale.min(sxf / (sxf - ox));
    } else if ox >= width as f64 {
        scale = scale.min((width as f64 - 1.0 - sxf) / (ox - sxf));
    }
    if oy < 0.0 {
        scale = scale.min(syf / (syf - oy));
    } else if oy >= height as f64 {
        scale = scale.min((height as f64 - 1.0 - syf) / (oy - syf));
    }
    ox = (sxf + (ox - sxf) * scale).floor();
    oy = (syf + (oy - syf) * scale).floor();
    let backward = run(sx, sy, ox as i64, oy as i64);
    if forward.is_nan() || backward.is_nan() {
        return f64::NAN;
    }
    forward + backward - 1.0
}

/// Module size along a line from one finder centre to another, by its
/// black-white-black runs.
fn run_module_size(image: &BitImage, from: Point, to: Point) -> f64 {
    let one = black_white_black(image, from, to);
    let other = black_white_black(image, to, from);
    if one.is_nan() {
        return other / 7.0;
    }
    if other.is_nan() {
        return one / 7.0;
    }
    (one + other) / 14.0
}

/// Every plausible top-left, top-right, bottom-left triple, best first, as
/// indices into `finders`. Only the 12 most sighted finders are considered.
pub fn finder_triples(image: &BitImage, finders: &[Finder]) -> Vec<[usize; 3]> {
    let pool = &finders[..finders.len().min(POOL)];
    let mut legs: [Option<f64>; POOL * POOL] = [None; POOL * POOL];
    let mut modules_between = |i: usize, j: usize| -> f64 {
        let key = i.min(j) * POOL + i.max(j);
        if let Some(n) = legs[key] {
            return n;
        }
        let (a, b) = (at(&pool[i]), at(&pool[j]));
        let n = distance(a, b) / run_module_size(image, a, b);
        legs[key] = Some(n);
        n
    };
    let mut triples: Vec<(f64, [usize; 3])> = Vec::new();
    for i in 0..pool.len() {
        for j in i + 1..pool.len() {
            for k in j + 1..pool.len() {
                let (a, b, c) = (&pool[i], &pool[j], &pool[k]);
                let largest = jmax(jmax(a.module_size, b.module_size), c.module_size);
                let smallest = jmin(jmin(a.module_size, b.module_size), c.module_size);
                if largest > 3.0 * smallest {
                    continue;
                }
                let ab = distance(at(a), at(b));
                let bc = distance(at(b), at(c));
                let ca = distance(at(c), at(a));
                // The corner opposite the longest side is the top-left.
                let (t, m, n) = if bc >= ab && bc >= ca {
                    (i, j, k)
                } else if ca >= ab {
                    (j, k, i)
                } else {
                    (k, i, j)
                };
                let one = modules_between(t, m);
                let other = modules_between(t, n);
                // The nearest finders in any symbol are 14 modules apart.
                if !(jmin(one, other) >= 10.0) {
                    continue;
                }
                let top_left = &pool[t];
                let (mut p, mut q) = (m, n);
                let ux = pool[p].x - top_left.x;
                let uy = pool[p].y - top_left.y;
                let vx = pool[q].x - top_left.x;
                let vy = pool[q].y - top_left.y;
                let cos = (ux * vx + uy * vy).abs() / length(ux, uy) / length(vx, vy);
                let mismatch = (one - other).abs() / jmax(one, other);
                if cos > 0.5 || mismatch > 0.25 {
                    continue;
                }
                // In picture coordinates (y down) top-right x bottom-left is positive.
                if ux * vy - uy * vx < 0.0 {
                    std::mem::swap(&mut p, &mut q);
                }
                let seen = (a.count + b.count + c.count).min(15);
                triples.push((cos + mismatch - 0.01 * seen as f64, [t, p, q]));
            }
        }
    }
    // A stable sort; a NaN score (which the checks above leave no way to make) ties, as in the reference.
    triples.sort_by(|x, y| x.0.partial_cmp(&y.0).unwrap_or(std::cmp::Ordering::Equal));
    triples.into_iter().map(|t| t.1).collect()
}

/// The symbol's size in modules from its finders' spacing, rounded to 1
/// (mod 4); `None` when the modules are under a pixel (or the size is not a
/// finite number).
pub fn estimate_size(image: &BitImage, triple: &[Finder; 3]) -> Option<i64> {
    let [top_left, top_right, bottom_left] = triple.map(|f| at(&f));
    let across = run_module_size(image, top_left, top_right);
    let down = run_module_size(image, top_left, bottom_left);
    if !((across + down) / 2.0 >= 1.0) {
        return None;
    }
    size_from(top_left, top_right, bottom_left, across, down)
}

fn size_from(top_left: Point, top_right: Point, bottom_left: Point, across: f64, down: f64) -> Option<i64> {
    // Each side counted in its own modules, which perspective can make differ.
    let half = (distance(top_left, top_right) / across + distance(top_left, bottom_left) / down) / 2.0;
    let rounded = (half + 0.5).floor();
    if !rounded.is_finite() {
        return None;
    }
    let size = rounded as i64 + 7;
    Some(match size & 3 {
        0 => size + 1,
        2 => size - 1,
        3 => size - 2,
        _ => size,
    })
}

/// A candidate alignment pattern centre seen on one or more rows.
struct Seen {
    x: f64,
    y: f64,
    count: f64,
}

/// Searches near `estimate` for alignment pattern centres, whose modules span
/// `wide` pixels along a row and `tall` down a column. Candidates seen on two
/// or more rows come first, then nearest the estimate.
fn find_alignments(image: &BitImage, edges: &mut Edges, estimate: Point, wide: f64, tall: f64, reach: f64, work: Option<&mut Work>) -> Vec<Point> {
    let module_size = jmax(wide, tall);
    let radius = (reach * module_size).ceil();
    let left = jmax(0.0, (estimate.x - radius).floor());
    let right = jmin((image.width - 1) as f64, (estimate.x + radius).ceil());
    let top = jmax(0.0, (estimate.y - radius).floor());
    let bottom = jmin((image.height - 1) as f64, (estimate.y + radius).ceil());
    // A NaN anywhere leaves the reference with a window that holds no row.
    if left.is_nan() || right.is_nan() || top.is_nan() || bottom.is_nan() {
        return Vec::new();
    }
    if right - left < module_size * 3.0 || bottom - top < module_size * 3.0 {
        return Vec::new();
    }
    if let Some(w) = work {
        w.scanned += ((right - left + 1.0) * (bottom - top + 1.0)) as u64;
    }
    let (left, right, top, bottom) = (left as i64, right as i64, top as i64, bottom as i64);
    let data = &image.data;
    let width = image.width as i64;
    let slack = wide * 0.6;
    let slack_down = tall * 0.6;
    let vertical = |x: i64, y: i64| -> f64 {
        // Light, dark, light runs through (x, y) going up and down from the dark centre.
        let mut up = y;
        while up >= top && data[(up * width + x) as usize] == 1 {
            up -= 1;
        }
        let mut down = y;
        while down <= bottom && data[(down * width + x) as usize] == 1 {
            down += 1;
        }
        let middle = (down - up - 1) as f64;
        if !((middle - tall).abs() < slack_down) {
            return f64::NAN;
        }
        let mut above = 0i64;
        let mut yy = up;
        while yy >= top && data[(yy * width + x) as usize] != 1 {
            above += 1;
            yy -= 1;
        }
        let mut below = 0i64;
        let mut yy = down;
        while yy <= bottom && data[(yy * width + x) as usize] != 1 {
            below += 1;
            yy += 1;
        }
        if !((above as f64 - tall).abs() < slack_down) || !((below as f64 - tall).abs() < slack_down) {
            return f64::NAN;
        }
        (up + 1 + down) as f64 / 2.0
    };
    let mut found: Vec<Seen> = Vec::new();
    for y in top..=bottom {
        let changes = edges.row(y as usize);
        let n = changes.len();
        // The first change of colour past the window's left edge.
        let mut k = 0usize;
        let mut high = n;
        while k < high {
            let middle = (k + high) >> 1;
            if changes[middle] as i64 <= left {
                k = middle + 1;
            } else {
                high = middle;
            }
        }
        let mut x = left;
        if data[(y * width + left) as usize] == 1 {
            // Skip a dark run cut by the window.
            x = if k < n && changes[k] as i64 <= right {
                k += 1;
                changes[k - 1] as i64
            } else {
                right + 1
            };
        }
        // Runs alternate light, dark, light ...: the last two are kept, and the
        // run that ends a light, dark, light three is checked with them.
        let mut start = x;
        let mut count = 0u32;
        let mut before = 0i64;
        let mut last = 0i64;
        loop {
            x = if k < n && changes[k] as i64 <= right {
                k += 1;
                changes[k - 1] as i64
            } else {
                right + 1
            };
            let run = x - start;
            start = x;
            count += 1;
            if count >= 3
                && (count & 1) == 1
                && ((before as f64 - wide).abs() < slack)
                && ((last as f64 - wide).abs() < slack)
                && ((run as f64 - wide).abs() < slack)
            {
                let cx = x as f64 - run as f64 - last as f64 / 2.0;
                let cy = vertical(cx.floor() as i64, y);
                if !cy.is_nan() {
                    let same = found.iter_mut().find(|f| (f.x - cx).abs() <= module_size && (f.y - cy).abs() <= module_size);
                    if let Some(same) = same {
                        same.x = (same.x * same.count + cx) / (same.count + 1.0);
                        same.y = (same.y * same.count + cy) / (same.count + 1.0);
                        same.count += 1.0;
                    } else {
                        found.push(Seen { x: cx, y: cy, count: 1.0 });
                    }
                }
            }
            if x > right {
                break;
            }
            before = last;
            last = run;
        }
    }
    // A candidate seen on one row only counts as three modules further away.
    let mut scored: Vec<(f64, Point)> = found
        .iter()
        .map(|f| {
            let p = Point { x: f.x, y: f.y };
            (distance(p, estimate) / module_size + if f.count >= 2.0 { 0.0 } else { 3.0 }, p)
        })
        .collect();
    scored.sort_by(|p, q| p.0.partial_cmp(&q.0).unwrap_or(std::cmp::Ordering::Equal));
    scored.into_iter().map(|s| s.1).collect()
}

type Matrix = [f64; 9];

/// A projective map from the unit square's corners to four picture points.
fn square_to_quad(p0: Point, p1: Point, p2: Point, p3: Point) -> Matrix {
    let dx3 = p0.x - p1.x + p2.x - p3.x;
    let dy3 = p0.y - p1.y + p2.y - p3.y;
    if dx3 == 0.0 && dy3 == 0.0 {
        return [p1.x - p0.x, p2.x - p1.x, p0.x, p1.y - p0.y, p2.y - p1.y, p0.y, 0.0, 0.0, 1.0];
    }
    let dx1 = p1.x - p2.x;
    let dx2 = p3.x - p2.x;
    let dy1 = p1.y - p2.y;
    let dy2 = p3.y - p2.y;
    let den = dx1 * dy2 - dx2 * dy1;
    let a13 = (dx3 * dy2 - dx2 * dy3) / den;
    let a23 = (dx1 * dy3 - dx3 * dy1) / den;
    [
        p1.x - p0.x + a13 * p1.x,
        p3.x - p0.x + a23 * p3.x,
        p0.x,
        p1.y - p0.y + a13 * p1.y,
        p3.y - p0.y + a23 * p3.y,
        p0.y,
        a13,
        a23,
        1.0,
    ]
}

fn adjoint(m: &Matrix) -> Matrix {
    let [a, b, c, d, e, f, g, h, i] = *m;
    [e * i - f * h, c * h - b * i, b * f - c * e, f * g - d * i, a * i - c * g, c * d - a * f, d * h - e * g, b * g - a * h, a * e - b * d]
}

fn multiply(m: &Matrix, n: &Matrix) -> Matrix {
    let mut out = [0.0; 9];
    for r in 0..3 {
        for c in 0..3 {
            out[r * 3 + c] = m[r * 3] * n[c] + m[r * 3 + 1] * n[3 + c] + m[r * 3 + 2] * n[6 + c];
        }
    }
    out
}

/// The matrix of the map taking four module-space points to four picture points.
fn quad_matrix(from: &[Point; 4], to: &[Point; 4]) -> Matrix {
    let to_picture = square_to_quad(to[0], to[1], to[2], to[3]);
    let from_modules = adjoint(&square_to_quad(from[0], from[1], from[2], from[3]));
    // Column-vector convention: picture = to_picture . from_modules^-1 . module.
    multiply(&to_picture, &from_modules)
}

/// Out of 25, how many modules around `centre` match an alignment pattern
/// (dark centre, light ring, dark ring), stepping by `u` across and `v` down.
/// Perspective changes the local module size, so three scales are tried.
fn alignment_score(image: &BitImage, centre: Point, u: Point, v: Point) -> u32 {
    let (width, height) = (image.width as f64, image.height as f64);
    let mut best = 0;
    for scale in [0.85, 1.0, 1.15] {
        let mut score = 0;
        for j in -2i32..=2 {
            for i in -2i32..=2 {
                let (fi, fj) = (i as f64, j as f64);
                let x = (centre.x + (fi * u.x + fj * v.x) * scale).floor();
                let y = (centre.y + (fi * u.y + fj * v.y) * scale).floor();
                let want = i.abs().max(j.abs()) != 1;
                let got = x >= 0.0 && y >= 0.0 && x < width && y < height && dark(image, x as i64, y as i64);
                if got == want {
                    score += 1;
                }
            }
        }
        best = best.max(score);
    }
    best
}

/// Turns three finders into sampling maps: one through each likely alignment
/// pattern (when the version has one), then one through the fourth corner.
/// `size_hint` overrides the estimated module count.
pub fn locate(image: &BitImage, triple: &[Finder; 3], size_hint: Option<i64>, mut work: Option<&mut Work>, edges: &mut Edges) -> Vec<Location> {
    let [top_left, top_right, bottom_left] = triple.map(|f| at(&f));
    let across = run_module_size(image, top_left, top_right);
    let down = run_module_size(image, top_left, bottom_left);
    let module_size = (across + down) / 2.0;
    if !(module_size >= 1.0) {
        return Vec::new();
    }
    let size = match size_hint {
        Some(s) => s,
        None => match size_from(top_left, top_right, bottom_left, across, down) {
            Some(s) => s,
            None => return Vec::new(),
        },
    };
    if !(21..=177).contains(&size) {
        return Vec::new();
    }
    // A plane seen in perspective: along a side whose far end is w times as far
    // from the camera, modules shrink by w squared. The finders' module sizes so
    // give the weights of a projective map through the three centres, which
    // places the rest of the symbol. Equal sizes give the parallelogram.
    let weight = |from: Point, to: Point| -> f64 {
        let w = (black_white_black(image, from, to) / black_white_black(image, to, from)).sqrt();
        if w >= 0.5 && w <= 2.0 {
            w
        } else {
            1.0
        }
    };
    let wr = weight(top_left, top_right);
    let wd = weight(top_left, bottom_left);
    let steps = (size - 7) as f64;
    // Picture point of module-space point (x, y), measured from the top-left finder centre.
    let perspective = |x: f64, y: f64| -> Point {
        let a = x / steps;
        let b = y / steps;
        let w = 1.0 + a * (wr - 1.0) + b * (wd - 1.0);
        Point {
            x: (top_left.x + a * (wr * top_right.x - top_left.x) + b * (wd * bottom_left.x - top_left.x)) / w,
            y: (top_left.y + a * (wr * top_right.y - top_left.y) + b * (wd * bottom_left.y - top_left.y)) / w,
        }
    };
    let parallelogram = Point { x: top_right.x - top_left.x + bottom_left.x, y: top_right.y - top_left.y + bottom_left.y };
    let corner = perspective(steps, steps);
    // Without an alignment pattern, the parallelogram's corner goes first, as for
    // a code seen head-on; the map's corner is a later try. A corner moved by
    // less than a pixel samples the same pixels, so it is not tried twice.
    let corners: Vec<Point> = if distance(corner, parallelogram) >= 1.0 { vec![parallelogram, corner] } else { vec![parallelogram] };
    let mut alignments: Vec<Point> = Vec::new();
    if size > 21 {
        // Guesses at the alignment centre, three modules in from the fourth
        // corner: through the projective map, and on the parallelogram.
        let guess = perspective(steps - 3.0, steps - 3.0);
        let k = 1.0 - 3.0 / steps;
        let flat = Point { x: top_left.x + k * (parallelogram.x - top_left.x), y: top_left.y + k * (parallelogram.y - top_left.y) };
        let estimates: Vec<Point> = if distance(guess, flat) > module_size { vec![guess, flat] } else { vec![guess] };
        // One module's steps across and down there, by the map and on the parallelogram.
        let ua = perspective(steps - 2.0, steps - 3.0);
        let u = Point { x: ua.x - guess.x, y: ua.y - guess.y };
        let va = perspective(steps - 3.0, steps - 2.0);
        let v = Point { x: va.x - guess.x, y: va.y - guess.y };
        let u0 = Point { x: (top_right.x - top_left.x) / steps, y: (top_right.y - top_left.y) / steps };
        let v0 = Point { x: (bottom_left.x - top_left.x) / steps, y: (bottom_left.y - top_left.y) / steps };
        // A row or column crosses a turned module on the slant: at 45 degrees a
        // module's run is the diagonal, root 2 times its side.
        let det = (u.x * v.y - u.y * v.x).abs();
        let wide = det / jmax(u.y.abs(), v.y.abs());
        let tall = det / jmax(u.x.abs(), v.x.abs());
        // Rank candidates by how well the 5x5 pattern around them matches, read
        // along the code's own axes, then by nearness to a guess.
        let near = |p: Point| -> f64 { estimates.iter().map(|e| distance(p, *e)).fold(f64::INFINITY, jmin) };
        struct Scored {
            p: Point,
            score: u32,
            away: f64,
        }
        let mut scored: Vec<Scored> = Vec::new();
        for reach in [4.0, 8.0, 16.0] {
            for estimate in &estimates {
                for p in find_alignments(image, edges, *estimate, wide, tall, reach, work.as_deref_mut()) {
                    if scored.iter().any(|a| distance(a.p, p) <= module_size / 2.0) {
                        continue;
                    }
                    let score = alignment_score(image, p, u, v).max(alignment_score(image, p, u0, v0));
                    scored.push(Scored { p, score, away: near(p) });
                }
            }
            if scored.iter().any(|c| c.score >= 23) {
                break;
            }
        }
        let mut kept: Vec<Scored> = scored.into_iter().filter(|c| c.score >= 20).collect();
        kept.sort_by(|a, b| b.score.cmp(&a.score).then(a.away.partial_cmp(&b.away).unwrap_or(std::cmp::Ordering::Equal)));
        kept.truncate(4);
        alignments = kept.into_iter().map(|c| c.p).collect();
    }
    let size_f = size as f64;
    let far = size_f - 3.5;
    let map = |alignment: Option<Point>, corner: Point| -> Location {
        let matrix = quad_matrix(
            &[
                Point { x: 3.5, y: 3.5 },
                Point { x: far, y: 3.5 },
                if alignment.is_some() { Point { x: size_f - 6.5, y: size_f - 6.5 } } else { Point { x: far, y: far } },
                Point { x: 3.5, y: far },
            ],
            &[top_left, top_right, alignment.unwrap_or(corner), bottom_left],
        );
        Location { top_left, top_right, bottom_left, alignment, size: size as usize, matrix }
    };
    let mut out: Vec<Location> = alignments.iter().map(|a| map(Some(*a), corner)).collect();
    out.extend(corners.iter().map(|c| map(None, *c)));
    out
}
