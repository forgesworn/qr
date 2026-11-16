//! The whole decoder: the ordinary search in each polarity (SPEC.md steps 3 to
//! 7), the second look (step 8) and the reduced-size pass (step 9).

use crate::binarise::{binarise, invert, invert_luminance, thresholds, to_luminance, BitImage, Luminance, Reductions};
use crate::locate::{find_finders, Edges, Finder, Work};
use crate::place::{estimate_size, finder_triples, locate, locate_corners, Location, Point};
use crate::refine::{agreement, agreement_read, format_agrees, keep, second_look, second_look_with_late, sized, Candidate, SECOND_LOOKS};
use crate::symbol::{agreed_version, curvature_header, read_symbol, Payload, FORMAT_COORDS};
use std::cell::Cell;
use crate::{MIN_REDUCED, REDUCTIONS, TOLERANCES};

/// Triples tried at each tolerance.
const MAX_TRIPLES: usize = 6;
/// Maps sampled a frame at most, at every size together: four passes, six
/// triples, five sizes, six maps a size.
const MAX_MAPS: u32 = 4 * MAX_TRIPLES as u32 * 5 * 6;
/// Maps each reduced size may take, out of what the frame has left.
const REDUCED_MAPS: u32 = 30;
/// The size retries, in the order they are tried.
const DELTAS: [i64; 5] = [0, -4, 4, -8, 8];

/// Which way round to look for dark modules.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Inversion {
    /// Dark on light first, then light on dark.
    Both,
    /// Dark on light only.
    Normal,
    /// Light on dark only.
    Inverted,
}

/// Picture coordinates of the finder pattern centres, and of the alignment
/// pattern if one was used.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Place {
    pub top_left: Point,
    pub top_right: Point,
    pub bottom_left: Point,
    pub alignment: Option<Point>,
}

/// A symbol found in a picture.
#[derive(Clone, Debug, PartialEq)]
pub struct Reading {
    pub payload: Payload,
    /// The symbol was mirrored (read transposed).
    pub mirrored: bool,
    /// The symbol was light on dark.
    pub inverted: bool,
    pub location: Place,
}

#[derive(Clone, Copy)]
struct Hint { triple: [Finder; 3], size: usize, inverted: bool }

struct Overflow {
    finders: Vec<Finder>,
    ranked: Vec<[usize; 3]>,
    inverted: bool,
}

/// What is left of a frame's maps and second looks, shared by every size, and
/// of the maps this size may take.
struct Budget {
    maps: u32,
    second: u32,
    here: u32,
    inverted_fallback: bool,
    uniform: bool,
}

/// Finds and reads one QR code. `channels` is 4 (RGBA) or 1 (grey); rows are
/// `row_stride` pixels apart. `None` when nothing reads, and also where the
/// TypeScript `decode` throws: `channels` neither 1 nor 4, `width` or `height`
/// 0, `row_stride` under `width`, or `data` too short. `work` is added to, as
/// the TypeScript's `decodeCounted` does.
pub fn decode(data: &[u8], width: usize, height: usize, channels: usize, row_stride: usize, inversion: Inversion, mut work: Option<&mut Work>) -> Option<Reading> {
    if (channels != 1 && channels != 4) || width == 0 || height == 0 || row_stride < width {
        return None;
    }
    let last = row_stride.checked_mul(height - 1)?.checked_add(width)?;
    if data.len() < last.checked_mul(channels)? {
        return None;
    }
    let luminance = to_luminance(data, width, height, channels, row_stride);
    let mut budget = Budget { maps: MAX_MAPS, second: SECOND_LOOKS as u32, here: MAX_MAPS, inverted_fallback: false, uniform: false };
    let mut hints = Vec::new();
    let mut overflow = Vec::new();
    let mut curvature = Vec::new();
    if let Some(found) = look_with_hints(&luminance, inversion, 1, &mut budget, work.as_deref_mut(), false, Some(&mut hints), Some(&mut overflow), Some(&mut curvature)) {
        return Some(found);
    }
    if budget.uniform { return None; }
    // Nothing read at full size: the picture shrunk, coarse to fine, for codes
    // whose modules are large or carry texture or scan lines (decoder step 9).
    let mut shrunk = Reductions::new(&luminance);
    for f in REDUCTIONS {
        if width / f < MIN_REDUCED || height / f < MIN_REDUCED {
            continue;
        }
        // With no maps left no size can read, nor keep a candidate for a second look.
        if budget.maps == 0 {
            break;
        }
        budget.here = REDUCED_MAPS;
        let reduced = shrunk.get(f);
        if let Some(found) = look(&reduced, inversion, f, &mut budget, work.as_deref_mut(), false) {
            return Some(found);
        }
    }
    if inversion != Inversion::Normal && budget.maps > 0 && budget.inverted_fallback {
        budget.here = REDUCED_MAPS;
        let inverse = invert_luminance(&luminance);
        if let Some(mut found) = look(&inverse, Inversion::Normal, 1, &mut budget, work.as_deref_mut(), true) {
            found.inverted = true;
            return Some(found);
        }
        let mut inverse_shrunk = Reductions::new(&inverse);
        for f in REDUCTIONS {
            if budget.maps == 0 || budget.here == 0 { break; }
            if width / f < MIN_REDUCED || height / f < MIN_REDUCED { continue; }
            let reduced = inverse_shrunk.get(f);
            if let Some(mut found) = look(&reduced, Inversion::Normal, f, &mut budget, work.as_deref_mut(), true) {
                found.inverted = true;
                return Some(found);
            }
        }
    }
    if let Some(found) = recover(&luminance, &hints, &mut budget, work.as_deref_mut()) { return Some(found); }
    if let Some(found) = recover_overflow(&luminance, &overflow, &mut budget, work.as_deref_mut()) { return Some(found); }
    recover_curvature(&luminance, &curvature, &mut budget, work.as_deref_mut())
}

