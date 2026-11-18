use forgesworn_qr::{encode as reference, symbol};
use forgesworn_qr_embedded::{
    encode_bytes, encode_simple_text, Ecc, Error, Options, Workspace, MODULE_BYTES,
};

#[test]
fn bundled_standard_tables_match_the_main_encoder() {
    assert_eq!(
        include_str!("../src/tables.rs"),
        include_str!("../../src/tables.rs")
    );
}

#[test]
fn compact_storage_is_independent_of_the_optional_planner() {
    assert_eq!(core::mem::size_of::<Workspace>(), 242);
    assert_eq!(core::mem::size_of::<Workspace>() + MODULE_BYTES, 543);
    #[cfg(feature = "optimal")]
    assert_eq!(
        core::mem::size_of::<forgesworn_qr_embedded::TextPlanner>(),
        520
    );
}

#[test]
fn compact_text_matches_explicit_single_mode_and_binary_matches_bytes() {
    let mut w = Workspace::new();
    let mut output = [0; MODULE_BYTES];
    for version in 1..=8 {
        for (ecc, reference_ecc) in [
            (Ecc::L, symbol::Ecc::L),
            (Ecc::M, symbol::Ecc::M),
            (Ecc::Q, symbol::Ecc::Q),
            (Ecc::H, symbol::Ecc::H),
        ] {
            for mask in 0..=8 {
                for eci in [false, true] {
                    let o = Options {
                        ecc,
                        version: Some(version),
                        mask: (mask < 8).then_some(mask),
                        eci,
                        ..Options::default()
                    };
                    for text in ["", "123456789", "HELLO123", "a123456789012b", "é雪🦀"] {
                        let mode = if !text.is_empty() && text.bytes().all(|b| b.is_ascii_digit()) {
                            reference::Mode::Numeric
                        } else if !text.is_empty()
                            && text.bytes().all(|b| {
                                b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:".contains(&b)
                            })
                        {
                            reference::Mode::Alphanumeric
                        } else {
                            reference::Mode::Byte
                        };
                        let ro = reference::Options {
                            ecc: reference_ecc,
                            version: Some(version as usize),
                            mask: o.mask.map(usize::from),
                            mode: Some(mode),
                            eci,
                            ..reference::Options::default()
                        };
                        let want = reference::encode(text, &ro);
                        let got = encode_simple_text(text, &o, &mut w, &mut output);
                        match (got, want) {
                            (Ok(code), Ok(want)) => {
                                assert_eq!(code.mask(), want.mask);
                                assert_eq!(code.bits(), want.bits);
                                let modules: Vec<_> = (0..code.size())
                                    .flat_map(|y| (0..code.size()).map(move |x| (x, y)))
                                    .map(|(x, y)| code.is_dark(x, y) as u8)
                                    .collect();
                                assert_eq!(modules, want.modules);
                                assert_eq!(
                                    symbol::decode_modules(&modules, code.size())
                                        .unwrap()
                                        .payload
                                        .bytes,
                                    text.as_bytes()
                                );
                            }
                            (Err(Error::Capacity), Err(error)) if error.is_capacity() => {}
                            _ => panic!("single-mode mismatch: {text}, {o:?}"),
                        }
                    }
                    let bytes = [0, 0xff, 0x80, b'7'];
                    let ro = reference::Options {
                        ecc: reference_ecc,
                        version: Some(version as usize),
                        mask: o.mask.map(usize::from),
                        eci,
                        ..reference::Options::default()
                    };
                    let want = reference::encode(bytes.as_slice(), &ro).unwrap();
                    let code = encode_bytes(&bytes, &o, &mut w, &mut output).unwrap();
                    for y in 0..code.size() {
                        for x in 0..code.size() {
                            assert_eq!(code.is_dark(x, y) as u8, want.modules[y * code.size() + x]);
                        }
                    }
                }
            }
        }
    }
}

#[test]
fn single_mode_ceiling_and_wiping_hold_without_a_planner() {
    let mut w = Workspace::new();
    let mut output = [0x55; MODULE_BYTES + 3];
    let o = Options {
        ecc: Ecc::L,
        ..Options::default()
    };
    for text in ["7".repeat(461), "A".repeat(279), "a".repeat(192)] {
        let code = encode_simple_text(&text, &o, &mut w, &mut output).unwrap();
        assert_eq!(code.version(), 8);
        drop(code);
        assert!(output.iter().all(|&b| b == 0));
        output.fill(0x55);
        assert_eq!(
            encode_simple_text(&(text + "a"), &o, &mut w, &mut output).err(),
            Some(Error::Capacity)
        );
        assert!(output.iter().all(|&b| b == 0));
    }
    for bad in [
        Options {
            max_version: 9,
            ..o
        },
        Options { mask: Some(8), ..o },
    ] {
        output.fill(0x55);
        assert!(encode_bytes(&[0; 32], &bad, &mut w, &mut output).is_err());
        assert!(output.iter().all(|&b| b == 0));
    }
}
