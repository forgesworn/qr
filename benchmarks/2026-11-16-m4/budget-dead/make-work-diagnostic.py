from pathlib import Path
import sys
root=Path(sys.argv[1])
s=(root/'rust/tests/conformance.rs').read_text()
a='        assert_eq!(counted, recorded, "{file}: work counters (steps, compared, scanned, maps, second, meshes, probed, reduced)");'
b='        assert_eq!(&counted[3..], &recorded[3..], "{file}: attempted maps and recovery work must not change");\n        for i in 0..3 { assert!(counted[i] <= recorded[i], "{file}: work counter {i} increased"); }\n        if counted != recorded { eprintln!("BUDGET_WORK {}", serde_json::json!({"file":file,"before":recorded,"after":counted})); }'
assert s.count(a)==1
(root/'rust/tests/budget_work_diagnostic.rs').write_text(s.replace(a,b).replace('result, exact location, all eight work counters', 'result, exact location, unchanged map/recovery counters and nonincreasing search work'))
