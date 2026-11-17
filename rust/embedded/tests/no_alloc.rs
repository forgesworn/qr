use forgesworn_qr_embedded::{
    encode_bytes, encode_simple_text, Ecc, Options, Workspace, MODULE_BYTES,
};
#[cfg(feature = "optimal")]
use forgesworn_qr_embedded::{encode_text, TextPlanner};
use std::alloc::{GlobalAlloc, Layout, System};
use std::cell::Cell;

struct CountAlloc;
thread_local! {
    static ACTIVE: Cell<bool> = const { Cell::new(false) };
    static ALLOCATIONS: Cell<usize> = const { Cell::new(0) };
}
fn count() {
    if ACTIVE.try_with(Cell::get).unwrap_or(false) {
        let _ = ALLOCATIONS.try_with(|n| n.set(n.get() + 1));
    }
}
unsafe impl GlobalAlloc for CountAlloc {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        count();
        unsafe { System.alloc(layout) }
    }
    unsafe fn alloc_zeroed(&self, layout: Layout) -> *mut u8 {
        count();
        unsafe { System.alloc_zeroed(layout) }
    }
    unsafe fn realloc(&self, ptr: *mut u8, layout: Layout, size: usize) -> *mut u8 {
        count();
        unsafe { System.realloc(ptr, layout, size) }
    }
    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
        unsafe { System.dealloc(ptr, layout) }
    }
}
#[global_allocator]
static ALLOCATOR: CountAlloc = CountAlloc;

#[test]
fn encoding_drawing_dropping_and_failures_do_not_allocate() {
    let mut w = Workspace::new();
    #[cfg(feature = "optimal")]
    let mut planner = TextPlanner::new();
    let mut output = [0; MODULE_BYTES];
    let digits = "7".repeat(461);
    // Warm thread-local state before observing the tested region.
    ALLOCATIONS.with(|n| n.set(0));
    ACTIVE.with(|active| active.set(true));
    for _ in 0..8 {
        for text in [
            "",
            "https://mint.example/w?k1=throwaway&amount=21000",
            "a123456789012b",
            "é雪🦀",
            &digits,
        ] {
            let code = encode_simple_text(
                text,
                &Options {
                    ecc: Ecc::L,
                    ..Options::default()
                },
                &mut w,
                &mut output,
            )
            .unwrap();
            for y in 0..code.size() {
                for x in 0..code.size() {
                    std::hint::black_box(code.is_dark(x, y));
                }
            }
        }
        #[cfg(feature = "optimal")]
        drop(
            encode_text(
                "é123456789012雪",
                &Options::default(),
                &mut planner,
                &mut w,
                &mut output,
            )
            .unwrap(),
        );
        drop(encode_bytes(&[0xab; 32], &Options::default(), &mut w, &mut output).unwrap());
        assert!(encode_bytes(&[0; 300], &Options::default(), &mut w, &mut output).is_err());
        assert!(encode_simple_text(
            "x",
            &Options {
                mask: Some(9),
                ..Options::default()
            },
            &mut w,
            &mut output
        )
        .is_err());
    }
    ACTIVE.with(|active| active.set(false));
    assert_eq!(ALLOCATIONS.with(Cell::get), 0);
    eprintln!(
        "workspace={} bytes; packed output={} bytes; measured allocations=0",
        std::mem::size_of::<Workspace>(),
        MODULE_BYTES
    );
}
