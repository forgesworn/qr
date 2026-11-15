//! The encoder against `vectors/encode-vectors.json`, its own round trip
//! through the decoder, bad input, capacity edges, a brute-force check of the
//! segment choice, and the renderers' escaping.

use forgesworn_qr::encode::{encode, is_dark, Error, Mode, Options, QrCode, Segment};
use forgesworn_qr::render::{to_svg, to_terminal, Ink, SvgOptions, TerminalOptions};
use forgesworn_qr::symbol::{decode_modules, Ecc};
use serde_json::Value;
use std::path::PathBuf;

fn vectors() -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../vectors/encode-vectors.json");
    serde_json::from_str(&std::fs::read_to_string(path).expect("encode-vectors.json")).expect("valid JSON")
}

fn ecc_of(letter: &str) -> Ecc {
    match letter {
        "L" => Ecc::L,
        "M" => Ecc::M,
        "Q" => Ecc::Q,
        "H" => Ecc::H,
        other => panic!("level {other}"),
    }
}

fn mode_of(name: &str) -> Mode {
    Mode::ALL.into_iter().find(|m| m.name() == name).unwrap_or_else(|| panic!("mode {name}"))
}

/// The module rows of a code as the vectors write them: hex, most significant bit first, padded to bytes.
fn rows(qr: &QrCode) -> Vec<String> {
    (0..qr.size)
        .map(|y| {
            let mut out = String::new();
            for byte in 0..qr.size.div_ceil(8) {
                let mut b = 0u8;
                for bit in 0..8 {
                    let x = byte * 8 + bit;
                    b = (b << 1) | (x < qr.size && qr.modules[y * qr.size + x] == 1) as u8;
                }
                out.push_str(&format!("{b:02x}"));
            }
            out
        })
        .collect()
}

fn options_of(v: &Value) -> Options {
    Options {
        ecc: ecc_of(v["ecc"].as_str().unwrap()),
        version: v["requestedVersion"].as_u64().map(|n| n as usize),
        min_version: None,
        mask: v["requestedMask"].as_u64().map(|n| n as usize),
        mode: None,
        eci: v["eci"].as_bool().unwrap(),
    }
}

#[test]
fn every_encoder_vector_matches() {
    let pack = vectors();
    let cases = pack["vectors"].as_array().unwrap();
    assert_eq!(cases.len(), 148);
    let mut matched = 0;
    let mut round_trips = 0;
    for v in cases {
        let id = v["id"].as_str().unwrap();
        let text = v["text"].as_str().unwrap();
        let qr = encode(text, &options_of(v)).unwrap_or_else(|e| panic!("{id}: {e}"));
        assert_eq!(qr.version as u64, v["version"].as_u64().unwrap(), "{id}: version");
        assert_eq!(qr.mask as u64, v["mask"].as_u64().unwrap(), "{id}: mask");
        assert_eq!(qr.mode.name(), v["mode"].as_str().unwrap(), "{id}: mode");
        let segments: Vec<Segment> = v["segments"]
            .as_array()
            .unwrap()
            .iter()
            .map(|s| Segment { mode: mode_of(s["mode"].as_str().unwrap()), count: s["count"].as_u64().unwrap() as usize })
            .collect();
        assert_eq!(qr.segments, segments, "{id}: segments");
        assert_eq!(qr.size as u64, v["size"].as_u64().unwrap(), "{id}: size");
        assert_eq!(qr.bits as u64, v["bits"].as_u64().unwrap(), "{id}: bits before the terminator");
        let want: Vec<String> = v["rows"].as_array().unwrap().iter().map(|r| r.as_str().unwrap().to_string()).collect();
        assert_eq!(rows(&qr), want, "{id}: rows");
        assert_eq!(qr.ecc, ecc_of(v["ecc"].as_str().unwrap()), "{id}: level");
        matched += 1;

        let decoded = decode_modules(&qr.modules, qr.size).unwrap_or_else(|| panic!("{id}: the encoder's own symbol does not read"));
        assert_eq!(decoded.payload.bytes, text.as_bytes(), "{id}: round trip");
        assert!(!decoded.mirrored, "{id}: read mirrored");
        assert_eq!((decoded.payload.version, decoded.payload.ecc, decoded.payload.mask), (qr.version, qr.ecc, qr.mask), "{id}");
        round_trips += 1;
    }
    eprintln!("encoder vectors: {matched} of {} matched module for module (version, mask, mode, segments, bits, rows)", cases.len());
    eprintln!("round trips: {round_trips} of {} read back to the text's bytes", cases.len());
}

