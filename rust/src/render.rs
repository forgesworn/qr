//! Renderers: a standalone SVG document and block characters for a terminal.
//! Both give exactly the strings the TypeScript `toSvg` and `toTerminal` give
//! for the same options. There is no canvas renderer.

use crate::encode::QrCode;

/// Options of [`to_svg`]. The default is the TypeScript's: margin 4,
/// `#000` on `#fff`, no title.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SvgOptions {
    /// Quiet zone in modules on every side. Default 4, the standard's minimum.
    pub margin: usize,
    /// Colour of dark modules. Default `#000`.
    pub dark: String,
    /// Background colour, or `None` for none. Default `#fff`.
    pub light: Option<String>,
    /// Accessible name, written as the SVG `<title>`. An empty string adds none.
    pub title: String,
}

impl Default for SvgOptions {
    fn default() -> Self {
        SvgOptions { margin: 4, dark: "#000".to_string(), light: Some("#fff".to_string()), title: String::new() }
    }
}

/// Which modules the block characters of [`to_terminal`] draw.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Ink {
    /// Blocks paint the light modules and the quiet zone; suits a dark terminal.
    Light,
    /// Blocks paint the dark modules; suits a light terminal.
    Dark,
}

/// Options of [`to_terminal`]. The default is margin 4, ink light.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TerminalOptions {
    pub margin: usize,
    pub ink: Ink,
}

impl Default for TerminalOptions {
    fn default() -> Self {
        TerminalOptions { margin: 4, ink: Ink::Light }
    }
}

/// Renders a code as a standalone SVG document, one module per user unit and
/// one path for all dark modules.
pub fn to_svg(qr: &QrCode, options: &SvgOptions) -> String {
    let margin = options.margin;
    let side = qr.size + margin.saturating_mul(2);
    let dark = escape(&options.dark);
    let mut path = String::new();
    for y in 0..qr.size {
        let row = &qr.modules[y * qr.size..(y + 1) * qr.size];
        let mut x = 0;
        while x < qr.size {
            if row[x] != 1 {
                x += 1;
                continue;
            }
            let start = x;
            while x < qr.size && row[x] == 1 {
                x += 1;
            }
            path.push_str(&format!("M{} {}h{}v1h-{}z", start + margin, y + margin, x - start, x - start));
        }
    }
    let title = if options.title.is_empty() { String::new() } else { format!("<title>{}</title>", escape(&options.title)) };
    let background = match &options.light {
        None => String::new(),
        Some(light) => format!("<rect width=\"{side}\" height=\"{side}\" fill=\"{}\"/>", escape(light)),
    };
    let role = if options.title.is_empty() { "" } else { " role=\"img\"" };
    format!(
        "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 {side} {side}\" shape-rendering=\"crispEdges\"{role}>{title}{background}<path fill=\"{dark}\" d=\"{path}\"/></svg>"
    )
}

/// Escapes text for an attribute or element. `& < > " '` become numeric
/// character references. Characters XML 1.0 does not allow (most C0
/// controls, U+FFFE and U+FFFF) become U+FFFD. A Rust string cannot hold a
/// lone surrogate; the TypeScript turns one into U+FFFD too, so the output
/// is the same for the string `String::from_utf16_lossy` makes of the units.
fn escape(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        match c {
            '&' | '<' | '>' | '"' | '\'' => {
                out.push_str("&#");
                out.push_str(&(c as u32).to_string());
                out.push(';');
            }
            '\0'..='\x08' | '\x0B' | '\x0C' | '\x0E'..='\x1F' | '\u{FFFE}' | '\u{FFFF}' => out.push('\u{FFFD}'),
            _ => out.push(c),
        }
    }
    out
}

const BLOCKS: [char; 4] = [' ', '\u{2580}', '\u{2584}', '\u{2588}']; // none, upper half, lower half, full

/// Renders a code as text, two module rows per line with half-block
/// characters, one line per row pair and no trailing newline.
pub fn to_terminal(qr: &QrCode, options: &TerminalOptions) -> String {
    let margin = options.margin;
    let ink_is_light = options.ink == Ink::Light;
    let side = qr.size + margin.saturating_mul(2);
    let inked = |x: usize, y: usize| -> bool {
        let dark = x >= margin && y >= margin && x - margin < qr.size && y - margin < qr.size && qr.modules[(y - margin) * qr.size + (x - margin)] == 1;
        dark != ink_is_light
    };
    let mut lines: Vec<String> = Vec::with_capacity(side.div_ceil(2));
    let mut y = 0;
    while y < side {
        let mut line = String::new();
        for x in 0..side {
            // An odd side leaves the last line's lower half blank (the terminal background).
            let lower = y + 1 < side && inked(x, y + 1);
            line.push(BLOCKS[(inked(x, y) as usize) | ((lower as usize) << 1)]);
        }
        lines.push(line);
        y += 2;
    }
    lines.join("\n")
}
