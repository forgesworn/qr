#![cfg(feature = "optimal")]
use forgesworn_qr::{encode as reference, symbol};
use forgesworn_qr_embedded::{
    encode_bytes, encode_text, Ecc, Error, Options, Symbol, TextPlanner, Workspace, MODULE_BYTES,
};
use serde_json::Value;

fn reference_ecc(ecc: Ecc) -> symbol::Ecc {
    match ecc {
        Ecc::L => symbol::Ecc::L,
        Ecc::M => symbol::Ecc::M,
        Ecc::Q => symbol::Ecc::Q,
        Ecc::H => symbol::Ecc::H,
    }
}

fn reference_options(o: &Options) -> reference::Options {
    reference::Options {
        ecc: reference_ecc(o.ecc),
        version: o.version.map(usize::from),
        min_version: Some(o.min_version as usize),
        mask: o.mask.map(usize::from),
        eci: o.eci,
        mode: None,
    }
}

fn modules(code: &Symbol<'_>) -> Vec<u8> {
    (0..code.size())
        .flat_map(|y| (0..code.size()).map(move |x| code.is_dark(x, y) as u8))
        .collect()
}

fn same(code: &Symbol<'_>, want: &reference::QrCode) {
    assert_eq!(code.version() as usize, want.version);
    assert_eq!(reference_ecc(code.ecc()), want.ecc);
    assert_eq!(code.mask(), want.mask);
    assert_eq!(code.bits(), want.bits);
    assert_eq!(modules(code), want.modules);
    assert!(!code.is_dark(usize::MAX, 0));
    assert!(!code.is_dark(0, usize::MAX));
}

#[test]
fn existing_zxing_vectors_within_the_version_ceiling() {
    let pack: Value =
        serde_json::from_str(include_str!("../../../vectors/encode-vectors.json")).unwrap();
    let mut count = 0;
    let mut w = Workspace::new();
    let mut planner = TextPlanner::new();
    let mut output = [0; MODULE_BYTES];
    for v in pack["vectors"].as_array().unwrap() {
        if v["version"].as_u64().unwrap() > 8 {
            continue;
        }
        let ecc = match v["ecc"].as_str().unwrap() {
            "L" => Ecc::L,
            "M" => Ecc::M,
            "Q" => Ecc::Q,
            _ => Ecc::H,
        };
        let o = Options {
            ecc,
            version: v["requestedVersion"].as_u64().map(|n| n as u8),
            mask: v["requestedMask"].as_u64().map(|n| n as u8),
            eci: v["eci"].as_bool().unwrap(),
            ..Options::default()
        };
        let text = v["text"].as_str().unwrap();
        let code = encode_text(text, &o, &mut planner, &mut w, &mut output).unwrap();
        assert_eq!(
            code.version() as u64,
            v["version"].as_u64().unwrap(),
            "{}",
            v["id"]
        );
        assert_eq!(
            code.mask() as u64,
            v["mask"].as_u64().unwrap(),
            "{}",
            v["id"]
        );
        assert_eq!(
            code.bits() as u64,
            v["bits"].as_u64().unwrap(),
            "{}",
            v["id"]
        );
        for (y, row) in v["rows"].as_array().unwrap().iter().enumerate() {
            let row = row.as_str().unwrap();
            for x in 0..code.size() {
                let byte = u8::from_str_radix(&row[x / 8 * 2..x / 8 * 2 + 2], 16).unwrap();
                assert_eq!(
                    code.is_dark(x, y),
                    (byte >> (7 - x % 8)) & 1 != 0,
                    "{} at {x},{y}",
                    v["id"]
                );
            }
        }
        let found = symbol::decode_modules(&modules(&code), code.size()).unwrap();
        assert_eq!(found.payload.bytes, text.as_bytes());
        count += 1;
    }
    assert_eq!(
        count, 82,
        "update the documented coverage when the shared vector pack changes"
    );
    eprintln!("ZXing vectors within versions 1–8: {count} exact matrices and round trips");
}

