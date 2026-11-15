//! Reads every `.grey` file of a directory, in name order, at each quarter
//! turn, and prints one line a reading for comparison with `bench/dump.mjs`:
//! `dump <directory>`. A `.grey` file is the width and height as big-endian
//! 32-bit integers, then one grey byte a pixel.
//!
//! Line: `<file> q<turn> <payload hex or -> v<version> <level> m<mask>
//! c<corrected> <mirrored> <inverted> <tl> <tr> <bl> <alignment> w <steps>
//! <compared> <scanned> <maps> <second> <meshes> <probed> <reduced>`. A point
//! is `<x>:<y>`, each the IEEE bit pattern read as a signed 64-bit integer,
//! or `-`. A picture that reads nothing prints `-`, `vnull null mnull cnull
//! null null` and four `-` where the rest would be.

use forgesworn_qr::decode::{decode, Inversion};
use forgesworn_qr::locate::Work;
use forgesworn_qr::place::Point;
use std::fmt::Write;

fn rotate(data: &[u8], width: usize, height: usize, turn: u8) -> (Vec<u8>, usize, usize) {
    match turn {
        0 => (data.to_vec(), width, height),
        // A source pixel (x, y) goes to (h - 1 - y, x) in a picture h wide and w high.
        1 => {
            let mut out = vec![0u8; data.len()];
            for y in 0..height {
                for x in 0..width {
                    out[x * height + (height - 1 - y)] = data[y * width + x];
                }
            }
            (out, height, width)
        }
        2 => (data.iter().rev().copied().collect(), width, height),
        // (x, y) goes to (y, w - 1 - x) in a picture h wide and w high.
        _ => {
            let mut out = vec![0u8; data.len()];
            for y in 0..height {
                for x in 0..width {
                    out[(width - 1 - x) * height + y] = data[y * width + x];
                }
            }
            (out, height, width)
        }
    }
}

fn point(p: Option<Point>) -> String {
    match p {
        Some(p) => format!("{}:{}", p.x.to_bits() as i64, p.y.to_bits() as i64),
        None => "-".to_string(),
    }
}

fn main() {
    let dir = std::env::args().nth(1).expect("a directory of .grey files");
    let mut names: Vec<String> = std::fs::read_dir(&dir).expect("directory").map(|e| e.unwrap().file_name().into_string().unwrap()).filter(|n| n.ends_with(".grey")).collect();
    names.sort();
    let mut out = String::new();
    for name in &names {
        let bytes = std::fs::read(format!("{dir}/{name}")).expect("file");
        let width = i32::from_be_bytes(bytes[0..4].try_into().unwrap()) as usize;
        let height = i32::from_be_bytes(bytes[4..8].try_into().unwrap()) as usize;
        assert_eq!(bytes.len(), 8 + width * height, "{name}: unexpected length");
        for turn in 0..4u8 {
            let (data, w, h) = rotate(&bytes[8..], width, height, turn);
            let mut work = Work::default();
            let found = decode(&data, w, h, 1, w, Inversion::Both, Some(&mut work));
            write!(out, "{name} q{turn} ").unwrap();
            match &found {
                Some(r) => {
                    let p = &r.payload;
                    let hex: String = p.bytes.iter().map(|b| format!("{b:02x}")).collect();
                    let hex = if hex.is_empty() { "-".to_string() } else { hex };
                    write!(
                        out,
                        "{hex} v{} {} m{} c{} {} {} {} {} {} {}",
                        p.version,
                        p.ecc.letter(),
                        p.mask,
                        p.corrected,
                        r.mirrored,
                        r.inverted,
                        point(Some(r.location.top_left)),
                        point(Some(r.location.top_right)),
                        point(Some(r.location.bottom_left)),
                        point(r.location.alignment)
                    )
                    .unwrap();
                }
                None => out.push_str("- vnull null mnull cnull null null - - - -"),
            }
            writeln!(out, " w {} {} {} {} {} {} {} {}", work.steps, work.compared, work.scanned, work.maps, work.second, work.meshes, work.probed, work.reduced).unwrap();
        }
    }
    print!("{out}");
}
