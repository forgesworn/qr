//! The whole decoder: the ordinary search in each polarity (SPEC.md steps 3 to
//! 7), the second look (step 8) and the reduced-size pass (step 9).

use crate::binarise::{binarise, invert, invert_luminance, thresholds, to_luminance, BitImage, Luminance, Reductions};
use crate::locate::{find_finders, Edges, Finder, Work};
use crate::place::{estimate_size, finder_triples, locate, Location, Point};
use crate::refine::{agreement, agreement_read, format_agrees, keep, second_look, sized, Candidate, SECOND_LOOKS};
use crate::symbol::{read_symbol, Payload, FORMAT_COORDS};
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
    if let Some(found) = look(&luminance, inversion, 1, &mut budget, work.as_deref_mut(), false) {
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
    None
}

/// The ordinary search in each polarity, then the second look, on a picture
/// shrunk by `f` (1 for the picture itself). At reduced size a read counts
/// only if its format copies agree on its level and mask, and locations are
/// given in full-picture coordinates.
fn look(luminance: &Luminance, inversion: Inversion, f: usize, budget: &mut Budget, mut work: Option<&mut Work>, strict_override: bool) -> Option<Reading> {
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
        if let Some(found) = search(&bits, &mut edges, false, &mut candidates, budget, strict, f, &mut modules, work.as_deref_mut()) {
            return Some(found);
        }
    }
    if inversion != Inversion::Normal {
        let inverse = invert(&bits);
        if let Some(found) = search(&inverse, &mut edges, true, &mut candidates, budget, strict, f, &mut modules, work.as_deref_mut()) {
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

/// Samples the module grid through the map and reads it, straight then
/// mirrored. A map that reads neither way, whose format copies agree, is kept
/// as a candidate for the second look.
fn read(image: &BitImage, location: &Location, inverted: bool, candidates: &mut Vec<Candidate>, strict: bool, f: usize, modules: &mut Vec<u8>) -> Option<Reading> {
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
