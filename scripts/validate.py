#!/usr/bin/env python3
"""Mirror of `hermes plugins validate`'s language-pack checks for it.desktop.yaml:
text-only leaves; every key present in the surface's key export; a report of
function-template placeholders. Exits non-zero on errors, warns on extras."""
import json, re, sys
from pathlib import Path
import yaml

root = Path(__file__).resolve().parent.parent
export_path = Path(__file__).resolve().parent.parent.parent / 'gradia-desktop-it/locales/_keys.desktop.json'
export = json.loads(export_path.read_text(encoding='utf-8-sig'))
ref = set(export['keys'] if isinstance(export, dict) else export)

def flat(node, prefix=''):
    for key, value in (node or {}).items():
        path = f'{prefix}.{key}' if prefix else key
        if isinstance(value, dict):
            yield from flat(value, path)
        else:
            yield path, value

# The pack contract: every id in plugin.yaml's provides_locales needs a
# core-surface locales/<id>.yaml (may be an empty mapping when Hermes already
# bundles that core language — #138269 review). Mirrors hermes plugins validate.
manifest = yaml.safe_load((root / 'plugin.yaml').read_text(encoding='utf-8'))
declared = [str(loc.get('id')) for loc in (manifest.get('provides_locales') or [])]
missing_core = [i for i in declared if not (root / 'locales' / f'{i}.yaml').is_file()]
if missing_core:
    print(f"declared locales without a core catalog (error): {missing_core}")
    sys.exit(1)
print(f"declared provides_locales: {declared} — core catalogs present")

pack = dict(flat(yaml.safe_load((root / 'locales/it.desktop.yaml').read_text(encoding='utf-8'))))
nontext = sorted(k for k, v in pack.items() if not isinstance(v, str))
extra = sorted(set(pack) - ref)
missing = sorted(ref - set(pack))
fn_templates = sum(1 for v in pack.values() if re.search(r'\{\d+\}', v))

print(f"keys: {len(pack)}/{len(ref)} | function templates: {fn_templates}")
print(f"non-text leaves (error): {len(nontext)} {nontext[:5]}")
print(f"unknown keys (warning): {len(extra)} {extra[:5]}")
print(f"not shippable (format): {len(missing)} {missing}")
sys.exit(1 if nontext else 0)
