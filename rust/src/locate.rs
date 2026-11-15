//! Row edges and the finder scan (SPEC.md decoder step 3).

use crate::binarise::BitImage;

/// A finder candidate: where it is, the module size it showed, and how many
/// sightings were merged into it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Finder {
    pub x: f64,
    pub y: f64,
    pub module_size: f64,
    pub count: u32,
}

/// The work the search does, counted for tests that bound it (SPEC.md, Bounded
/// work): pixels stepped in cross-checks, stored candidates compared while
/// merging, pixels in the windows searched for alignment patterns, maps
/// sampled, maps read again by the second look, those of them read through a
/// mesh, points the mesh probed, and maps sampled at reduced size.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Work {
    /// Pixels stepped in cross-checks.
    pub steps: u64,
    /// Stored candidates compared while merging.
    pub compared: u64,
    /// Pixels in the windows searched for alignment patterns.
    pub scanned: u64,
    /// Sampling maps read.
    pub maps: u64,
    /// Maps read again by the second look.
    pub second: u64,
    /// Of those, the maps read through a mesh.
    pub meshes: u64,
    /// Points the mesh probed.
    pub probed: u64,
    /// Maps sampled at reduced size.
    pub reduced: u64,
}

const NOT_YET: u32 = u32::MAX;

/// Where each row of a black-and-white picture changes colour: for row y,
/// every x from 1 up at which the pixel differs from the one before it. A row
/// is worked out when first asked for and kept. A picture and its inverse
/// change colour at the same places, so they share one of these.
pub struct Edges<'a> {
    data: &'a [u8],
    width: usize,
    store: Vec<i32>,
    spans: Vec<(u32, u32)>,
}

impl<'a> Edges<'a> {
    pub fn new(image: &'a BitImage) -> Self {
        Edges { data: &image.data, width: image.width, store: Vec::new(), spans: vec![(NOT_YET, 0); image.height] }
    }

    pub fn row(&mut self, y: usize) -> &[i32] {
        if self.spans[y].0 == NOT_YET {
            let start = y * self.width;
            let begin = self.store.len();
            let mut ink = self.data[start];
            for x in 1..self.width {
                let v = self.data[start + x];
                if v != ink {
                    self.store.push(x as i32);
                    ink = v;
                }
            }
            self.spans[y] = (begin as u32, self.store.len() as u32);
        }
        let (a, b) = self.spans[y];
        &self.store[a as usize..b as usize]
    }
}

/// Runs in 1:1:3:1:1 proportion, each within `tolerance` of a module (the
/// centre within three times that).
fn finder_ratio(counts: &[i64; 5], tolerance: f64) -> bool {
    if counts.iter().any(|&c| c == 0) {
        return false;
    }
    let total = counts[0] + counts[1] + counts[2] + counts[3] + counts[4];
    if total < 7 {
        return false;
    }
    let module = total as f64 / 7.0;
    let slack = module * tolerance;
    (module - counts[0] as f64).abs() < slack
        && (module - counts[1] as f64).abs() < slack
        && (3.0 * module - counts[2] as f64).abs() < 3.0 * slack
        && (module - counts[3] as f64).abs() < slack
        && (module - counts[4] as f64).abs() < slack
}

fn centre_from_end(counts: &[i64; 5], end: f64) -> f64 {
    end - counts[4] as f64 - counts[3] as f64 - counts[2] as f64 / 2.0
}

#[inline]
fn inside(image: &BitImage, px: i64, py: i64) -> bool {
    px >= 0 && py >= 0 && (px as usize) < image.width && (py as usize) < image.height
}

#[inline]
fn dark(image: &BitImage, px: i64, py: i64) -> bool {
    image.data[py as usize * image.width + px as usize] == 1
}

/// Counts the five runs through (x, y) along direction (dx, dy), starting in
/// the dark centre, and returns the centre along that line, or NaN.
#[allow(clippy::too_many_arguments)]
fn cross_check(
    image: &BitImage,
    x: i64,
    y: i64,
    dx: i64,
    dy: i64,
    max_count: i64,
    original_total: i64,
    tolerance: f64,
    work: &mut Option<&mut Work>,
) -> f64 {
    let mut counts = [0i64; 5];
    let result = runs(image, x, y, dx, dy, max_count, original_total, tolerance, &mut counts);
    if let Some(w) = work.as_deref_mut() {
        w.steps += (counts[0] + counts[1] + counts[2] + counts[3] + counts[4]) as u64;
    }
    result
}