#[test]
fn bad_options_have_their_own_variants() {
    let text = "HELLO";
    let with = |f: &dyn Fn(&mut Options)| {
        let mut o = Options::default();
        f(&mut o);
        encode(text, &o)
    };
    assert_eq!(with(&|o| o.version = Some(0)).unwrap_err(), Error::InvalidVersion(0));
    assert_eq!(with(&|o| o.version = Some(41)).unwrap_err(), Error::InvalidVersion(41));
    assert_eq!(with(&|o| o.min_version = Some(0)).unwrap_err(), Error::InvalidMinVersion(0));
    assert_eq!(with(&|o| o.min_version = Some(41)).unwrap_err(), Error::InvalidMinVersion(41));
    assert_eq!(with(&|o| o.mask = Some(8)).unwrap_err(), Error::InvalidMask(8));
    assert_eq!(with(&|o| o.mask = Some(usize::MAX)).unwrap_err(), Error::InvalidMask(usize::MAX));
    assert_eq!(
        with(&|o| {
            o.version = Some(3);
            o.min_version = Some(4);
        })
        .unwrap_err(),
        Error::VersionBelowMinimum { version: 3, min_version: 4 }
    );
    assert_eq!(encode(&[1u8, 2, 3], &Options { mode: Some(Mode::Numeric), ..Options::default() }).unwrap_err(), Error::BytesNeedByteMode(Mode::Numeric));
    assert_eq!(
        encode("12a", &Options { mode: Some(Mode::Numeric), ..Options::default() }).unwrap_err(),
        Error::NotInMode { mode: Mode::Numeric, found: 'a' }
    );
    assert_eq!(
        encode("AB c", &Options { mode: Some(Mode::Alphanumeric), ..Options::default() }).unwrap_err(),
        Error::NotInMode { mode: Mode::Alphanumeric, found: 'c' }
    );
    // Bad options are never capacity errors, and the reverse.
    assert!(!Error::InvalidVersion(0).is_capacity());
    assert!(Error::Capacity { ecc: Ecc::M, version: None }.is_capacity());
    // A good call with every option named works.
    let ok = encode(text, &Options { ecc: Ecc::Q, version: Some(5), min_version: Some(2), mask: Some(3), mode: Some(Mode::Alphanumeric), eci: true });
    let qr = ok.unwrap();
    assert_eq!((qr.version, qr.mask, qr.ecc, qr.mode), (5, 3, Ecc::Q, Mode::Alphanumeric));
}

#[test]
fn data_too_large_is_a_capacity_error() {
    let big = vec![b'a'; 3000];
    for ecc in Ecc::ORDER {
        let o = Options { ecc, ..Options::default() };
        assert_eq!(encode(&big, &o).unwrap_err(), Error::Capacity { ecc, version: None }, "{ecc:?}");
    }
    // 2,953 bytes is the most at level L; one more is too many.
    let o = Options { ecc: Ecc::L, ..Options::default() };
    assert!(encode(&vec![0u8; 2954], &o).unwrap_err().is_capacity());
    // A fixed version that cannot hold the data is an error, never an upgrade.
    let err = encode("this is longer than version one at level h holds", &Options { ecc: Ecc::H, version: Some(1), ..Options::default() }).unwrap_err();
    assert_eq!(err, Error::Capacity { ecc: Ecc::H, version: Some(1) });
    // The length check comes before the content check for a named mode.
    let long = "é".repeat(8000);
    let err = encode(&long, &Options { mode: Some(Mode::Numeric), ..Options::default() }).unwrap_err();
    assert!(err.is_capacity(), "{err:?}");
    // Text and digits far past any version are refused as capacity errors too.
    assert!(encode(&"7".repeat(100_000), &Options::default()).unwrap_err().is_capacity());
    assert!(encode(&"é".repeat(100_000), &Options::default()).unwrap_err().is_capacity());
}