#[test]
fn every_version_level_mask_and_input_kind_matches() {
    let mut w = Workspace::new();
    let mut planner = TextPlanner::new();
    let mut output = [0; MODULE_BYTES];
    for version in 1..=8 {
        for ecc in [Ecc::L, Ecc::M, Ecc::Q, Ecc::H] {
            for mask in 0..=8 {
                let o = Options {
                    version: Some(version),
                    ecc,
                    mask: (mask < 8).then_some(mask),
                    ..Options::default()
                };
                for text in ["", "123456789", "HELLO", "a123456789012b", "é雪🦀"] {
                    let want = reference::encode(text, &reference_options(&o));
                    let got = encode_text(text, &o, &mut planner, &mut w, &mut output);
                    match (got, want) {
                        (Ok(code), Ok(want)) => same(&code, &want),
                        (Err(Error::Capacity), Err(error)) if error.is_capacity() => {}
                        _ => panic!("mismatch: {text}, {o:?}"),
                    }
                }
                let bytes = [0x00, 0xff, 0x80, 0x41, 0x7f];
                let want = reference::encode(bytes.as_slice(), &reference_options(&o)).unwrap();
                let code = encode_bytes(&bytes, &o, &mut w, &mut output).unwrap();
                same(&code, &want);
            }
        }
    }
}

#[test]
fn deterministic_mixed_unicode_and_binary_payloads_match() {
    let mut w = Workspace::new();
    let mut planner = TextPlanner::new();
    let mut output = [0; MODULE_BYTES];
    let mut seed = 0x12345678u32;
    for case in 0..180 {
        let mut text = String::new();
        let mut bytes = Vec::new();
        for _ in 0..case {
            seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
            bytes.push((seed >> 24) as u8);
            text.push(['0', '7', 'A', '/', 'a', 'é', '雪', '🦀'][(seed >> 28) as usize % 8]);
        }
        let o = Options {
            ecc: [Ecc::L, Ecc::M, Ecc::Q, Ecc::H][case % 4],
            eci: case % 2 == 0,
            ..Options::default()
        };
        for (input, is_text) in [(text.as_bytes(), true), (bytes.as_slice(), false)] {
            let want = if is_text {
                reference::encode(text.as_str(), &reference_options(&o))
            } else {
                reference::encode(input, &reference_options(&o))
            };
            let got = if is_text {
                encode_text(&text, &o, &mut planner, &mut w, &mut output)
            } else {
                encode_bytes(input, &o, &mut w, &mut output)
            };
            match (got, want) {
                (Ok(code), Ok(want)) => same(&code, &want),
                (Err(Error::Capacity), Ok(want)) => assert!(want.version > 8),
                (Err(Error::Capacity), Err(error)) => assert!(error.is_capacity()),
                _ => panic!("mismatch at case {case}, text={is_text}"),
            }
        }
    }
}

