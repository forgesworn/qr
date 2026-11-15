//! The conformance pack, `vectors/conformance.json`, as far as the front end
//! goes: greyscale from RGBA, and for every frame the greyscale, binarised and
//! reduced pictures by SHA-256 and the finder candidates exactly.

use forgesworn_qr::binarise::{binarise, invert, shrink, thresholds, to_luminance, Image, Reductions};
use forgesworn_qr::locate::{find_finders, Edges, Work};
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

/// Counts what the decoder's whole search counts when it finds no finder
/// triple, so that a frame which reads nothing and never locates a code must
/// match the pack's `work.steps` and `work.compared`.
fn count_work(grey: &Image) -> Work {
    let mut work = Work::default();
    let mut pass = |image: &Image| {
        let bits = binarise(image, &thresholds(image));
        let mut edges = Edges::new(&bits);
        for t in TOLERANCES {
            find_finders(&bits, t, Some(&mut work), &mut edges);
        }
        let inverse = invert(&bits);
        for t in TOLERANCES {
            find_finders(&inverse, t, Some(&mut work), &mut edges);
        }
    };
    pass(grey);
    let mut shrunk = Reductions::new(grey);
    for f in REDUCTIONS {
        if grey.width / f < MIN_REDUCED || grey.height / f < MIN_REDUCED {
            continue;
        }
        pass(&shrunk.get(f));
    }
    work
}

#[test]
fn frames() {
    let pack = pack();
    let frames = pack["frames"].as_array().unwrap();
    assert_eq!(frames.len(), 57);
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