/// The largest `n` for which `make(n)` encodes at version 40, searching down from `bound`.
fn largest(make: impl Fn(usize) -> Data, bound: usize, ecc: Ecc, mode: Option<Mode>) -> usize {
    let o = Options { ecc, version: Some(40), mask: Some(0), mode, ..Options::default() };
    let mut n = bound;
    loop {
        match encode_data(make(n), &o) {
            Ok(_) => break,
            Err(e) => {
                assert!(e.is_capacity(), "{e:?}");
                n -= 1;
            }
        }
    }
    assert!(encode_data(make(n + 1), &o).unwrap_err().is_capacity(), "{} fits too", n + 1);
    n
}

enum Data {
    Bytes(Vec<u8>),
    Text(String),
}

fn encode_data(d: Data, o: &Options) -> Result<QrCode, Error> {
    match d {
        Data::Bytes(b) => encode(&b, o),
        Data::Text(t) => encode(&t, o),
    }
}

#[test]
fn the_largest_payload_at_version_40_encodes_at_every_level() {
    // Data codewords at version 40: L 2956, M 2334, Q 1666, H 1276.
    let codewords = [(Ecc::L, 2956usize), (Ecc::M, 2334), (Ecc::Q, 1666), (Ecc::H, 1276)];
    for (ecc, cw) in codewords {
        let available = cw * 8 - 4;
        let bytes = largest(|n| Data::Bytes(vec![0x5a; n]), (available - 16) / 8, ecc, None);
        assert_eq!(bytes, (available - 16) / 8, "bytes at {ecc:?}");
        let digits = largest(|n| Data::Text("7".repeat(n)), (available - 14) * 3 / 10, ecc, Some(Mode::Numeric));
        assert_eq!(digits, (available - 14) * 3 / 10, "digits at {ecc:?}");
        let alnum = largest(|n| Data::Text("A".repeat(n)), (available - 13) * 2 / 11, ecc, Some(Mode::Alphanumeric));
        let mixed = largest(|n| Data::Text("a".repeat(n)), (available - 8) * 3 / 10, ecc, None);
        eprintln!("version 40 at {ecc:?}: {bytes} bytes, {digits} digits, {alnum} alphanumeric, {mixed} unrestricted ASCII");
        // The same sizes encode at the automatic version and mask and read back.
        let auto = Options { ecc, ..Options::default() };
        let qr = encode(&vec![0x5au8; bytes], &auto).unwrap();
        assert_eq!(qr.version, 40);
        let read = decode_modules(&qr.modules, qr.size).expect("reads");
        assert_eq!(read.payload.bytes.len(), bytes);
    }
    // The figures SPEC.md gives for level L.
    assert_eq!(largest(|n| Data::Bytes(vec![0; n]), 2953, Ecc::L, None), 2953);
    assert_eq!(largest(|n| Data::Text("1".repeat(n)), 7089, Ecc::L, Some(Mode::Numeric)), 7089);
    assert_eq!(largest(|n| Data::Text("A".repeat(n)), 4296, Ecc::L, Some(Mode::Alphanumeric)), 4296);
}

#[test]
fn bytes_are_one_byte_segment_and_empty_text_is_too() {
    let qr = encode(&[0u8, 255, 7], &Options::default()).unwrap();
    assert_eq!(qr.segments, vec![Segment { mode: Mode::Byte, count: 3 }]);
    let qr = encode("", &Options::default()).unwrap();
    assert_eq!(qr.segments, vec![Segment { mode: Mode::Byte, count: 0 }]);
    assert_eq!(qr.version, 1);
    let qr = encode(&Vec::<u8>::new(), &Options { eci: true, ..Options::default() }).unwrap();
    assert_eq!(qr.bits, 12 + 4 + 8);
}

#[test]
fn is_dark_is_false_outside() {
    let qr = encode("x", &Options::default()).unwrap();
    for (x, y) in [(-1, 0), (0, -1), (21, 0), (0, 21), (i64::MIN, 3), (3, i64::MAX)] {
        assert!(!is_dark(&qr, x, y));
        assert!(!qr.is_dark(x, y));
    }
    assert!(is_dark(&qr, 0, 0));
    assert!(!is_dark(&qr, 7, 0));
    assert!(is_dark(&qr, 8, 21 - 8), "the dark module");
}