/// The ordinary search in each polarity, then the second look, on a picture
/// shrunk by `f` (1 for the picture itself). At reduced size a read counts
/// only if its format copies agree on its level and mask, and locations are
/// given in full-picture coordinates.
fn look(luminance: &Luminance, inversion: Inversion, f: usize, budget: &mut Budget, work: Option<&mut Work>, strict_override: bool) -> Option<Reading> {
    look_with_hints(luminance, inversion, f, budget, work, strict_override, None, None, None)
}

fn look_with_hints(luminance: &Luminance, inversion: Inversion, f: usize, budget: &mut Budget, mut work: Option<&mut Work>, strict_override: bool, mut hints: Option<&mut Vec<Hint>>, mut overflow: Option<&mut Vec<Overflow>>, mut curvature: Option<&mut Vec<Candidate>>) -> Option<Reading> {
    let levels = thresholds(luminance);
    if f == 1 && !strict_override {
        budget.inverted_fallback = levels.inverted_fallback;
        budget.uniform = levels.uniform;
    }
    if levels.uniform { return None; }
    let bits = binarise(luminance, &levels);
    let strict = f > 1 || strict_override;
    let mut candidates: Vec<Candidate> = Vec::new();
    // The inverse changes colour where the picture does, so one set of edges serves both.
    let mut edges = Edges::new(&bits);
    let mut modules: Vec<u8> = Vec::new();
    if inversion != Inversion::Inverted {
        if let Some(found) = search_with_hints(&bits, &mut edges, false, &mut candidates, budget, strict, f, &mut modules, work.as_deref_mut(), hints.as_deref_mut(), overflow.as_deref_mut(), curvature.as_deref_mut()) {
            return Some(found);
        }
    }
    if inversion != Inversion::Normal {
        let inverse = invert(&bits);
        if let Some(found) = search_with_hints(&inverse, &mut edges, true, &mut candidates, budget, strict, f, &mut modules, work.as_deref_mut(), hints.as_deref_mut(), overflow.as_deref_mut(), curvature.as_deref_mut()) {
            return Some(found);
        }
    }
    // Nothing read: look again at the few maps whose format copies agreed.
    if candidates.is_empty() || budget.second == 0 {
        return None;
    }
    for candidate in &candidates {
        if budget.second == 0 {
            break;
        }
        budget.second -= 1;
        if let Some(w) = work.as_deref_mut() {
            w.second += 1;
        }
        if let Some(payload) = second_look(luminance, &levels, candidate, work.as_deref_mut(), strict) {
            return Some(Reading { payload, mirrored: candidate.mirrored, inverted: candidate.inverted, location: place(&candidate.location, f) });
        }
    }
    None
}

#[cfg(test)]
fn look_reference(luminance: &Luminance, inversion: Inversion, f: usize, budget: &mut Budget, mut work: Option<&mut Work>, strict_override: bool) -> Option<Reading> {
    let levels = thresholds(luminance);
    if f == 1 && !strict_override {
        budget.inverted_fallback = levels.inverted_fallback;
        budget.uniform = levels.uniform;
    }
    if levels.uniform { return None; }
    let bits = binarise(luminance, &levels);
    let strict = f > 1 || strict_override;
    let mut candidates: Vec<Candidate> = Vec::new();
    // The inverse changes colour where the picture does, so one set of edges serves both.
    let mut edges = Edges::new(&bits);
    let mut modules: Vec<u8> = Vec::new();
    if inversion != Inversion::Inverted {
        if let Some(found) = search_reference(&bits, &mut edges, false, &mut candidates, budget, strict, f, &mut modules, work.as_deref_mut()) {
            return Some(found);
        }
    }
    if inversion != Inversion::Normal {
        let inverse = invert(&bits);
        if let Some(found) = search_reference(&inverse, &mut edges, true, &mut candidates, budget, strict, f, &mut modules, work.as_deref_mut()) {
            return Some(found);
        }
    }
    // Nothing read: look again at the few maps whose format copies agreed.
    if candidates.is_empty() || budget.second == 0 {
        return None;
    }
    for candidate in &candidates {
        if budget.second == 0 {
            break;
        }
        budget.second -= 1;
        if let Some(w) = work.as_deref_mut() {
            w.second += 1;
        }
        if let Some(payload) = second_look(luminance, &levels, candidate, work.as_deref_mut(), strict) {
            return Some(Reading { payload, mirrored: candidate.mirrored, inverted: candidate.inverted, location: place(&candidate.location, f) });
        }
    }
    None
}


/// A location in full-picture coordinates. Picture coordinates are continuous,
/// pixel i covering [i, i + 1), so a point x in a picture shrunk by f lies at x * f.
fn place(location: &Location, f: usize) -> Place {
    if f == 1 {
        return Place { top_left: location.top_left, top_right: location.top_right, bottom_left: location.bottom_left, alignment: location.alignment };
    }
    let f = f as f64;
    let up = |p: Point| Point { x: p.x * f, y: p.y * f };
    Place { top_left: up(location.top_left), top_right: up(location.top_right), bottom_left: up(location.bottom_left), alignment: location.alignment.map(up) }
}

