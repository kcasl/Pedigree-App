import json
import os

path = r"C:\Users\sadd2\.cursor\projects\c-Project-Pedigree-App-front\agent-transcripts\512656ad-a268-4943-99a4-788bcec42528\512656ad-a268-4943-99a4-788bcec42528.jsonl"
outdir = r"C:\Project\Pedigree_App\front\_extract"
rollback = 1207
targets = [
    "EdgeLines.tsx",
    "standardLayout.ts",
    "PersonNodeCard.tsx",
    "DraggablePersonNode.tsx",
    "standardTemplate.ts",
    "PedigreeScreen.tsx",
]

edits = []
for i, line in enumerate(open(path, encoding="utf-8"), 1):
    if i >= rollback:
        break
    obj = json.loads(line)
    for item in obj.get("message", {}).get("content", []):
        if not isinstance(item, dict):
            continue
        name = item.get("name")
        if name not in ("Write", "StrReplace", "ApplyPatch"):
            continue
        inp = item.get("input", {})
        if name == "Write":
            p = inp.get("path", "").replace("\\", "/")
            edits.append((i, "write", p, inp.get("contents", "")))
        elif name == "StrReplace":
            p = inp.get("path", "").replace("\\", "/")
            edits.append((i, "str", p, inp))
        elif name == "ApplyPatch":
            patch = inp if isinstance(inp, str) else str(inp)
            edits.append((i, "patch", "", patch))

last = {}
for line_no, typ, p, data in edits:
    for t in targets:
        if t in p:
            last[t] = (line_no, typ, data)

with open(os.path.join(outdir, "summary.txt"), "w", encoding="utf-8") as sf:
    for t in targets:
        if t not in last:
            sf.write(f"{t}: NO EDIT\n")
            continue
        ln, typ, _ = last[t]
        sf.write(f"{t}: last {typ} at line {ln}\n")

# Full Write for EdgeLines (last one)
for line_no, typ, p, data in edits:
    if typ == "write" and "EdgeLines.tsx" in p:
        with open(os.path.join(outdir, "EdgeLines.tsx"), "w", encoding="utf-8") as f:
            f.write(data)
        last_edge_line = line_no

# Save last strreplace payloads for key files
for t in targets:
    reps = [(ln, d) for ln, typ, p, d in edits if typ == "str" and t in p]
    if not reps:
        continue
    with open(os.path.join(outdir, f"{t}.last_strreplace.json"), "w", encoding="utf-8") as f:
        json.dump({"line": reps[-1][0], **reps[-1][1]}, f, ensure_ascii=False, indent=2)
    with open(os.path.join(outdir, f"{t}.strreplace_count.txt"), "w", encoding="utf-8") as f:
        f.write(str(len(reps)))

# Save all strreplaces for PersonNodeCard and standardLayout (recent session)
for t in ["PersonNodeCard.tsx", "standardLayout.ts", "PedigreeScreen.tsx", "standardTemplate.ts"]:
    reps = [(ln, d) for ln, typ, p, d in edits if typ == "str" and t in p and ln >= 1100]
    if not reps:
        continue
    with open(os.path.join(outdir, f"{t}.recent_strreplaces.json"), "w", encoding="utf-8") as f:
        json.dump([{"line": ln, **d} for ln, d in reps], f, ensure_ascii=False, indent=2)

# Extract PedigreeScreen patches mentioning EdgeLines after line 1100
patches = [(ln, d) for ln, typ, p, d in edits if typ == "patch" and "PedigreeScreen.tsx" in d and ln >= 1100]
with open(os.path.join(outdir, "PedigreeScreen.recent_patches.txt"), "w", encoding="utf-8") as f:
    for ln, d in patches:
        f.write(f"=== line {ln} ===\n{d[:8000]}\n\n")

print("done", file=open(os.path.join(outdir, "done.txt"), "w"))