/// A small deterministic generator (the repository's: `s * 1664525 + 1013904223 mod 2^32`).
struct Lcg(u32);
impl Lcg {
    fn next(&mut self) -> u32 {
        self.0 = self.0.wrapping_mul(1664525).wrapping_add(1013904223);
        self.0 >> 8
    }
    fn below(&mut self, n: u32) -> u32 {
        self.next() % n
    }
}

#[test]
fn random_input_never_panics_and_reads_back() {
    let mut rng = Lcg(12345);
    let alphabet: Vec<char> = "0123456789ABCXYZ $%*+-./:abcxyz!?\u{e9}\u{20ac}\u{1f600}\n".chars().collect();
    let mut ok = 0;
    for case in 0..400 {
        let len = rng.below(120) as usize;
        let text: String = (0..len).map(|_| alphabet[rng.below(alphabet.len() as u32) as usize]).collect();
        let o = Options {
            ecc: Ecc::ORDER[rng.below(4) as usize],
            version: (rng.below(3) == 0).then(|| 1 + rng.below(40) as usize),
            min_version: (rng.below(3) == 0).then(|| 1 + rng.below(20) as usize),
            mask: (rng.below(2) == 0).then(|| rng.below(8) as usize),
            mode: None,
            eci: rng.below(2) == 0,
        };
        match encode(text.as_str(), &o) {
            Ok(qr) => {
                let read = decode_modules(&qr.modules, qr.size).unwrap_or_else(|| panic!("case {case}: {text:?} does not read back"));
                assert_eq!(read.payload.bytes, text.as_bytes(), "case {case}");
                ok += 1;
            }
            Err(e) => assert!(matches!(e, Error::Capacity { .. } | Error::VersionBelowMinimum { .. }), "case {case}: {e:?}"),
        }
    }
    assert!(ok > 150, "{ok}");
    // Arbitrary bytes and every option out of range, none of which may panic.
    for _ in 0..200 {
        let len = rng.below(300) as usize;
        let bytes: Vec<u8> = (0..len).map(|_| rng.below(256) as u8).collect();
        let o = Options { ecc: Ecc::ORDER[rng.below(4) as usize], version: Some(rng.below(60) as usize), min_version: Some(rng.below(60) as usize), mask: Some(rng.below(12) as usize), mode: None, eci: true };
        let _ = encode(&bytes, &o);
    }
}

/// The segment choice by brute force from SPEC.md's rule: the fewest bits,
/// then the fewest segments, then the earliest mode per character in the
/// order numeric, alphanumeric, byte.
fn brute(text: &[char], band: usize) -> Vec<Segment> {
    let kind = |c: char| if c.is_ascii_digit() { 0 } else if c.is_ascii() && "ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:".contains(c) { 1 } else { 2 };
    let count_bits = [[10, 12, 14], [9, 11, 13], [8, 16, 16]];
    let n = text.len();
    let mut best: Option<(usize, usize, Vec<usize>)> = None;
    let total = 3usize.pow(n as u32);
    'assign: for code in 0..total {
        let mut modes = Vec::with_capacity(n);
        let mut rest = code;
        for &c in text {
            let m = rest % 3;
            rest /= 3;
            if m < kind(c) {
                continue 'assign;
            }
            modes.push(m);
        }
        let (bits, segs) = cost(text, &modes, band, &count_bits);
        let better = match &best {
            None => true,
            Some((b, s, ms)) => (bits, segs, &modes) < (*b, *s, ms),
        };
        if better {
            best = Some((bits, segs, modes));
        }
    }
    segments_of(text, &best.unwrap().2)
}

fn cost(text: &[char], modes: &[usize], band: usize, count_bits: &[[usize; 3]; 3]) -> (usize, usize) {
    let segs = segments_of(text, modes);
    let mut bits = 0;
    for s in &segs {
        let m = s.mode as usize;
        bits += 4 + count_bits[m][band];
        bits += match s.mode {
            Mode::Numeric => 10 * (s.count / 3) + [0, 4, 7][s.count % 3],
            Mode::Alphanumeric => 11 * (s.count / 2) + 6 * (s.count % 2),
            Mode::Byte => 8 * s.count,
        };
    }
    (bits, segs.len())
}