/// The size estimate when it is past 177 by at most the retries' 8; otherwise `None`.
fn over(image: &BitImage, triple: &[Finder; 3]) -> Option<i64> {
    estimate_size(image, triple).filter(|&size| size > 177 && size <= 177 + 8)
}

#[cfg(test)]
#[allow(clippy::too_many_arguments)]
fn search(
    image: &BitImage,
    edges: &mut Edges,
    inverted: bool,
    candidates: &mut Vec<Candidate>,
    budget: &mut Budget,
    strict: bool,
    f: usize,
    modules: &mut Vec<u8>,
    work: Option<&mut Work>,
) -> Option<Reading> {
    search_with_hints(image, edges, inverted, candidates, budget, strict, f, modules, work, None, None, None)
}

#[allow(clippy::too_many_arguments)]
fn search_with_hints(
    image: &BitImage,
    edges: &mut Edges,
    inverted: bool,
    candidates: &mut Vec<Candidate>,
    budget: &mut Budget,
    strict: bool,
    f: usize,
    modules: &mut Vec<u8>,
    mut work: Option<&mut Work>,
    mut hints: Option<&mut Vec<Hint>>,
    mut overflow: Option<&mut Vec<Overflow>>,
    mut curvature: Option<&mut Vec<Candidate>>,
) -> Option<Reading> {
    // No map can be read, but the caller still owns the second-look queue.
    if budget.maps == 0 || budget.here == 0 { return None; }
    // A strict pass first; a looser one for blurred or small codes.
    for tolerance in TOLERANCES {
        let found = find_finders(image, tolerance, work.as_deref_mut(), edges);
        let triples = finder_triples(image, &found);
        for ids in triples.iter().take(MAX_TRIPLES) {
            let triple: [Finder; 3] = ids.map(|i| found[i]);
            let first = locate(image, &triple, None, work.as_deref_mut(), edges);
            // An estimate past version 40 by no more than the retries reach still
            // tries the sizes of 177 or less among them.
            let size = match first.first() {
                Some(location) => location.size as i64,
                None => match over(image, &triple) {
                    Some(size) => size,
                    None => continue,
                },
            };
            // The size estimate can be a version out; try the neighbours too.
            for delta in DELTAS {
                let retried;
                let locations: &[Location] = if delta == 0 {
                    &first
                } else {
                    retried = locate(image, &triple, Some(size + delta), work.as_deref_mut(), edges);
                    &retried
                };
                for location in locations {
                    if budget.maps == 0 || budget.here == 0 {
                        return None;
                    }
                    budget.maps -= 1;
                    budget.here -= 1;
                    if let Some(w) = work.as_deref_mut() {
                        w.maps += 1;
                        if f > 1 {
                            w.reduced += 1;
                        }
                    }
                    if let Some(result) = read_with_curvature(image, location, inverted, candidates, strict, f, modules, curvature.as_deref_mut()) {
                        return Some(result);
                    }
                    if let Some(hints) = hints.as_deref_mut() {
                        collect_hint(image, location, modules, &triple, inverted, hints);
                    }
                    if budget.maps == 0 || budget.here == 0 { return None; }
                }
            }
        }
        if triples.len() > MAX_TRIPLES {
            if let Some(overflow) = overflow.as_deref_mut() {
                overflow.push(Overflow { finders: found, ranked: triples, inverted });
            }
        }
    }
    None
}

#[cfg(test)]
#[allow(clippy::too_many_arguments)]
fn search_reference(
    image: &BitImage,
    edges: &mut Edges,
    inverted: bool,
    candidates: &mut Vec<Candidate>,
    budget: &mut Budget,
    strict: bool,
    f: usize,
    modules: &mut Vec<u8>,
    mut work: Option<&mut Work>,
) -> Option<Reading> {
    // A strict pass first; a looser one for blurred or small codes.
    for tolerance in TOLERANCES {
        let found = find_finders(image, tolerance, work.as_deref_mut(), edges);
        let triples = finder_triples(image, &found);
        for ids in triples.iter().take(MAX_TRIPLES) {
            let triple: [Finder; 3] = ids.map(|i| found[i]);
            let first = locate(image, &triple, None, work.as_deref_mut(), edges);
            // An estimate past version 40 by no more than the retries reach still
            // tries the sizes of 177 or less among them.
            let size = match first.first() {
                Some(location) => location.size as i64,
                None => match over(image, &triple) {
                    Some(size) => size,
                    None => continue,
                },
            };
            // The size estimate can be a version out; try the neighbours too.
            for delta in DELTAS {
                let retried;
                let locations: &[Location] = if delta == 0 {
                    &first
                } else {
                    retried = locate(image, &triple, Some(size + delta), work.as_deref_mut(), edges);
                    &retried
                };
                for location in locations {
                    if budget.maps == 0 || budget.here == 0 {
                        return None;
                    }
                    budget.maps -= 1;
                    budget.here -= 1;
                    if let Some(w) = work.as_deref_mut() {
                        w.maps += 1;
                        if f > 1 {
                            w.reduced += 1;
                        }
                    }
                    if let Some(result) = read(image, location, inverted, candidates, strict, f, modules) {
                        return Some(result);
                    }
                }
            }
        }
    }
    None
}