#[allow(clippy::too_many_arguments)]
fn runs(image: &BitImage, x: i64, y: i64, dx: i64, dy: i64, max_count: i64, original_total: i64, tolerance: f64, counts: &mut [i64; 5]) -> f64 {
    // A centre run past this length could not pass the checks below.
    let longest = if dx != 0 && dy != 0 { 32 * (max_count + 1) } else { 2 * original_total };
    let mut px = x;
    let mut py = y;
    while inside(image, px, py) && dark(image, px, py) {
        counts[2] += 1;
        if counts[2] > longest {
            return f64::NAN;
        }
        px -= dx;
        py -= dy;
    }
    while inside(image, px, py) && !dark(image, px, py) && counts[1] <= max_count {
        counts[1] += 1;
        px -= dx;
        py -= dy;
    }
    if !inside(image, px, py) || counts[1] > max_count {
        return f64::NAN;
    }
    while inside(image, px, py) && dark(image, px, py) && counts[0] <= max_count {
        counts[0] += 1;
        px -= dx;
        py -= dy;
    }
    if counts[0] > max_count {
        return f64::NAN;
    }
    px = x + dx;
    py = y + dy;
    while inside(image, px, py) && dark(image, px, py) {
        counts[2] += 1;
        if counts[2] > longest {
            return f64::NAN;
        }
        px += dx;
        py += dy;
    }
    while inside(image, px, py) && !dark(image, px, py) && counts[3] < max_count {
        counts[3] += 1;
        px += dx;
        py += dy;
    }
    if !inside(image, px, py) || counts[3] >= max_count {
        return f64::NAN;
    }
    while inside(image, px, py) && dark(image, px, py) && counts[4] < max_count {
        counts[4] += 1;
        px += dx;
        py += dy;
    }
    if counts[4] >= max_count {
        return f64::NAN;
    }
    let total = counts[0] + counts[1] + counts[2] + counts[3] + counts[4];
    // Only straight lines compare totals. Back along the row the stretch must
    // match; down the column it may be up to twice as tall as wide, or half.
    if dx != 0 && dy == 0 && 5 * (total - original_total).abs() >= 2 * original_total {
        return f64::NAN;
    }
    if dy != 0 && dx == 0 && (total >= 2 * original_total || 2 * total <= original_total) {
        return f64::NAN;
    }
    if !finder_ratio(counts, tolerance) {
        return f64::NAN;
    }
    let end = if dx != 0 { px - x } else { py - y };
    let sign = if dx + dy > 0 { 1 } else { -1 };
    centre_from_end(counts, (end * sign) as f64)
}

const CELL: usize = 16;

/// Candidates filed by 16-pixel cell, so that merging compares only nearby
/// ones.
struct Scan<'i, 'w> {
    image: &'i BitImage,
    tolerance: f64,
    work: Option<&'w mut Work>,
    found: Vec<Finder>,
    columns: usize,
    cells: Vec<Vec<u32>>,
}

impl Scan<'_, '_> {
    fn across(&self, x: f64) -> usize {
        ((self.columns - 1) as f64).min((x.max(0.0) / CELL as f64).floor()) as usize
    }

    fn down(y: f64) -> usize {
        (y.max(0.0) / CELL as f64).floor() as usize
    }

    fn key_of(&self, f: &Finder) -> usize {
        Self::down(f.y) * self.columns + self.across(f.x)
    }

    fn file(&mut self, i: usize) {
        let key = self.key_of(&self.found[i]);
        if key >= self.cells.len() {
            self.cells.resize_with(key + 1, Vec::new);
        }
        self.cells[key].push(i as u32);
    }