fn segments_of(text: &[char], modes: &[usize]) -> Vec<Segment> {
    let mut out: Vec<Segment> = Vec::new();
    for (i, &m) in modes.iter().enumerate() {
        let units = if m == 2 { text[i].len_utf8() } else { 1 };
        match out.last_mut() {
            Some(last) if last.mode as usize == m => last.count += units,
            _ => out.push(Segment { mode: Mode::ALL[m], count: units }),
        }
    }
    out
}

#[test]
fn segment_choice_equals_the_rule_by_brute_force() {
    // 5 digit, A alphanumeric, a byte, an e-acute of two bytes.
    let alphabet = ['5', 'A', 'a', '\u{e9}'];
    let mut checked = 0;
    // (fixed version, band, longest text): the bands differ in their count fields.
    for (version, band, longest) in [(1usize, 0usize, 7usize), (10, 1, 5), (27, 2, 5)] {
        let mut stack: Vec<Vec<char>> = vec![Vec::new()];
        while let Some(text) = stack.pop() {
            if !text.is_empty() {
                let s: String = text.iter().collect();
                let qr = encode(s.as_str(), &Options { ecc: Ecc::L, version: Some(version), mask: Some(0), ..Options::default() }).unwrap();
                assert_eq!(qr.segments, brute(&text, band), "{s:?} at version {version}");
                checked += 1;
            }
            if text.len() < longest {
                for &c in &alphabet {
                    let mut next = text.clone();
                    next.push(c);
                    stack.push(next);
                }
            }
        }
    }
    eprintln!("segment choice: {checked} strings agree with the brute-force rule");
}

#[test]
fn spec_examples_of_segmentation() {
    let seg = |s: &str, version| encode(s, &Options { version: Some(version), mask: Some(0), ..Options::default() }).unwrap().segments;
    // `abc123` is one byte segment at versions 1-9.
    assert_eq!(seg("abc123", 1), vec![Segment { mode: Mode::Byte, count: 6 }]);
    // Six digits between byte characters split off at versions 1-9 only.
    assert_eq!(seg("a123456a", 1).len(), 3);
    assert_eq!(seg("a123456a", 10).len(), 1);
}

#[test]
fn svg_escaping() {
    let qr = encode("1", &Options::default()).unwrap();
    // The title: markup, quotes, an apostrophe, a control character, and the replacement character
    // a lone surrogate becomes (a Rust string cannot hold one itself).
    let title = String::from_utf16_lossy(&"a <b> & \"c\" ' \u{1} \u{9} \u{FFFE}".encode_utf16().chain([0xd800u16]).collect::<Vec<_>>());
    let svg = to_svg(&qr, &SvgOptions { title, ..SvgOptions::default() });
    assert!(svg.contains("<title>a &#60;b&#62; &#38; &#34;c&#34; &#39; \u{FFFD} \u{9} \u{FFFD}\u{FFFD}</title>"), "{svg}");
    assert!(svg.contains(" role=\"img\""));
    let plain = to_svg(&qr, &SvgOptions { margin: 0, dark: "#123".into(), light: None, title: String::new() });
    assert!(plain.starts_with("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 21 21\" shape-rendering=\"crispEdges\"><path fill=\"#123\" d=\"M0 0h7v1h-7z"));
    assert!(!plain.contains("<rect") && !plain.contains("<title>") && !plain.contains("role="));
    let attr = to_svg(&qr, &SvgOptions { dark: "red\"/><x".into(), ..SvgOptions::default() });
    assert!(attr.contains("fill=\"red&#34;/&#62;&#60;x\""));
}

#[test]
fn terminal_shape() {
    let qr = encode("1", &Options::default()).unwrap();
    let t = to_terminal(&qr, &TerminalOptions::default());
    let lines: Vec<&str> = t.split('\n').collect();
    // Side 29, so 15 lines of 29 characters, the last line's lower half blank.
    assert_eq!(lines.len(), 15);
    assert!(lines.iter().all(|l| l.chars().count() == 29));
    assert!(!t.ends_with('\n'));
    // Four rows of quiet zone are light: in ink light they are full blocks.
    assert!(lines[0].chars().all(|c| c == '\u{2588}'));
    let dark = to_terminal(&qr, &TerminalOptions { margin: 0, ink: Ink::Dark });
    assert_eq!(dark.split('\n').count(), 11);
}