/// Record a conflicting version only after both format copies agree. The
/// ordinary reader has already populated the format cells in `modules`.
fn collect_hint(image: &BitImage, location: &Location, modules: &[u8], triple: &[Finder; 3], inverted: bool, hints: &mut Vec<Hint>) {
    if hints.len() >= 4 || location.size < 45 { return; }
    let Some(format) = agreement(modules, location.size) else { return; };
    let [m0, m1, m2, m3, m4, m5, m6, m7, m8] = location.matrix;
    let sample = |x: usize, y: usize| {
        let (x, y) = if format.mirrored { (y, x) } else { (x, y) };
        let u = x as f64 + 0.5;
        let v = y as f64 + 0.5;
        let w = m6 * u + m7 * v + m8;
        let px = ((m0 * u + m1 * v + m2) / w).floor();
        let py = ((m3 * u + m4 * v + m5) / w).floor();
        px >= 0.0 && py >= 0.0 && px < image.width as f64 && py < image.height as f64
            && image.data[py as usize * image.width + px as usize] == 1
    };
    let Some(version) = agreed_version(&sample, location.size) else { return; };
    let size = 17 + 4 * version;
    if size == location.size { return; }
    if hints.iter().any(|h| h.size == size && h.inverted == inverted &&
        h.triple.iter().zip(triple).all(|(a, b)| a.x == b.x && a.y == b.y)) { return; }
    hints.push(Hint { triple: *triple, size, inverted });
}

/// Retry only saved version hints, after every existing search has failed.
fn recover(luminance: &Luminance, hints: &[Hint], budget: &mut Budget, mut work: Option<&mut Work>) -> Option<Reading> {
    if hints.is_empty() || budget.maps == 0 { return None; }
    let levels = thresholds(luminance);
    if levels.uniform { return None; }
    let normal = binarise(luminance, &levels);
    let inverse = if hints.iter().any(|h| h.inverted) { Some(invert(&normal)) } else { None };
    let mut edges = Edges::new(&normal);
    let mut modules = Vec::new();
    let mut candidates = Vec::new();
    let mut remaining = 30u32;
    for hint in hints {
        if budget.maps == 0 || remaining == 0 { break; }
        let image = if hint.inverted { inverse.as_ref().unwrap() } else { &normal };
        for location in locate(image, &hint.triple, Some(hint.size as i64), work.as_deref_mut(), &mut edges) {
            if budget.maps == 0 || remaining == 0 { break; }
            budget.maps -= 1;
            remaining -= 1;
            if let Some(w) = work.as_deref_mut() { w.maps += 1; }
            if let Some(result) = read(image, &location, hint.inverted, &mut candidates, true, 1, &mut modules) {
                return Some(result);
            }
        }
    }
    for candidate in &candidates {
        if budget.second == 0 { break; }
        budget.second -= 1;
        if let Some(w) = work.as_deref_mut() { w.second += 1; }
        if let Some(payload) = second_look(luminance, &levels, candidate, work.as_deref_mut(), true) {
            return Some(Reading { payload, mirrored: candidate.mirrored, inverted: candidate.inverted, location: place(&candidate.location, 1) });
        }
    }
    None
}

/// The same ordered finder centres identify a triple within one polarity.
fn same_triple(a: &[Finder; 3], b: &[Finder; 3]) -> bool {
    a.iter().zip(b).all(|(x, y)| x.x == y.x && x.y == y.y)
}

/// Probe already-ranked overflow only after the ordinary and version searches.
fn recover_overflow(luminance: &Luminance, overflow: &[Overflow], budget: &mut Budget, mut work: Option<&mut Work>) -> Option<Reading> {
    if overflow.is_empty() || budget.maps == 0 { return None; }
    let levels = thresholds(luminance);
    if levels.uniform { return None; }
    let normal = binarise(luminance, &levels);
    let mut inverse = None;
    let mut edges = Edges::new(&normal);
    let mut modules = Vec::new();
    let mut candidates = Vec::new();
    let mut remaining = REDUCED_MAPS;
    let mut seen: Vec<([Finder; 3], bool)> = Vec::new();
    let mut admitted: Vec<([Finder; 3], bool, usize)> = Vec::new();
    for group in overflow {
        if budget.maps == 0 || remaining == 0 { break; }
        let image = if group.inverted { inverse.get_or_insert_with(|| invert(&normal)) } else { &normal };
        for ids in group.ranked.iter().skip(MAX_TRIPLES) {
            if budget.maps == 0 || remaining == 0 { break; }
            let triple = ids.map(|i| group.finders[i]);
            if seen.iter().any(|(t, inv)| *inv == group.inverted && same_triple(t, &triple)) { continue; }
            seen.push((triple, group.inverted));
            for probe in locate_corners(image, &triple, &mut edges) {
                if budget.maps == 0 || remaining == 0 { break; }
                budget.maps -= 1;
                remaining -= 1;
                if let Some(w) = work.as_deref_mut() { w.maps += 1; }
                let [m0, m1, m2, m3, m4, m5, m6, m7, m8] = probe.matrix;
                let sample = |x: usize, y: usize| {
                    let u = x as f64 + 0.5;
                    let v = y as f64 + 0.5;
                    let w = m6 * u + m7 * v + m8;
                    let px = ((m0 * u + m1 * v + m2) / w).floor();
                    let py = ((m3 * u + m4 * v + m5) / w).floor();
                    px >= 0.0 && py >= 0.0 && px < image.width as f64 && py < image.height as f64
                        && image.data[py as usize * image.width + px as usize] == 1
                };
                let Some(format) = agreement_read(&sample, probe.size) else { continue; };
                let oriented = |x, y| if format.mirrored { sample(y, x) } else { sample(x, y) };
                let Some(version) = agreed_version(&oriented, probe.size) else { continue; };
                let target = 17 + 4 * version;
                if budget.maps == 0 || remaining == 0 { break; }
                if admitted.iter().any(|(t, inv, size)| *inv == group.inverted && *size == target && same_triple(t, &triple)) { continue; }
                admitted.push((triple, group.inverted, target));
                for location in locate(image, &triple, Some(target as i64), work.as_deref_mut(), &mut edges) {
                    if budget.maps == 0 || remaining == 0 { break; }
                    budget.maps -= 1;
                    remaining -= 1;
                    if let Some(w) = work.as_deref_mut() { w.maps += 1; }
                    if let Some(result) = read(image, &location, group.inverted, &mut candidates, true, 1, &mut modules) {
                        return Some(result);
                    }
                }
            }
        }
    }
    for candidate in &candidates {
        if budget.second == 0 { break; }
        budget.second -= 1;
        if let Some(w) = work.as_deref_mut() { w.second += 1; }
        if let Some(payload) = second_look(luminance, &levels, candidate, work.as_deref_mut(), true) {
            return Some(Reading { payload, mirrored: candidate.mirrored, inverted: candidate.inverted, location: place(&candidate.location, 1) });
        }
    }
    None
}

