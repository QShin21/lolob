"""Maintain the 1.6.0 manual; revise collaboration and append its operating guide."""
from pathlib import Path
import shutil
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs' / 'user-manual-1.7.0'
shutil.copytree(ROOT/'docs/user-manual-1.6.0/images', OUT/'images', dirs_exist_ok=True)
for source, target in [('connect', 'team-connect'), ('host-session','team-host'), ('host','team-monitor')]:
    capture=ROOT/'verification-output/collaboration-170-obs'/f'{source}.png'
    if capture.exists():
        shutil.copyfile(capture,OUT/'images'/f'{target}.png')
    elif not (OUT/'images'/f'{target}.png').exists():
        raise FileNotFoundError('Run verify-collaboration-170.mjs --obs to capture collaboration images')
source = (ROOT/'scripts/build-user-manual-160.py').read_text(encoding='utf-8')
source = source.replace("OUT = ROOT / 'docs' / 'user-manual-1.6.0'", "OUT = ROOT / 'docs' / 'user-manual-1.7.0'")
source = source.replace('assert len(pages) == 42, len(pages)', "exec((ROOT / 'scripts' / 'manual-170-revisions.py').read_text(encoding='utf-8'))\nassert len(pages) == 46, len(pages)")
source = source.replace('RIFTCAST 1.6.0', 'RIFTCAST 1.7.0').replace('<title>RiftCast 1.6.0', '<title>RiftCast 1.7.0').replace("(OUT/'RiftCast-1.6.0", "(OUT/'RiftCast-1.7.0")
exec(compile(source,str(ROOT/'scripts/build-user-manual-160.py'),'exec'))
