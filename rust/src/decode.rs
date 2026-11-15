//! The ordinary search: the finder scan, triples, sampling maps and module
//! reading of SPEC.md's decoder, at full size, in both polarities.
//!
//! Left out, so that this is a part of the TypeScript `decode` and not all of
//! it: the second look (the refinement of a map whose format copies agreed but
//! whose symbol did not read), the reduced-size pass, the `inversion` and
//! `rowStride` options and the checks that make the TypeScript throw. A
//! picture that reads only through one of those gives `None` here. Where the
//! TypeScript would have taken a second look or a reduced pass the counters
//! `Work::second` and `Work::reduced` stay 0 here, so a frame can be compared
//! counter for counter only where the TypeScript's own were 0.

use crate::binarise::{binarise, invert, thresholds, to_luminance, BitImage};
use crate::locate::{find_finders, Edges, Finder, Work};
use crate::place::{estimate_size, finder_triples, locate, Location, Point};
use crate::symbol::{decode_modules, Payload};
use crate::TOLERANCES;

/// Triples tried at each tolerance.
const MAX_TRIPLES: usize = 6;
/// Maps sampled a frame at most, at every size together: four passes, six
/// triples, five sizes, six maps a size.
const MAX_MAPS: u32 = 4 * MAX_TRIPLES as u32 * 5 * 6;
/// The size retries, in the order they are tried.
const DELTAS: [i64; 5] = [0, -4, 4, -8, 8];

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

/// What is left of a frame's maps, and of the maps this size may take.
struct Budget {
    maps: u32,
    here: u32,
}

/// Finds and reads one QR code by the ordinary search alone. `channels` is 4
/// (RGBA) or 1 (grey), rows are `width` pixels apart. `None` when nothing
/// reads, and also when `channels` is neither 1 nor 4, `width` or `height` is
/// 0 or `data` is too short (the TypeScript throws there). `work` is added to,
/// as the TypeScript's `decodeCounted` does.
pub fn decode_ordinary(data: &[u8], width: usize, height: usize, channels: usize, mut work: Option<&mut Work>) -> Option<Reading> {
    if (channels != 1 && channels != 4) || width == 0 || height == 0 || data.len() < width * height * channels {
        return None;
    }
    let luminance = to_luminance(data, width, height, channels, width);
    let mut budget = Budget { maps: MAX_MAPS, here: MAX_MAPS };
    let bits = binarise(&luminance, &thresholds(&luminance));
    // The inverse changes colour where the picture does, so one set of edges serves both.
    let mut edges = Edges::new(&bits);
    let mut modules: Vec<u8> = Vec::new();
    if let Some(found) = search(&bits, &mut edges, false, &mut budget, &mut modules, work.as_deref_mut()) {
        return Some(found);
    }
    let inverse = invert(&bits);
    search(&inverse, &mut edges, true, &mut budget, &mut modules, work)
}

/// The size estimate when it is past 177 by at most the retries' 8; otherwise `None`.
fn over(image: &BitImage, triple: &[Finder; 3]) -> Option<i64> {
    estimate_size(image, triple).filter(|&size| size > 177 && size <= 177 + 8)
}

fn search(image: &BitImage, edges: &mut Edges, inverted: bool, budget: &mut Budget, modules: &mut Vec<u8>, mut work: Option<&mut Work>) -> Option<Reading> {
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
                    }
                    if let Some(result) = read(image, location, inverted, modules) {
                        return Some(result);
                    }
                }
            }
        }
    }
    None
}

/// Samples the module grid through the map and reads it, straight then mirrored.
fn read(image: &BitImage, location: &Location, inverted: bool, modules: &mut Vec<u8>) -> Option<Reading> {
    let size = location.size;
    modules.clear();
    modules.resize(size * size, 0);
    let [m0, m1, m2, m3, m4, m5, m6, m7, m8] = location.matrix;
    let (width, height) = (image.width as f64, image.height as f64);
    for y in 0..size {
        let v = y as f64 + 0.5;
        for x in 0..size {
            let u = x as f64 + 0.5;
            let w = m6 * u + m7 * v + m8;
            let px = ((m0 * u + m1 * v + m2) / w).floor();
            let py = ((m3 * u + m4 * v + m5) / w).floor();
            // A NaN fails every comparison, and so the module stays 0 as in the reference.
            if px >= 0.0 && py >= 0.0 && px < width && py < height {
                modules[y * size + x] = image.data[py as usize * image.width + px as usize];
            }
        }
    }
    let decoded = decode_modules(modules, size)?;
    Some(Reading {
        payload: decoded.payload,
        mirrored: decoded.mirrored,
        inverted,
        location: Place { top_left: location.top_left, top_right: location.top_right, bottom_left: location.bottom_left, alignment: location.alignment },
    })
}
