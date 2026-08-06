import json
import os
import subprocess

TRANSCRIPT = r"C:\Users\sadd2\.cursor\projects\c-Project-Pedigree-App-front\agent-transcripts\512656ad-a268-4943-99a4-788bcec42528\512656ad-a268-4943-99a4-788bcec42528.jsonl"
ROLLBACK = 1207
OUT = r"C:\Project\Pedigree_App\front\_extract"
REPO = r"C:\Project\Pedigree_App"

FILES = {
    "EdgeLines.tsx": "front/src/components/EdgeLines.tsx",
    "PersonNodeCard.tsx": "front/src/components/PersonNodeCard.tsx",
    "DraggablePersonNode.tsx": "front/src/components/DraggablePersonNode.tsx",
    "standardLayout.ts": "front/src/utils/standardLayout.ts",
    "standardTemplate.ts": "front/src/utils/standardTemplate.ts",
    "PedigreeScreen.tsx": "front/src/screens/PedigreeScreen.tsx",
}

def git_head(rel):
    r = subprocess.run(
        ["git", "show", f"HEAD:{rel}"],
        cwd=REPO, capture_output=True, text=True, encoding="utf-8"
    )
    return r.stdout if r.returncode == 0 else ""

writes = {}
edits = {k: [] for k in FILES}

for i, line in enumerate(open(TRANSCRIPT, encoding="utf-8"), 1):
    if i >= ROLLBACK:
        break
    obj = json.loads(line)
    for item in obj.get("message", {}).get("content", []):
        if not isinstance(item, dict):
            continue
        name = item.get("name")
        inp = item.get("input", {})
        if name == "Write":
            p = inp.get("path", "").replace("\\", "/")
            for k, rel in FILES.items():
                if k in p:
                    writes[k] = (i, inp.get("contents", ""))
        elif name == "StrReplace":
            p = inp.get("path", "").replace("\\", "/")
            for k in FILES:
                if k in p:
                    edits[k].append((i, inp))

os.makedirs(OUT, exist_ok=True)
report = []

for k, rel in FILES.items():
    if k in writes:
        content = writes[k][1]
        base = f"Write line {writes[k][0]}"
    else:
        content = git_head(rel)
        base = "git HEAD"
    applied = skipped = 0
    for ln, inp in edits[k]:
        old = inp.get("old_string", "")
        new = inp.get("new_string", "")
        if old in content:
            content = content.replace(old, new, 1)
            applied += 1
        else:
            skipped += 1
    outpath = os.path.join(OUT, f"pre_rollback_{k}")
    with open(outpath, "w", encoding="utf-8") as f:
        f.write(content)
    report.append(f"{k}: base={base}, applied={applied}, skipped={skipped}, bytes={len(content.encode())}")

with open(os.path.join(OUT, "replay_report.txt"), "w", encoding="utf-8") as f:
    f.write("\n".join(report))

print("\n".join(report))