/// Try deferred curvature candidates only after all previous recovery paths.
fn recover_curvature(luminance: &Luminance, candidates: &[Candidate], budget: &mut Budget, mut work: Option<&mut Work>) -> Option<Reading> {
    if candidates.is_empty() || budget.second == 0 { return None; }
    let levels = thresholds(luminance);
    for candidate in candidates {
        if budget.second == 0 { break; }
        budget.second -= 1;
        if let Some(w) = work.as_deref_mut() { w.second += 1; }
        if let Some(payload) = second_look_with_late(luminance, &levels, candidate, work.as_deref_mut(), true, true) {
            return Some(Reading { payload, mirrored: candidate.mirrored, inverted: candidate.inverted, location: place(&candidate.location, 1) });
        }
    }
    None
}

/// Samples the module grid through the map and reads it, straight then
/// mirrored. A map that reads neither way, whose format copies agree, is kept
/// as a candidate for the second look.
fn read(image: &BitImage, location: &Location, inverted: bool, candidates: &mut Vec<Candidate>, strict: bool, f: usize, modules: &mut Vec<u8>) -> Option<Reading> {
    read_with_curvature(image, location, inverted, candidates, strict, f, modules, None)
}

fn read_with_curvature(image: &BitImage, location: &Location, inverted: bool, candidates: &mut Vec<Candidate>, strict: bool, f: usize, modules: &mut Vec<u8>, curvature: Option<&mut Vec<Candidate>>) -> Option<Reading> {
    let size = location.size;
    modules.clear();
    modules.resize(size * size, 2); // Unsampled; light and dark are 0 and 1.
    {
        let cells = Cell::from_mut(modules.as_mut_slice()).as_slice_of_cells();
        let [m0, m1, m2, m3, m4, m5, m6, m7, m8] = location.matrix;
        let (width, height) = (image.width as f64, image.height as f64);
        let sample = |x: usize, y: usize| {
            let cell = &cells[y * size + x];
            let cached = cell.get();
            if cached != 2 { return cached == 1; }
            let u = x as f64 + 0.5;
            let v = y as f64 + 0.5;
            let w = m6 * u + m7 * v + m8;
            let px = ((m0 * u + m1 * v + m2) / w).floor();
            let py = ((m3 * u + m4 * v + m5) / w).floor();
            // A NaN fails every comparison, so it is light as in the reference.
            let value = if px >= 0.0 && py >= 0.0 && px < width && py < height {
                image.data[py as usize * image.width + px as usize]
            } else { 0 };
            cell.set(value);
            value == 1
        };
        if strict && agreement_read(&sample, size).is_none() { return None; }
        let straight_read = |x, y| sample(x, y);
        if let Some(payload) = read_symbol(straight_read, size) {
            if strict && !format_agrees(&straight_read, size, payload.ecc, payload.mask) {
                return None;
            }
            return Some(Reading { payload, mirrored: false, inverted, location: place(location, f) });
        }
        let mirrored_read = |x, y| sample(y, x);
        if let Some(payload) = read_symbol(mirrored_read, size) {
            if strict && !format_agrees(&mirrored_read, size, payload.ecc, payload.mask) {
                return None;
            }
            return Some(Reading { payload, mirrored: true, inverted, location: place(location, f) });
        }
        // A version mismatch may have stopped either read before its format.
        for (i, &(x, y)) in FORMAT_COORDS.iter().enumerate() {
            sample(x, y); sample(y, x);
            let (sx, sy) = if i < 8 { (size - 1 - i, 8) } else { (8, size - 7 + (i - 8)) };
            sample(sx, sy); sample(sy, sx);
        }
        if let Some(curvature) = curvature {
            for mirrored in [false, true] {
                let oriented = |x, y| if mirrored { sample(y, x) } else { sample(x, y) };
                let Some((ecc, mask, distance)) = curvature_header(&oriented, size) else { continue; };
                let duplicate = curvature.iter().any(|c| c.inverted == inverted && c.mirrored == mirrored
                    && c.ecc == ecc && c.mask == mask && c.location.size == size
                    && c.location.matrix == location.matrix);
                if !duplicate {
                    keep(curvature, Candidate { location: location.clone(), inverted, mirrored, ecc, mask, distance });
                }
            }
        }
    }
    if let Some(agreed) = agreement(modules, size) {
        if sized(modules, size, agreed.mirrored) {
            keep(candidates, Candidate { location: location.clone(), inverted, mirrored: agreed.mirrored, ecc: agreed.ecc, mask: agreed.mask, distance: agreed.distance });
        }
    }
    None
}

