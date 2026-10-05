#!/usr/bin/env python3
"""Build our module against a released Ghidra SDK without rebuilding upstream."""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import posixpath
import re
import shutil
import subprocess
import sys
import zipfile

MODULE = Path(__file__).resolve().parents[1]
ROOT = MODULE.parents[2]
VERSION = '0.2.0'
REPOSITORY = 'https://github.com/Cuuper22/ghidra-plus-plus'
RELATIVE_LINK = re.compile(r'(!?)\[([^\]]*)\]\((?!https?:|#|mailto:)([^)\s]+)\)')


def run(args: list[str], cwd: Path | None = None) -> None:
    subprocess.run(args, cwd=cwd, check=True)


def with_newlines(path: Path, newline: bytes) -> bytes:
    """Launchers need their platform's line endings whatever the checkout used."""
    return path.read_bytes().replace(b'\r\n', b'\n').replace(b'\n', newline)


def packaged_markdown(source: Path) -> str:
    """Point relative links at this release's files on GitHub, since the package has no docs tree."""
    base = posixpath.dirname(source.relative_to(ROOT).as_posix())

    def absolute(link: re.Match[str]) -> str:
        target, _, anchor = link[3].partition('#')
        kind = 'raw' if link[1] else 'blob'
        url = f'{REPOSITORY}/{kind}/v{VERSION}/{posixpath.normpath(posixpath.join(base, target))}'
        return f'{link[1]}[{link[2]}]({url}{"#" + anchor if anchor else ""})'

    return RELATIVE_LINK.sub(absolute, source.read_text(encoding='utf-8'))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ghidra', type=Path, required=True, help='Extracted Ghidra 12.1.4 directory')
    parser.add_argument('--java-home', type=Path, default=os.environ.get('JAVA_HOME'))
    parser.add_argument('--skip-web', action='store_true')
    parser.add_argument('--test', action='store_true')
    parser.add_argument('--package', type=Path, help='Full portable distribution ZIP destination')
    parser.add_argument('--bundle-java', action='store_true', help='Include the supplied JDK in the package')
    args = parser.parse_args()
    ghidra = args.ghidra.resolve()
    java_home = args.java_home.resolve() if args.java_home else None
    if not (ghidra / 'Ghidra/application.properties').is_file():
        parser.error('--ghidra must point to an extracted Ghidra distribution')
    properties = (ghidra / 'Ghidra/application.properties').read_text()
    if 'application.version=12.1.4' not in properties:
        parser.error('This release builds against Ghidra 12.1.4')
    suffix = '.exe' if os.name == 'nt' else ''
    javac = str(java_home / f'bin/javac{suffix}') if java_home else shutil.which('javac')
    jar = str(java_home / f'bin/jar{suffix}') if java_home else shutil.which('jar')
    java = str(java_home / f'bin/java{suffix}') if java_home else shutil.which('java')
    if not javac or not jar or not java:
        parser.error('A JDK 25 installation is required; pass --java-home')
    build = MODULE / 'build'
    classes = build / 'classes'
    classes.mkdir(parents=True, exist_ok=True)
    # Delete only this builder's class output so removed classes cannot leak into a release.
    for old in classes.rglob('*.class'):
        old.unlink()
    if not args.skip_web:
        npm = shutil.which('npm.cmd' if os.name == 'nt' else 'npm')
        if not npm:
            parser.error('Node.js and npm are required to build the workspace')
        run([npm, 'ci', '--no-audit', '--no-fund'], MODULE / 'web')
        run([npm, 'run', 'build'], MODULE / 'web')
    if not (MODULE / 'data/web/index.html').is_file():
        parser.error('Workspace assets are missing. Run without --skip-web.')
    classpath = os.pathsep.join(str(path) for path in (ghidra / 'Ghidra').rglob('*.jar'))

    def compile_java(source_dir: Path, output: Path, extra_classpath: str = '') -> None:
        output.mkdir(parents=True, exist_ok=True)
        arguments = ['--release', '25', '-encoding', 'UTF-8', '-cp', extra_classpath + classpath, '-d', str(output)]
        arguments += [str(path) for path in sorted(source_dir.rglob('*.java'))]
        argfile = build / f'javac-{output.name}.args'
        argfile.write_text('\n'.join('"' + argument.replace('\\', '/') + '"' for argument in arguments), encoding='utf-8')
        run([javac, '@' + str(argfile)])

    compile_java(MODULE / 'src/main/java', classes)
    if args.test:
        test_classes = build / 'test-classes'
        compile_java(MODULE / 'src/test/java', test_classes, str(classes) + os.pathsep)
        for suite in ('ghidraplus.core.AnalysisEngineTest', 'ghidraplus.server.InvestigationServerTest'):
            run([java, '-ea', '-cp', os.pathsep.join([str(test_classes), str(classes), classpath]), suite])
    destination = ghidra / 'Ghidra/Features/GhidraPlusPlus'
    (destination / 'lib').mkdir(parents=True, exist_ok=True)
    shutil.copy2(MODULE / 'Module.manifest', destination / 'Module.manifest')
    shutil.copytree(MODULE / 'data', destination / 'data', dirs_exist_ok=True)
    if (MODULE / 'ghidra_scripts').exists():
        shutil.copytree(MODULE / 'ghidra_scripts', destination / 'ghidra_scripts', dirs_exist_ok=True)
    run([jar, '--create', '--file', str(destination / 'lib/GhidraPlusPlus.jar'), '-C', str(classes), 'ghidraplus'])
    (ghidra / 'ghidra-plus-plus').write_bytes(with_newlines(MODULE / 'tools/ghidra-plus-plus', b'\n'))
    (ghidra / 'ghidra-plus-plus.bat').write_bytes(with_newlines(MODULE / 'tools/ghidra-plus-plus.bat', b'\r\n'))
    shutil.copy2(MODULE / 'tools/mcp.py', ghidra / 'ghidra-plus-plus-mcp.py')
    if os.name != 'nt':
        (ghidra / 'ghidra-plus-plus').chmod(0o755)
    shutil.copytree(MODULE / 'examples', ghidra / 'GhidraPlusPlus-examples', dirs_exist_ok=True)
    print(f'Ghidra++ installed into {ghidra}', flush=True)
    if args.package:
        package = args.package.resolve()
        package.parent.mkdir(parents=True, exist_ok=True)
        prefix = f'Ghidra++-{VERSION}'
        with zipfile.ZipFile(package, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
            for path in sorted(ghidra.rglob('*')):
                if path.is_file():
                    archive.write(path, str(Path(prefix) / path.relative_to(ghidra)))
            if args.bundle_java:
                if not java_home:
                    parser.error('--bundle-java requires --java-home')
                for path in sorted(java_home.rglob('*')):
                    # jmods only serve jlink, and src.zip only serves IDE navigation; Ghidra needs neither.
                    if path.is_file() and path.relative_to(java_home).parts[0] != 'jmods' and path.name != 'src.zip':
                        archive.write(path, str(Path(prefix) / 'runtime/java' / path.relative_to(java_home)))
            for source, target in [('README.md', 'README-GhidraPlusPlus.md'), ('docs/getting-started.md', 'GETTING-STARTED.md')]:
                archive.writestr(f'{prefix}/{target}', packaged_markdown(ROOT / source))
        print(f'Portable release: {package}', flush=True)


if __name__ == '__main__':
    main()