    /// A row's runs make a pattern ending at `end`: check it, and merge or store it.
    fn consider(&mut self, counts: &[i64; 5], y: usize, end: usize) -> bool {
        let total = counts[0] + counts[1] + counts[2] + counts[3] + counts[4];
        let mut cx = centre_from_end(counts, end as f64);
        let max_count = counts[2];
        let tol = self.tolerance;
        let yi = y as i64;
        let dy = cross_check(self.image, cx.floor() as i64, yi, 0, 1, max_count, total, tol, &mut self.work);
        if dy.is_nan() {
            return false;
        }
        let cy = y as f64 + dy;
        let dx = cross_check(self.image, cx.floor() as i64, cy.floor() as i64, 1, 0, max_count, total, tol, &mut self.work);
        if dx.is_nan() {
            return false;
        }
        cx = cx.floor() + dx;
        let diagonal = cross_check(self.image, cx.floor() as i64, cy.floor() as i64, 1, 1, max_count * 2, total, tol + 0.25, &mut self.work);
        if diagonal.is_nan() {
            return false;
        }
        let module_size = total as f64 / 7.0;
        // The earliest stored candidate within a module, of a like module size, takes this sighting.
        let mut matched: Option<usize> = None;
        let (r0, r1) = (Self::down(cy - module_size), Self::down(cy + module_size));
        let (c0, c1) = (self.across(cx - module_size), self.across(cx + module_size));
        let mut compared = 0u64;
        for r in r0..=r1 {
            for c in c0..=c1 {
                let Some(cell) = self.cells.get(r * self.columns + c) else { continue };
                for &i in cell {
                    let i = i as usize;
                    compared += 1;
                    let f = &self.found[i];
                    if matched.is_none_or(|m| i < m)
                        && (cy - f.y).abs() <= module_size
                        && (cx - f.x).abs() <= module_size
                        && ((module_size - f.module_size).abs() <= 1.0 || (module_size - f.module_size).abs() <= f.module_size * 0.25)
                    {
                        matched = Some(i);
                    }
                }
            }
        }
        if let Some(w) = self.work.as_deref_mut() {
            w.compared += compared;
        }
        if let Some(m) = matched {
            let before = self.key_of(&self.found[m]);
            let f = &mut self.found[m];
            let count = f.count as f64;
            let n = f.count as f64 + 1.0;
            f.x = (f.x * count + cx) / n;
            f.y = (f.y * count + cy) / n;
            f.module_size = (f.module_size * count + module_size) / n;
            f.count += 1;
            if self.key_of(&self.found[m]) != before {
                let cell = &mut self.cells[before];
                let at = cell.iter().position(|&i| i as usize == m).unwrap();
                cell.remove(at);
                self.file(m);
            }
            return true;
        }
        self.found.push(Finder { x: cx, y: cy, module_size, count: 1 });
        self.file(self.found.len() - 1);
        true
    }
}

/// Finds finder pattern candidates, most often confirmed first. `tolerance` is
/// how far a run may stray from its share, in modules.
pub fn find_finders(image: &BitImage, tolerance: f64, work: Option<&mut Work>, edges: &mut Edges) -> Vec<Finder> {
    let (width, height) = (image.width, image.height);
    let columns = width / CELL + 1;
    let mut scan = Scan { image, tolerance, work, found: Vec::new(), columns, cells: Vec::new() };
    let data = &image.data;
    let skip = (height / 200).clamp(1, 3);
    let mut y = skip - 1;
    while y < height {
        // Run by run, as a walk along the row pixel by pixel would count them:
        // dark runs into the even places, light runs into the odd ones.
        let mut counts = [0i64; 5];
        let mut state = 0usize;
        let changes = edges.row(y);
        let mut ink = data[y * width] == 1;
        let mut x = 0usize;
        for k in 0..=changes.len() {
            let end = if k < changes.len() { changes[k] as usize } else { width };
            let length = (end - x) as i64;
            if ink {
                if state & 1 == 1 {
                    state += 1;
                }
                counts[state] += length;
            } else if state != 4 {
                state += 1;
                counts[state] += length;
            } else if finder_ratio(&counts, tolerance) && scan.consider(&counts, y, x) {
                // A pattern ends here. Its last light pixel starts nothing; the rest of the run does.
                counts = [0; 5];
                state = 0;
                if length > 1 {
                    state = 1;
                    counts[1] = length - 1;
                }
            } else {
                counts[0] = counts[2];
                counts[1] = counts[3];
                counts[2] = counts[4];
                counts[3] = length;
                counts[4] = 0;
                state = 3;
            }
            x = end;
            ink = !ink;
        }
        if state == 4 && finder_ratio(&counts, tolerance) {
            scan.consider(&counts, y, width);
        }
        y += skip;
    }
    let mut found = scan.found;
    found.sort_by(|a, b| b.count.cmp(&a.count));
    found
}