#[test]
fn capacity_edges_ranges_and_eci() {
    let mut w = Workspace::new();
    let mut planner = TextPlanner::new();
    let mut output = [0; MODULE_BYTES];
    let o = Options {
        ecc: Ecc::L,
        ..Options::default()
    };
    let digits = "7".repeat(461);
    assert_eq!(
        encode_text(&digits, &o, &mut planner, &mut w, &mut output)
            .unwrap()
            .version(),
        8
    );
    assert_eq!(
        encode_text(&(digits + "7"), &o, &mut planner, &mut w, &mut output).err(),
        Some(Error::Capacity)
    );
    assert_eq!(
        encode_bytes(&[0xab; 192], &o, &mut w, &mut output)
            .unwrap()
            .version(),
        8
    );
    assert_eq!(
        encode_bytes(&[0xab; 193], &o, &mut w, &mut output).err(),
        Some(Error::Capacity)
    );
    assert_eq!(
        encode_bytes(
            &[0xab; 192],
            &Options { eci: true, ..o },
            &mut w,
            &mut output
        )
        .err(),
        Some(Error::Capacity)
    );
    assert_eq!(
        encode_bytes(
            &[0xab; 32],
            &Options {
                version: Some(2),
                ..o
            },
            &mut w,
            &mut output
        )
        .unwrap()
        .size(),
        25
    );
    for eci in [false, true] {
        let o = Options {
            min_version: 5,
            max_version: 6,
            eci,
            ..o
        };
        for text in [
            "",
            "123",
            "abc123",
            "ORDER/20261115000123",
            "é123456789012雪",
        ] {
            same(
                &encode_text(text, &o, &mut planner, &mut w, &mut output).unwrap(),
                &reference::encode(text, &reference_options(&o)).unwrap(),
            );
        }
    }
    let bad = [
        Options {
            min_version: 0,
            ..o
        },
        Options {
            max_version: 9,
            ..o
        },
        Options {
            min_version: 4,
            max_version: 3,
            ..o
        },
        Options {
            version: Some(0),
            ..o
        },
        Options {
            version: Some(9),
            ..o
        },
        Options {
            version: Some(2),
            min_version: 3,
            ..o
        },
    ];
    for o in bad {
        assert_eq!(
            encode_text("x", &o, &mut planner, &mut w, &mut output).err(),
            Some(Error::InvalidVersionRange)
        );
    }
    assert_eq!(
        encode_text(
            "x",
            &Options { mask: Some(8), ..o },
            &mut planner,
            &mut w,
            &mut output
        )
        .err(),
        Some(Error::InvalidMask)
    );
    assert_eq!(
        encode_text("x", &o, &mut planner, &mut w, &mut [0; MODULE_BYTES - 1]).err(),
        Some(Error::OutputTooSmall)
    );
    assert_eq!(
        encode_bytes(
            &[0; 32],
            &Options {
                max_version: 1,
                ..o
            },
            &mut w,
            &mut output
        )
        .err(),
        Some(Error::Capacity)
    );
}

#[test]
fn symbol_drop_and_every_error_clear_the_entire_output() {
    let mut w = Workspace::new();
    let mut output = [0x55; MODULE_BYTES + 9];
    {
        let _code = encode_bytes(&[0xab; 32], &Options::default(), &mut w, &mut output).unwrap();
    }
    assert!(output.iter().all(|&b| b == 0));
    for o in [
        Options {
            max_version: 9,
            ..Options::default()
        },
        Options {
            mask: Some(9),
            ..Options::default()
        },
        Options::default(),
    ] {
        output.fill(0x55);
        assert!(encode_bytes(&[0xab; 300], &o, &mut w, &mut output).is_err());
        assert!(output.iter().all(|&b| b == 0));
    }
    let mut small = [0x55; 4];
    assert!(encode_bytes(&[], &Options::default(), &mut w, &mut small).is_err());
    assert_eq!(small, [0; 4]);
}

#[test]
fn capacity_boundaries_match_for_every_version_and_level() {
    let mut w = Workspace::new();
    let mut planner = TextPlanner::new();
    let mut output = [0; MODULE_BYTES];
    for version in 1..=8 {
        for ecc in [Ecc::L, Ecc::M, Ecc::Q, Ecc::H] {
            for eci in [false, true] {
                let o = Options {
                    version: Some(version),
                    ecc,
                    eci,
                    ..Options::default()
                };
                // Find each capacity through the existing encoder's public API.
                for character in ['7', 'A', 'a', 'é'] {
                    let (mut fits, mut fails) = (0, 462);
                    while fits + 1 < fails {
                        let middle = (fits + fails) / 2;
                        let text = character.to_string().repeat(middle);
                        if reference::encode(text.as_str(), &reference_options(&o)).is_ok() {
                            fits = middle;
                        } else {
                            fails = middle;
                        }
                    }
                    for count in [fits.saturating_sub(1), fits, fails] {
                        let text = character.to_string().repeat(count);
                        let want = reference::encode(text.as_str(), &reference_options(&o));
                        let got = encode_text(&text, &o, &mut planner, &mut w, &mut output);
                        match (got, want) {
                            (Ok(code), Ok(want)) => same(&code, &want),
                            (Err(Error::Capacity), Err(error)) if error.is_capacity() => {}
                            _ => panic!("capacity mismatch: {o:?}, {character}, {count}"),
                        }
                    }
                }
            }
        }
    }
}
