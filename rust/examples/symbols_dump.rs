//! Reads the module grids of the conformance pack's `symbols`, and then the
//! grids of a second file, and prints one line each for comparison with
//! `bench/wasm-symbols.mjs check`:
//! `symbols_dump <grids.json> [conformance.json]`. The grids file is a JSON
//! array of `{ name, size, rows }`, the rows in hex as in the pack.
//!
//! Line, tab separated: the name, then `-` for a grid that does not read, or
//! the payload bytes in hex (`-` if none), `v<version> <level> m<mask>
//! c<corrected> <mirrored>`, `eci=<values joined by commas, or ->`,
//! `sa=<index>/<total>/<parity> or -`, `fnc1=<- or first or second:<indicator>>`
//! and `text=<the text as UTF-8 in hex, or ->`.

use forgesworn_qr::symbol::{decode_modules, Fnc1};
use serde_json::Value;

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn dash(s: String) -> String {
    if s.is_empty() {
        "-".to_string()
    } else {
        s
    }
}

fn unhex(s: &str) -> Vec<u8> {
    (0..s.len() / 2).map(|i| u8::from_str_radix(&s[2 * i..2 * i + 2], 16).unwrap()).collect()
}

fn print(entries: &[Value]) {
    for entry in entries {
        let name = entry["name"].as_str().unwrap();
        let size = entry["size"].as_u64().unwrap() as usize;
        let mut modules = vec![0u8; size * size];
        for (y, row) in entry["rows"].as_array().unwrap().iter().enumerate() {
            let bytes = unhex(row.as_str().unwrap());
            for x in 0..size {
                modules[y * size + x] = (bytes[x / 8] >> (7 - x % 8)) & 1;
            }
        }
        match decode_modules(&modules, size) {
            None => println!("{name}\t-"),
            Some(d) => {
                let p = &d.payload;
                let eci = dash(p.eci.iter().map(|v| v.to_string()).collect::<Vec<_>>().join(","));
                let sa = match p.structured_append {
                    Some(s) => format!("{}/{}/{}", s.index, s.total, s.parity),
                    None => "-".to_string(),
                };
                let fnc1 = match &p.fnc1 {
                    None => "-".to_string(),
                    Some(Fnc1::First) => "first".to_string(),
                    Some(Fnc1::Second(s)) => format!("second:{s}"),
                };
                println!(
                    "{name}\t{}\tv{} {} m{} c{} {}\teci={eci}\tsa={sa}\tfnc1={fnc1}\ttext={}",
                    dash(hex(&p.bytes)),
                    p.version,
                    p.ecc.letter(),
                    p.mask,
                    p.corrected,
                    d.mirrored,
                    dash(hex(p.text.as_bytes()))
                );
            }
        }
    }
}

fn main() {
    let grids = std::env::args().nth(1).expect("a grids file");
    let pack = std::env::args().nth(2).unwrap_or_else(|| "../vectors/conformance.json".to_string());
    let pack: Value = serde_json::from_str(&std::fs::read_to_string(pack).expect("the pack")).expect("pack json");
    print(pack["symbols"].as_array().unwrap());
    let extra: Value = serde_json::from_str(&std::fs::read_to_string(grids).expect("the grids")).expect("grids json");
    print(extra.as_array().unwrap());
}
