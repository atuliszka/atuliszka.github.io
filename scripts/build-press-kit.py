"""Rebuild the public press ZIP from an explicit list of website assets.

Run: python scripts/build-press-kit.py
The trailer is a separate download. Previews and internal source material are excluded.
"""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ASSETS = Path(__file__).resolve().parents[1] / 'assets' / 'press' / 'peasant-to-king'
FILES = [
    'press-kit.txt',
    'peasant-to-king-icon.png',
    'peasant-to-king-logo-transparent.png',
    'peasant-to-king-feature-graphic.png',
    'screenshots/01-peasant-to-king-farm.png',
    'screenshots/01b-peasant-to-king-farm-upgrades.png',
    'screenshots/02-peasant-to-king-market.png',
    'screenshots/03-peasant-to-king-estate.png',
    'screenshots/03b-peasant-to-king-realm-combat.png',
    'screenshots/04-peasant-to-king-sea-trade.png',
    'screenshots/05-peasant-to-king-western-town.png',
    'screenshots/06-peasant-to-king-flooded-valley.png',
    'screenshots/07-peasant-to-king-ambervale.png',
    'screenshots/08-peasant-to-king-settlement.png',
    'key-art/01-hillside-farm.png',
    'key-art/02-open-ground-harvest.png',
    'key-art/03-barn-interior.png',
    'key-art/04-market-square.png',
    'key-art/05-dockside-trade.png',
    'key-art/06-freight-road-junction.png',
]


def main():
    for name in FILES:
        if not (ASSETS / name).is_file():
            raise FileNotFoundError(ASSETS / name)
    archive = ASSETS / 'peasant-to-king-press-kit.zip'
    with ZipFile(archive, 'w', compression=ZIP_DEFLATED, compresslevel=6) as kit:
        for name in FILES:
            kit.write(ASSETS / name, f'peasant-to-king-press-kit/{name}')
    with ZipFile(archive) as kit:
        if kit.testzip() is not None:
            raise RuntimeError('Press ZIP failed its integrity check')
    print(f'{archive.name}: {len(FILES)} files, {archive.stat().st_size / 1_000_000:.1f} MB')


if __name__ == '__main__':
    main()