#[cfg(test)]
mod strict_format_tests {
    use super::*;
    use crate::encode::{encode, Options};
    use crate::symbol::Ecc;

    #[test]
    fn overflow_triple_identity_uses_ordered_centres_only() {
        let f = |x, y| Finder { x, y, module_size: 1.0, count: 1 };
        let a = [f(0.0, 1.0), f(2.0, 3.0), f(4.0, 5.0)];
        let mut b = a;
        b[0].x = -0.0;
        b[1].module_size = 9.0;
        b[1].count = 8;
        assert!(same_triple(&a, &b));
        b.swap(1, 2);
        assert!(!same_triple(&a, &b));
        b = a;
        b[0].x = f64::NAN;
        assert!(!same_triple(&b, &b));
    }

    #[test]
    fn recovery_without_maps_or_hints_preserves_budget_and_work() {
        let luminance = to_luminance(&[255; 64], 8, 8, 1, 8);
        let finder = Finder { x: 2.0, y: 2.0, module_size: 1.0, count: 1 };
        let hint = Hint { triple: [finder; 3], size: 177, inverted: false };
        let mut budget = Budget { maps: 0, here: 9, second: 3, inverted_fallback: false, uniform: false };
        let mut work = Work::default();
        assert!(recover(&luminance, &[hint], &mut budget, Some(&mut work)).is_none());
        assert_eq!((budget.maps, budget.here, budget.second), (0, 9, 3));
        assert_eq!(work, Work::default());
        budget.maps = 7;
        assert!(recover(&luminance, &[], &mut budget, Some(&mut work)).is_none());
        assert_eq!((budget.maps, budget.here, budget.second), (7, 9, 3));
        assert_eq!(work, Work::default());
    }

    #[test]
    fn decodes_thin_finder_centres_at_both_quiet_margins() {
        let qr = crate::encode::encode(
            "A",
            &crate::encode::Options {
                version: Some(1),
                ecc: crate::symbol::Ecc::H,
                ..Default::default()
            },
        )
        .unwrap();
        for centre in [1, 2] {
            for pad in [4, 5] {
                let side = qr.size + 2 * pad;
                let mut data = vec![235u8; side * side];
                for y in 0..qr.size {
                    for x in 0..qr.size {
                        if qr.modules[y * qr.size + x] != 0 {
                            data[(y + pad) * side + x + pad] = 20;
                        }
                    }
                }
                for (ox, oy) in [(0, 0), (qr.size - 7, 0), (0, qr.size - 7)] {
                    for y in [2, 4] {
                        for x in 2..=4 {
                            data[(pad + oy + y) * side + pad + ox + x] = 235;
                        }
                    }
                    if centre == 2 {
                        data[(pad + oy + 2) * side + pad + ox + 3] = 20;
                    }
                    for x in 0..=6 {
                        data[(pad + oy + 7) * side + pad + ox + x] = 20;
                    }
                }
                let reading =
                    super::decode(&data, side, side, 1, side, super::Inversion::Both, None)
                        .expect("thin finder reading");
                assert_eq!(reading.payload.text, "A");
                assert_eq!(reading.payload.bytes, b"A");
            }
        }
    }

    fn location(size: usize) -> Location {
        Location {
            top_left: Point { x: 3.5, y: 3.5 },
            top_right: Point { x: size as f64 - 3.5, y: 3.5 },
            bottom_left: Point { x: 3.5, y: size as f64 - 3.5 },
            alignment: None,
            size,
            matrix: [1., 0., 0., 0., 1., 0., 0., 0., 1.],
        }
    }

    fn sentinel(map: &Location) -> Candidate {
        Candidate { location: map.clone(), inverted: false, mirrored: false, ecc: Ecc::M, mask: 0, distance: 2 }
    }

    fn flip_second_copy(data: &mut [u8], size: usize, i: usize) {
        let (x, y) = if i < 8 { (size - 1 - i, 8) } else { (8, size - 7 + i - 8) };
        data[y * size + x] ^= 1;
    }

    fn transpose(data: &mut [u8], size: usize) {
        for y in 0..size {
            for x in 0..y { data.swap(y * size + x, x * size + y); }
        }
    }

