//! The conformance pack, `vectors/conformance.json`, as far as the front end
//! goes: greyscale from RGBA, and for every frame the greyscale, binarised and
//! reduced pictures by SHA-256 and the finder candidates exactly.

use forgesworn_qr::binarise::{binarise, contrast_thresholds, enlarge, invert, invert_luminance, level_blocks, shrink, thresholds, to_luminance, Image, Reductions};
use forgesworn_qr::decode::{decode, Inversion};
use forgesworn_qr::locate::{find_finders, Edges, Finder, Work};
use forgesworn_qr::place::{estimate_size, finder_triples, locate};
use forgesworn_qr::symbol::decode_modules;
use forgesworn_qr::{MIN_REDUCED, REDUCTIONS, TOLERANCES};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::path::PathBuf;

fn vectors() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../vectors")
}

fn pack() -> Value {
    let text = std::fs::read_to_string(vectors().join("conformance.json")).expect("conformance.json");
    serde_json::from_str(&text).expect("valid JSON")
}

fn unhex(s: &str) -> Vec<u8> {
    assert!(s.len() % 2 == 0);
    (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap()).collect()
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn sha(bytes: &[u8]) -> String {
    hex(&Sha256::digest(bytes))
}

fn load_grey(path: &str) -> Image {
    let file = std::fs::File::open(vectors().join(path)).unwrap_or_else(|e| panic!("{path}: {e}"));
    let mut reader = png::Decoder::new(std::io::BufReader::new(file)).read_info().unwrap();
    let info = reader.info();
    assert_eq!(info.color_type, png::ColorType::Grayscale, "{path} must be 8-bit grey");
    assert_eq!(info.bit_depth, png::BitDepth::Eight, "{path} must be 8-bit grey");
    let mut buf = vec![0u8; reader.output_buffer_size()];
    let frame = reader.next_frame(&mut buf).unwrap();
    buf.truncate(frame.buffer_size());
    Image { data: buf, width: frame.width as usize, height: frame.height as usize }
}

/// A finder list as plain numbers, so that 3 and 3.0 are the same and the comparison is exact in `f64`.
fn numbers(list: &[forgesworn_qr::locate::Finder]) -> Vec<[f64; 4]> {
    list.iter().map(|f| [f.x, f.y, f.module_size, f.count as f64]).collect()
}

fn expected(v: &Value) -> Vec<[f64; 4]> {
    v.as_array().unwrap().iter().map(|r| [0, 1, 2, 3].map(|i| r[i].as_f64().unwrap())).collect()
}

#[test]
fn luminance_from_rgba() {
    let pack = pack();
    let cases = pack["luminance"].as_array().unwrap();
    for (n, v) in cases.iter().enumerate() {
        let (w, h) = (v["width"].as_u64().unwrap() as usize, v["height"].as_u64().unwrap() as usize);
        let grey = to_luminance(&unhex(v["rgba"].as_str().unwrap()), w, h, 4, w);
        assert_eq!(hex(&grey.data), v["grey"].as_str().unwrap(), "luminance case {n} ({w} x {h})");
    }
    eprintln!("luminance: {} of {} cases passed", cases.len(), cases.len());
}

#[test]
fn enlargement_matches_including_half_up_ties() {
    let pack = pack();
    for (n, v) in pack["enlargement"].as_array().unwrap().iter().enumerate() {
        let width = v["width"].as_u64().unwrap() as usize;
        let height = v["height"].as_u64().unwrap() as usize;
        let factor = v["factor"].as_u64().unwrap() as usize;
        let grey = Image { data: unhex(v["grey"].as_str().unwrap()), width, height };
        assert_eq!(hex(&enlarge(&grey, factor).data), v["enlarged"].as_str().unwrap(), "enlargement case {n}");
    }
}

#[test]
fn contrast_thresholds_leave_flat_blocks_out_of_mixed_averages() {
    let pack = pack();
    let cases = pack["contrast"].as_array().unwrap();
    let mut changed = 0;
    for (n, v) in cases.iter().enumerate() {
        let width = v["width"].as_u64().unwrap() as usize;
        let height = v["height"].as_u64().unwrap() as usize;
        let grey = Image { data: unhex(v["grey"].as_str().unwrap()), width, height };
        let want = |key: &str| v[key].as_array().map(|a| a.iter().map(|x| x.as_f64().unwrap()).collect::<Vec<f64>>());
        assert_eq!(Some(thresholds(&grey).values), want("thresholds"), "contrast case {n}: ordinary thresholds");
        let blocks = level_blocks(&grey).expect("at least 40 pixels a side");
        let got = contrast_thresholds(&grey, &blocks).map(|t| t.values);
        if got.is_some() {
            changed += 1;
        }
        assert_eq!(got, want("contrast"), "contrast case {n}: contrast-only thresholds");
    }
    assert!(changed >= 3);
}

/// Counts what the decoder's whole search counts when it finds no finder
/// triple, so that a frame which reads nothing and never locates a code must
/// match the pack's `work.steps` and `work.compared`.
fn count_work(grey: &Image) -> Work {
    let mut work = Work::default();
    let mut pass = |image: &Image, both: bool| {
        let bits = binarise(image, &thresholds(image));
        let mut edges = Edges::new(&bits);
        for t in TOLERANCES {
            find_finders(&bits, t, Some(&mut work), &mut edges);
        }
        if both {
            let inverse = invert(&bits);
            for t in TOLERANCES {
                find_finders(&inverse, t, Some(&mut work), &mut edges);
            }
        }
    };
    pass(grey, true);
    let mut shrunk = Reductions::new(grey);
    for f in REDUCTIONS {
        if grey.width / f < MIN_REDUCED || grey.height / f < MIN_REDUCED {
            continue;
        }
        pass(&shrunk.get(f), true);
    }
    // Step 10: flat blocks beside enough range re-threshold the luminance
    // inverse, searched dark on light only, at full size and reduced.
    if thresholds(grey).inverted_fallback {
        let inverse = invert_luminance(grey);
        pass(&inverse, false);
        let mut inverse_shrunk = Reductions::new(&inverse);
        for f in REDUCTIONS {
            if grey.width / f < MIN_REDUCED || grey.height / f < MIN_REDUCED {
                continue;
            }
            pass(&inverse_shrunk.get(f), false);
        }
    }
    work
}

#[test]
fn frames() {
    let pack = pack();
    let frames = pack["frames"].as_array().unwrap();
    assert!(frames.len() >= 58, "the pack lists {} pictures", frames.len());
    let mut passed = 0;
    let mut finder_lists = 0;
    let mut reduced_checked = 0;
    let mut work_checked = 0;
    for entry in frames {
        let file = entry["file"].as_str().unwrap();
        let grey = load_grey(file);
        assert_eq!((grey.width as u64, grey.height as u64), (entry["width"].as_u64().unwrap(), entry["height"].as_u64().unwrap()), "{file}: size");
        assert_eq!(sha(&grey.data), entry["luminance"].as_str().unwrap(), "{file}: luminance");

        let t = thresholds(&grey);
        let bits = binarise(&grey, &t);
        assert_eq!(sha(&bits.data), entry["bits"].as_str().unwrap(), "{file}: bits");

        // Reduced sizes, by shrink() and by the one-pass reductions, which must agree.
        let mut one_pass = Reductions::new(&grey);
        for f in [2usize, 4, 8] {
            match entry["reduced"][f.to_string()].as_str() {
                None => assert!(grey.width / f < 1 || grey.height / f < 1, "{file}: reduced {f} is null but the picture is big enough"),
                Some(want) => {
                    let by_shrink = shrink(&grey, f);
                    assert_eq!(sha(&by_shrink.data), want, "{file}: shrink by {f}");
                    let by_pass = one_pass.get(f);
                    assert_eq!(by_pass, by_shrink, "{file}: one-pass reduction by {f}");
                    reduced_checked += 1;
                }
            }
        }

        let mut edges = Edges::new(&bits);
        for tolerance in TOLERANCES {
            let key = format!("{tolerance}");
            let got = numbers(&find_finders(&bits, tolerance, None, &mut edges));
            assert_eq!(got, expected(&entry["finders"][&key]), "{file}: finders at {key}");
            finder_lists += 1;
        }

        // A frame that read nothing and located nothing did only this work.
        let w = &entry["work"];
        if entry["result"].is_null() && ["maps", "scanned", "second", "meshes", "probed", "reduced"].iter().all(|k| w[*k].as_u64() == Some(0)) {
            let counted = count_work(&grey);
            assert_eq!((counted.steps, counted.compared), (w["steps"].as_u64().unwrap(), w["compared"].as_u64().unwrap()), "{file}: work");
            work_checked += 1;
        }
        passed += 1;
    }
    eprintln!("frames: {passed} of {} passed (greyscale, binarised, reduced sizes: {reduced_checked} checked)", frames.len());
    eprintln!("finders: {finder_lists} lists of {} matched exactly", frames.len() * 2);
    eprintln!("work counters: {work_checked} frames that read nothing matched steps and compared");
}

#[test]
fn one_pass_reductions_equal_shrink_on_odd_sizes() {
    let mut s = 7u32;
    for (w, h) in [(1usize, 1usize), (2, 2), (17, 23), (45, 31), (64, 64), (101, 77), (257, 129), (333, 211), (1000, 3)] {
        let data: Vec<u8> = (0..w * h)
            .map(|_| {
                s = s.wrapping_mul(1664525).wrapping_add(1013904223);
                (s >> 24) as u8
            })
            .collect();
        let grey = Image { data, width: w, height: h };
        let mut pass = Reductions::new(&grey);
        for f in [8usize, 2, 4, 8, 2] {
            assert_eq!(pass.get(f), shrink(&grey, f), "{w} x {h} by {f}");
        }
    }
    // The extremes of the rounding.
    for value in [0u8, 1, 127, 128, 254, 255] {
        let grey = Image { data: vec![value; 37 * 29], width: 37, height: 29 };
        let mut pass = Reductions::new(&grey);
        for f in [2usize, 4, 8] {
            assert_eq!(pass.get(f), shrink(&grey, f));
        }
    }
}

#[test]
fn invert_handles_lengths_not_divisible_by_four() {
    for len in 0..=19usize {
        let data: Vec<u8> = (0..len).map(|i| (i % 3 == 0) as u8).collect();
        let image = Image { data: data.clone(), width: len.max(1), height: 1 };
        let image = Image { width: len, ..image };
        let flipped = invert(&image);
        assert_eq!(flipped.data.len(), len);
        for (a, b) in data.iter().zip(flipped.data.iter()) {
            assert_eq!(*b, 1 - *a);
        }
        assert_eq!(invert(&flipped), image);
    }
}

/// Triples, sizes and sampling maps, against every frame of the pack.
#[test]
fn triples_and_placements() {
    let pack = pack();
    let frames = pack["frames"].as_array().unwrap();
    let (mut lists, mut triples_matched, mut sizes_matched, mut placed, mut maps_matched) = (0, 0, 0, 0, 0);
    for entry in frames {
        let file = entry["file"].as_str().unwrap();
        let grey = load_grey(file);
        let bits = binarise(&grey, &thresholds(&grey));
        let mut edges = Edges::new(&bits);
        for tolerance in TOLERANCES {
            let key = format!("{tolerance}");
            let found = find_finders(&bits, tolerance, None, &mut edges);
            let triples = finder_triples(&bits, &found);
            let want = entry["triples"][&key].as_array().unwrap();
            assert_eq!(triples.len(), want.len(), "{file}: triple count at {key}");
            for (n, (got, want)) in triples.iter().zip(want).enumerate() {
                let ids: Vec<usize> = want["finders"].as_array().unwrap().iter().map(|v| v.as_u64().unwrap() as usize).collect();
                assert_eq!(got.to_vec(), ids, "{file}: triple {n} at {key}");
                triples_matched += 1;
                let three: [Finder; 3] = got.map(|i| found[i]);
                let size = estimate_size(&bits, &three);
                assert_eq!(size, want["size"].as_i64(), "{file}: size of triple {n} at {key}");
                sizes_matched += 1;
            }
            lists += 1;
            // The sampling maps of the first triple of the strict scan, at its own size.
            if tolerance == 0.5 && !triples.is_empty() {
                let three: [Finder; 3] = triples[0].map(|i| found[i]);
                let maps = locate(&bits, &three, None, None, &mut edges);
                let want = entry["placements"].as_array().unwrap();
                assert_eq!(maps.len(), want.len(), "{file}: placement count");
                for (n, (got, want)) in maps.iter().zip(want).enumerate() {
                    assert_eq!(got.size as u64, want["size"].as_u64().unwrap(), "{file}: placement {n} size");
                    match (&got.alignment, want["alignment"].as_array()) {
                        (None, None) => {}
                        (Some(p), Some(a)) => assert_eq!([p.x, p.y], [a[0].as_f64().unwrap(), a[1].as_f64().unwrap()], "{file}: placement {n} alignment"),
                        (g, w) => panic!("{file}: placement {n} alignment {g:?} against {w:?}"),
                    }
                    let nine = want["matrix"].as_array().unwrap();
                    assert_eq!(nine.len(), 9);
                    for (i, w) in nine.iter().enumerate() {
                        match w.as_f64() {
                            Some(v) => assert_eq!(got.matrix[i], v, "{file}: placement {n} matrix[{i}]"),
                            None => assert!(!got.matrix[i].is_finite(), "{file}: placement {n} matrix[{i}] should be non-finite, got {}", got.matrix[i]),
                        }
                    }
                    maps_matched += 1;
                }
                placed += 1;
            } else if tolerance == 0.5 {
                assert!(entry["placements"].as_array().unwrap().is_empty(), "{file}: placements without a triple");
            }
        }
    }
    eprintln!("triples: {triples_matched} triples in {lists} lists matched in order");
    eprintln!("sizes: {sizes_matched} estimates matched");
    eprintln!("placements: {maps_matched} maps for {placed} frames matched (count, order, size, alignment, nine numbers exactly)");
}

/// The entries whose text needs a platform character-set decoder, which this port
/// has none of. SPEC.md ("Text for kanji and other ECIs") says what a platform
/// lacking the set gives: a kanji character is a single U+FFFD, and so is a hanzi
/// character that reads at all. For these three the test asserts `bytes` as
/// recorded and the SPEC-prescribed text in place of the recorded one.
const NEEDS_A_CHARSET: [(&str, &str); 2] = [
    ("ECI 26, UTF-8, around a kanji segment", "\u{e9}\u{fffd}\u{e9}"),
    ("kanji mode", "\u{fffd}\u{fffd}"),
];

/// Entries the reference ports read and this one refuses: a hanzi symbol,
/// since without a GB 18030 decoder it cannot make the check they make on
/// each pair, and refusing is the safe side of that.
const REFUSED_HERE: [&str; 1] = ["hanzi mode, GB2312"];

/// Reading module grids: every entry of the pack's `symbols`.
#[test]
fn symbols() {
    let pack = pack();
    let entries = pack["symbols"].as_array().unwrap();
    let (mut read, mut refused, mut by_spec) = (0, 0, 0);
    for entry in entries {
        let name = entry["name"].as_str().unwrap();
        let size = entry["size"].as_u64().unwrap() as usize;
        let mut modules = vec![0u8; size * size];
        for (y, row) in entry["rows"].as_array().unwrap().iter().enumerate() {
            let bytes = unhex(row.as_str().unwrap());
            assert_eq!(bytes.len(), (size + 7) / 8, "{name}: row {y} length");
            for x in 0..size {
                modules[y * size + x] = (bytes[x / 8] >> (7 - x % 8)) & 1;
            }
        }
        let got = decode_modules(&modules, size);
        let want = &entry["result"];
        if REFUSED_HERE.contains(&name) {
            assert!(!want.is_null(), "{name}: the reference reads this one");
            assert!(got.is_none(), "{name}: this port refuses hanzi symbols");
            refused += 1;
            continue;
        }
        if want.is_null() {
            assert!(got.is_none(), "{name}: should not read, read {:?}", got.map(|g| g.payload.text));
            refused += 1;
            continue;
        }
        let got = got.unwrap_or_else(|| panic!("{name}: should read"));
        let p = &got.payload;
        assert_eq!(hex(&p.bytes), want["bytes"].as_str().unwrap(), "{name}: bytes");
        assert_eq!(p.version as u64, want["version"].as_u64().unwrap(), "{name}: version");
        assert_eq!(p.ecc.letter().to_string(), want["ecc"].as_str().unwrap(), "{name}: ecc");
        assert_eq!(p.mask as u64, want["mask"].as_u64().unwrap(), "{name}: mask");
        let eci: Vec<u64> = want["eci"].as_array().unwrap().iter().map(|v| v.as_u64().unwrap()).collect();
        assert_eq!(p.eci.iter().map(|&v| v as u64).collect::<Vec<_>>(), eci, "{name}: eci");
        assert_eq!(p.corrected as u64, want["corrected"].as_u64().unwrap(), "{name}: corrected");
        assert_eq!(got.mirrored, want["mirrored"].as_bool().unwrap(), "{name}: mirrored");
        if let Some((_, text)) = NEEDS_A_CHARSET.iter().find(|(n, _)| *n == name) {
            assert_eq!(&p.text, text, "{name}: text for a platform without the character set");
            by_spec += 1;
        } else {
            assert_eq!(&p.text, want["text"].as_str().unwrap(), "{name}: text");
        }
        read += 1;
    }
    assert_eq!(by_spec, NEEDS_A_CHARSET.len(), "every named entry must be in the pack");
    eprintln!(
        "symbols: {} of {} entries matched ({read} read, {refused} refused; {by_spec} of the read ones checked for text against SPEC.md, not the recording)",
        read + refused,
        entries.len()
    );
}

fn point(v: &Value) -> [f64; 2] {
    let a = v.as_array().unwrap();
    [a[0].as_f64().unwrap(), a[1].as_f64().unwrap()]
}

/// The whole decoder, against every frame of the pack: the result (or none),
/// the exact location and all eight work counters. Nothing is skipped.
#[test]
fn decoder() {
    let pack = pack();
    let frames = pack["frames"].as_array().unwrap();
    let (mut read, mut unread, mut second, mut meshed, mut reduced) = (0, 0, 0, 0, 0);
    for entry in frames {
        let file = entry["file"].as_str().unwrap();
        let grey = load_grey(file);
        let mut work = Work::default();
        let got = decode(&grey.data, grey.width, grey.height, 1, grey.width, Inversion::Both, Some(&mut work));
        let w = &entry["work"];
        let want = &entry["result"];
        let counted = [work.steps, work.compared, work.scanned, work.maps, work.second, work.meshes, work.probed, work.reduced];
        let recorded = ["steps", "compared", "scanned", "maps", "second", "meshes", "probed", "reduced"].map(|k| w[k].as_u64().unwrap());
        assert_eq!(counted, recorded, "{file}: work counters (steps, compared, scanned, maps, second, meshes, probed, reduced)");
        if work.second > 0 {
            second += 1;
        }
        if work.meshes > 0 {
            meshed += 1;
        }
        if work.reduced > 0 {
            reduced += 1;
        }
        if want.is_null() {
            assert!(got.is_none(), "{file}: the pack reads nothing here");
            unread += 1;
            continue;
        }
        let got = got.unwrap_or_else(|| panic!("{file}: should read"));
        let p = &got.payload;
        assert_eq!(hex(&p.bytes), want["bytes"].as_str().unwrap(), "{file}: bytes");
        assert_eq!(p.text, want["text"].as_str().unwrap(), "{file}: text");
        assert_eq!(p.version as u64, want["version"].as_u64().unwrap(), "{file}: version");
        assert_eq!(p.ecc.letter().to_string(), want["ecc"].as_str().unwrap(), "{file}: ecc");
        assert_eq!(p.mask as u64, want["mask"].as_u64().unwrap(), "{file}: mask");
        let eci: Vec<u64> = want["eci"].as_array().unwrap().iter().map(|v| v.as_u64().unwrap()).collect();
        assert_eq!(p.eci.iter().map(|&v| v as u64).collect::<Vec<_>>(), eci, "{file}: eci");
        assert_eq!(p.corrected as u64, want["corrected"].as_u64().unwrap(), "{file}: corrected");
        assert_eq!(got.mirrored, want["mirrored"].as_bool().unwrap(), "{file}: mirrored");
        assert_eq!(got.inverted, want["inverted"].as_bool().unwrap(), "{file}: inverted");
        let loc = &want["location"];
        let at = |p: &forgesworn_qr::place::Point| [p.x, p.y];
        assert_eq!(at(&got.location.top_left), point(&loc["topLeft"]), "{file}: topLeft");
        assert_eq!(at(&got.location.top_right), point(&loc["topRight"]), "{file}: topRight");
        assert_eq!(at(&got.location.bottom_left), point(&loc["bottomLeft"]), "{file}: bottomLeft");
        match (&got.location.alignment, loc["alignment"].is_null()) {
            (None, true) => {}
            (Some(a), false) => assert_eq!(at(a), point(&loc["alignment"]), "{file}: alignment"),
            (g, _) => panic!("{file}: alignment {g:?} against {}", loc["alignment"]),
        }
        read += 1;
    }
    assert_eq!(read + unread, frames.len());
    assert!(second > 0 && meshed > 0 && reduced > 0, "the pack must exercise the second look, the mesh and the reduced pass");
    eprintln!(
        "decoder: {} of {} frames matched (result, exact location, all eight work counters): {read} read, {unread} unread; {second} took a second look, {meshed} a mesh, {reduced} a reduced pass",
        read + unread,
        frames.len()
    );
}

/// `inversion` limits the polarities: `Normal` is the first half of `Both`,
/// and `Inverted` never gives a dark-on-light reading.
#[test]
fn inversion_option() {
    let pack = pack();
    let frames = pack["frames"].as_array().unwrap();
    let mut checked = 0;
    for entry in frames.iter().filter(|e| !e["result"].is_null() && e["result"]["inverted"] == false).take(12) {
        let file = entry["file"].as_str().unwrap();
        let grey = load_grey(file);
        let (mut both_work, mut normal_work) = (Work::default(), Work::default());
        let both = decode(&grey.data, grey.width, grey.height, 1, grey.width, Inversion::Both, Some(&mut both_work));
        let normal = decode(&grey.data, grey.width, grey.height, 1, grey.width, Inversion::Normal, Some(&mut normal_work));
        assert_eq!(both, normal, "{file}: normal gives what both gives on a dark-on-light frame");
        let inverted = decode(&grey.data, grey.width, grey.height, 1, grey.width, Inversion::Inverted, None);
        assert!(inverted.map_or(true, |r| r.inverted), "{file}: inverted reads only light on dark");
        checked += 1;
    }
    assert!(checked > 0);
    eprintln!("inversion: {checked} frames checked");
}

/// A frame with padded rows reads as the same frame without.
#[test]
fn row_stride_and_bad_arguments() {
    let pack = pack();
    let entry = pack["frames"].as_array().unwrap().iter().find(|e| !e["result"].is_null()).unwrap();
    let grey = load_grey(entry["file"].as_str().unwrap());
    let stride = grey.width + 13;
    let mut padded = vec![77u8; stride * grey.height];
    for y in 0..grey.height {
        padded[y * stride..y * stride + grey.width].copy_from_slice(&grey.data[y * grey.width..(y + 1) * grey.width]);
    }
    let plain = decode(&grey.data, grey.width, grey.height, 1, grey.width, Inversion::Both, None);
    assert!(plain.is_some());
    assert_eq!(decode(&padded, grey.width, grey.height, 1, stride, Inversion::Both, None), plain);
    // Where the TypeScript throws there is nothing to read.
    assert!(decode(&grey.data, grey.width, grey.height, 3, grey.width, Inversion::Both, None).is_none());
    assert!(decode(&grey.data, grey.width, grey.height, 1, grey.width - 1, Inversion::Both, None).is_none());
    assert!(decode(&grey.data[..grey.data.len() - 1], grey.width, grey.height, 1, grey.width, Inversion::Both, None).is_none());
    assert!(decode(&grey.data, 0, grey.height, 1, 0, Inversion::Both, None).is_none());
}
