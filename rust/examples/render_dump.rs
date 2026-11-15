//! Renders every encoder vector with five option sets and prints one line each
//! for comparison with `bench/render-dump.mjs`:
//! `<vector id> <option set name> <SHA-256 of the UTF-8 output>`.
//!
//!     render_dump [path to encode-vectors.json]
//!
//! The option sets: `svg-default`; `svg-plain` (margin 0, dark `#123`, no
//! background); `svg-title` (a title that needs escaping); `term-default`;
//! `term-margin1-dark` (margin 1, ink dark).
//!
//! The title is the JavaScript string `'a <b> & "c" \u0001 \ud800'`. A Rust
//! string cannot hold the lone surrogate, so it is built from the same UTF-16
//! units with `String::from_utf16_lossy`, which gives U+FFFD, the character
//! the TypeScript renderer replaces a lone surrogate with.

use forgesworn_qr::encode::{encode, Options};
use forgesworn_qr::render::{to_svg, to_terminal, Ink, SvgOptions, TerminalOptions};
use forgesworn_qr::symbol::Ecc;
use sha2::{Digest, Sha256};
use std::fmt::Write;

fn main() {
    let path = std::env::args().nth(1).unwrap_or_else(|| concat!(env!("CARGO_MANIFEST_DIR"), "/../vectors/encode-vectors.json").to_string());
    let pack: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(&path).expect("vectors file")).expect("valid JSON");
    let units: Vec<u16> = "a <b> & \"c\" \u{1} ".encode_utf16().chain([0xd800]).collect();
    let title = String::from_utf16_lossy(&units);
    let mut out = String::new();
    for v in pack["vectors"].as_array().expect("vectors") {
        let id = v["id"].as_str().unwrap();
        let ecc = match v["ecc"].as_str().unwrap() {
            "L" => Ecc::L,
            "M" => Ecc::M,
            "Q" => Ecc::Q,
            _ => Ecc::H,
        };
        let options = Options {
            ecc,
            version: v["requestedVersion"].as_u64().map(|n| n as usize),
            min_version: None,
            mask: v["requestedMask"].as_u64().map(|n| n as usize),
            mode: None,
            eci: v["eci"].as_bool().unwrap(),
        };
        let qr = encode(v["text"].as_str().unwrap(), &options).expect("vector encodes");
        let outputs = [
            ("svg-default", to_svg(&qr, &SvgOptions::default())),
            ("svg-plain", to_svg(&qr, &SvgOptions { margin: 0, dark: "#123".into(), light: None, title: String::new() })),
            ("svg-title", to_svg(&qr, &SvgOptions { title: title.clone(), ..SvgOptions::default() })),
            ("term-default", to_terminal(&qr, &TerminalOptions::default())),
            ("term-margin1-dark", to_terminal(&qr, &TerminalOptions { margin: 1, ink: Ink::Dark })),
        ];
        for (name, text) in outputs {
            let digest = Sha256::digest(text.as_bytes());
            let _ = write!(out, "{id} {name} ");
            for b in digest {
                let _ = write!(out, "{b:02x}");
            }
            out.push('\n');
        }
    }
    print!("{out}");
}