    #[test]
    fn strict_rejects_disagreeing_formats_before_sampling_data() {
        for version in [1, 7, 12] {
            let qr = encode("hello", &Options { version: Some(version), ..Options::default() }).unwrap();
            let size = qr.size;
            let map = location(size);
            // Keep the first copy intact. Find three errors in the second copy
            // for which neither orientation has a shared format within two bits.
            let mut damaged = None;
            'find: for a in 0..15 { for b in a + 1..15 { for c in b + 1..15 {
                let mut data = qr.modules.clone();
                for i in [a, b, c] { flip_second_copy(&mut data, size, i); }
                if agreement(&data, size).is_none() {
                    damaged = Some(data);
                    break 'find;
                }
            }}}
            let damaged = damaged.expect("a format pair rejected in both orientations");
            for mirrored in [false, true] {
                let mut data = damaged.clone();
                if mirrored { transpose(&mut data, size); }
                assert!(agreement(&data, size).is_none());
                let image = BitImage { data, width: size, height: size };
                let mut queue = vec![sentinel(&map)];
                let before = format!("{queue:?}");
                let mut modules = Vec::new();
                let found = read(&image, &map, true, &mut queue, false, 4, &mut modules).unwrap();
                assert_eq!(found.payload.text, "hello");
                assert_eq!(found.payload.bytes.as_slice(), b"hello");
                assert_eq!(found.mirrored, mirrored);
                assert_eq!(format!("{queue:?}"), before);

                modules.clear();
                assert!(read(&image, &map, true, &mut queue, true, 4, &mut modules).is_none());
                assert_eq!(format!("{queue:?}"), before);
                let mut expected = vec![false; size * size];
                for (i, &(x, y)) in FORMAT_COORDS.iter().enumerate() {
                    let (sx, sy) = if i < 8 { (size - 1 - i, 8) } else { (8, size - 7 + i - 8) };
                    for (x, y) in [(x, y), (y, x), (sx, sy), (sy, sx)] {
                        expected[y * size + x] = true;
                    }
                }
                for (index, &sampled) in expected.iter().enumerate() {
                    assert_eq!(modules[index] != 2, sampled, "version {version}, module {index}");
                }
                assert!(expected.iter().filter(|&&sampled| sampled).count() < size * size / 2);
            }
        }
    }

    #[test]
    fn strict_accepts_matching_formats_and_preserves_metadata() {
        for version in [1, 7, 12] {
            let qr = encode("hello", &Options { version: Some(version), ..Options::default() }).unwrap();
            let size = qr.size;
            let map = location(size);
            for errors in 0..=2 { for mirrored in [false, true] { for inverted in [false, true] {
                let mut data = qr.modules.clone();
                for i in 0..errors { flip_second_copy(&mut data, size, i); }
                if mirrored { transpose(&mut data, size); }
                let image = BitImage { data, width: size, height: size };
                let mut strict_queue = vec![sentinel(&map)];
                let mut ordinary_queue = strict_queue.clone();
                let mut modules = Vec::new();
                let strict = read(&image, &map, inverted, &mut strict_queue, true, 4, &mut modules).unwrap();
                let ordinary = read(&image, &map, inverted, &mut ordinary_queue, false, 4, &mut modules).unwrap();
                assert_eq!(strict, ordinary);
                assert_eq!(strict.payload.text, "hello");
                assert_eq!(strict.payload.bytes.as_slice(), b"hello");
                assert_eq!(strict.mirrored, mirrored);
                assert_eq!(strict.inverted, inverted);
                assert_eq!(strict.location, place(&map, 4));
                assert_eq!(format!("{strict_queue:?}"), format!("{ordinary_queue:?}"));
                assert_eq!(strict_queue.len(), 1);
            }}}
        }
    }
}

#[cfg(test)]
mod exhausted_budget_tests {
    use super::*;
    use crate::binarise::Image;
    use crate::encode::{encode, Options};
    use crate::symbol::Ecc;

    fn budget(maps: u32, here: u32) -> Budget {
        Budget { maps, here, second: 4, inverted_fallback: false, uniform: false }
    }

    fn snapshot(b: &Budget) -> (u32, u32, u32, bool, bool) {
        (b.maps, b.here, b.second, b.inverted_fallback, b.uniform)
    }

    fn sentinel() -> Candidate {
        Candidate {
            location: Location {
                top_left: Point { x: 1.0, y: 2.0 }, top_right: Point { x: 3.0, y: 2.0 },
                bottom_left: Point { x: 1.0, y: 4.0 }, alignment: None, size: 21,
                matrix: [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0],
            },
            inverted: false, mirrored: false, ecc: Ecc::M, mask: 0, distance: 2,
        }
    }

    fn bent_version_12() -> Image {
        let path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("test-data/bent-version-12.png");
        let file = std::fs::File::open(path).expect("bent version 12 fixture");
        let mut reader = png::Decoder::new(std::io::BufReader::new(file)).read_info().unwrap();
        assert_eq!(reader.info().color_type, png::ColorType::Grayscale);
        assert_eq!(reader.info().bit_depth, png::BitDepth::Eight);
        let mut data = vec![0; reader.output_buffer_size()];
        let frame = reader.next_frame(&mut data).unwrap();
        data.truncate(frame.buffer_size());
        Image { data, width: frame.width as usize, height: frame.height as usize }
    }

