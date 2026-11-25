"""Regenerate the offline 2.1.0 manual from the maintained chapters and captures."""
from pathlib import Path
from shutil import copyfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs' / 'user-manual-2.1.0'
OUT.joinpath('images').mkdir(parents=True, exist_ok=True)
previous_images = ROOT / 'docs' / 'user-manual-1.7.0' / 'images'
retained = sorted(previous_images.glob('scene-*.png'))
retained += [previous_images / name for name in ('team-host.png', 'team-monitor.png', 'update.png')]
for image in retained:
    copyfile(image, OUT / 'images' / image.name)

base = ROOT / 'scripts' / 'build-user-manual-160.py'
source = base.read_text(encoding='utf-8')
source = source.replace("OUT = ROOT / 'docs' / 'user-manual-1.6.0'",
                        "OUT = ROOT / 'docs' / 'user-manual-2.1.0'")
marker = 'assert len(pages) == 42, len(pages)'
assert source.count(marker) == 1
source = source.replace(marker, marker + """
exec((ROOT / 'scripts' / 'manual-170-revisions.py').read_text(encoding='utf-8'))
assert len(pages) == 46, len(pages)
exec((ROOT / 'scripts' / 'manual-210-revisions.py').read_text(encoding='utf-8'))
assert len(pages) == 47, len(pages)""")
source = (source.replace("fig('collaboration'", "fig('team-connect'")
          .replace('sections = []', 'css += brand_css\nsections = []')
          .replace('RIFTCAST 1.6.0', '观澜 2.1.0')
          .replace('RiftCast OB 系统用户使用手册　·　2026.11.06', '观澜 2.1.0 用户使用手册')
          .replace('<title>RiftCast 1.6.0', '<title>观澜 2.1.0')
          .replace("OUT/'RiftCast-1.6.0", "OUT/'观澜-2.1.0"))
exec(compile(source, str(base), 'exec'))