    #[test]
    fn exhausted_entry_preserves_queue_modules_budget_and_work() {
        let image = Image { data: vec![0; 64 * 64], width: 64, height: 64 };
        for (maps, here) in [(0, 7), (7, 0), (0, 0)] {
            let mut edges = Edges::new(&image);
            let mut queue = vec![sentinel()];
            let before_queue = format!("{queue:?}");
            let mut modules = vec![2, 1, 0, 2];
            let before_modules = modules.clone();
            let mut b = budget(maps, here);
            let before_budget = snapshot(&b);
            let mut work = Work { steps: 3, compared: 4, scanned: 5, maps: 6, second: 7, meshes: 8, probed: 9, reduced: 10 };
            let before_work = work;
            assert!(search(&image, &mut edges, false, &mut queue, &mut b, false, 1, &mut modules, Some(&mut work)).is_none());
            assert_eq!(format!("{queue:?}"), before_queue);
            assert_eq!(modules, before_modules);
            assert_eq!(snapshot(&b), before_budget);
            assert_eq!(work, before_work);
        }
    }

    #[test]
    fn last_available_map_can_still_read() {
        let qr = encode("A", &Options { version: Some(1), ecc: Ecc::H, ..Default::default() }).unwrap();
        let side = qr.size + 8;
        let mut image = Image { data: vec![0; side * side], width: side, height: side };
        for y in 0..qr.size { for x in 0..qr.size { image.data[(y + 4) * side + x + 4] = qr.modules[y * qr.size + x]; } }
        let mut edges = Edges::new(&image);
        let mut queue = Vec::new();
        let mut modules = Vec::new();
        let mut b = budget(1, 1);
        let mut work = Work::default();
        let result = search(&image, &mut edges, false, &mut queue, &mut b, false, 1, &mut modules, Some(&mut work)).expect("first and last available map reads");
        assert_eq!(result.payload.text, "A");
        assert_eq!(result.payload.bytes, b"A");
        assert_eq!((b.maps, b.here, work.maps), (0, 0, 1));
        let mut reference_edges = Edges::new(&image);
        let mut reference_queue = Vec::new();
        let mut reference_modules = Vec::new();
        let mut reference_budget = budget(1, 1);
        let mut reference_work = Work::default();
        let reference = search_reference(&image, &mut reference_edges, false, &mut reference_queue, &mut reference_budget, false, 1, &mut reference_modules, Some(&mut reference_work)).expect("original final-map read");
        assert_eq!(result, reference);
        assert_eq!(snapshot(&b), snapshot(&reference_budget));
        assert_eq!(work, reference_work);
        assert_eq!(format!("{queue:?}"), format!("{reference_queue:?}"));
        assert_eq!(modules, reference_modules);
    }

    #[test]
    fn exhaustion_preserves_second_look_queue_and_actual_recovery() {
        let image = bent_version_12();
        let levels = thresholds(&image);
        assert!(!levels.uniform);
        let bits = binarise(&image, &levels);
        let inverse = invert(&bits);
        for (maps, here) in [(165, MAX_MAPS), (MAX_MAPS, 165), (165, 165)] {
            let mut actual_budget = budget(maps, here);
            let mut original_budget = budget(maps, here);
            let mut actual_queue = Vec::new();
            let mut original_queue = Vec::new();
            let mut actual_modules = Vec::new();
            let mut original_modules = Vec::new();
            let mut actual_edges = Edges::new(&bits);
            let mut original_edges = Edges::new(&bits);
            let mut actual_work = Work::default();
            let mut original_work = Work::default();
            for (plane, inverted) in [(&bits, false), (&inverse, true)] {
                let a = search(plane, &mut actual_edges, inverted, &mut actual_queue, &mut actual_budget, false, 1, &mut actual_modules, Some(&mut actual_work));
                let b = search_reference(plane, &mut original_edges, inverted, &mut original_queue, &mut original_budget, false, 1, &mut original_modules, Some(&mut original_work));
                assert_eq!(a, b);
                assert!(a.is_none(), "fixture must require the second look");
            }
            assert!(actual_budget.maps == 0 || actual_budget.here == 0);
            assert!(!actual_queue.is_empty(), "fixture must retain a second-look candidate at exhaustion");
            assert_eq!(format!("{actual_queue:?}"), format!("{original_queue:?}"));
            assert_eq!(snapshot(&actual_budget), snapshot(&original_budget));
            assert_eq!(actual_modules, original_modules);
            assert_eq!(actual_work.maps, original_work.maps);

            let mut b = budget(maps, here);
            let mut reference_budget = budget(maps, here);
            let mut work = Work::default();
            let mut reference_work = Work::default();
            let reading = look(&image, Inversion::Both, 1, &mut b, Some(&mut work), false)
                .expect("production look must recover through its retained second-look queue");
            let reference = look_reference(&image, Inversion::Both, 1, &mut reference_budget, Some(&mut reference_work), false)
                .expect("original look must also recover");
            assert_eq!(reading, reference);
            assert_eq!(reading.payload.text, "https://example.com/m/conformance0123456789abcdefghijklmnopqrs");
            assert_eq!(reading.payload.bytes, b"https://example.com/m/conformance0123456789abcdefghijklmnopqrs");
            assert!(b.maps == 0 || b.here == 0);
            assert_eq!(work.maps, 165);
            assert!(work.second > 0 && work.meshes > 0);
            assert_eq!((work.maps, work.second, work.meshes, work.probed, work.reduced), (reference_work.maps, reference_work.second, reference_work.meshes, reference_work.probed, reference_work.reduced));
            assert_eq!(snapshot(&b), snapshot(&reference_budget));
        }
    }
}
