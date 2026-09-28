#!/usr/bin/env python3
"""Check that the Bulma subset under sass/bulma/ still covers what the templates use.

The theme no longer imports Bulma itself; sass/bulma/ carries a hand-ported
slice of Bulma 0.9.4. This script guards that slice in two ways:

1. It builds a throwaway Zola site that imports the theme stylesheet the way
   every real site does, so the SCSS is proven to compile under Zola's Sass
   engine.
2. It compares the class names the templates use against the compiled CSS:
   every Bulma-derived class the templates rely on must still have a rule, and
   the templates must not start using a Bulma class that was never ported.

Usage: tools/check_bulma_subset.py  (run from anywhere; needs `zola` on PATH)
"""

import glob
import os
import re
import shutil
import subprocess
import sys
import tempfile

THEME = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Bulma-derived classes the templates use. Each must have a rule in the compiled
# CSS. Keep this in step with sass/bulma/ when adding or removing a component.
PORTED = {
    "breadcrumb",
    "card",
    "card-content",
    "card-header",
    "card-header-title",
    "card-image",
    "container",
    "content",
    "control",
    "has-icons-left",
    "has-succeeds-separator",
    "icon",
    "image",
    "input",
    "is-128x128",
    "is-16by9",
    "is-dark",
    "is-left",
    "is-rounded",
    "is-small",
    "media",
    "media-content",
    "media-left",
    "section",
    "tag",
    "title",
}

# Bulma-derived classes that no theme template uses but a site's own templates
# do (ericscouten.link puts `tags` on a list item). These must stay styled.
PORTED_FOR_SITES = {"tags"}

# Bulma component roots that were deliberately not ported. A template that
# starts using one of these expects styling that no longer exists.
NOT_PORTED = {
    "box", "button", "buttons", "checkbox", "column", "columns", "delete",
    "dropdown", "field", "file", "footer", "help", "hero", "label", "level",
    "menu", "message", "modal", "navbar", "notification", "pagination", "panel",
    "progress", "radio", "select", "subtitle", "table", "tabs", "textarea",
    "tile",
}

# Bulma's own modifier prefixes; any such class outside PORTED is suspect. The
# theme's own modifiers (track map states and the like) live in this allowlist.
THEME_MODIFIERS = {
    "is-collapsed", "is-corner", "is-docked", "is-done", "is-expanded",
    "is-idle", "is-moving", "is-section",
}


def template_classes():
    classes = set()
    for path in glob.glob(os.path.join(THEME, "templates", "**", "*.html"), recursive=True):
        with open(path, encoding="utf-8") as f:
            text = f.read()
        for attr in re.findall(r'class="([^"]*)"', text):
            # Drop Tera expressions so only literal class tokens remain.
            attr = re.sub(r"\{%.*?%\}|\{\{.*?\}\}", " ", attr)
            classes.update(t for t in attr.split() if re.fullmatch(r"[A-Za-z0-9_-]+", t))
    return classes


def compile_stylesheet():
    """Build a throwaway site that imports the theme stylesheet; return the CSS."""
    if shutil.which("zola") is None:
        sys.exit("zola is not on PATH")
    with tempfile.TemporaryDirectory() as site:
        os.makedirs(os.path.join(site, "content"))
        os.makedirs(os.path.join(site, "sass"))
        os.makedirs(os.path.join(site, "themes"))
        os.symlink(THEME, os.path.join(site, "themes", "zola-es-theme"))
        with open(os.path.join(site, "config.toml"), "w") as f:
            f.write('base_url = "https://example.test"\ncompile_sass = true\n')
        with open(os.path.join(site, "sass", "style.scss"), "w") as f:
            f.write('@import "../themes/zola-es-theme/sass/style.scss";\n')
        out = os.path.join(site, "public")
        result = subprocess.run(
            ["zola", "build", "--output-dir", out, "--force"],
            cwd=site, capture_output=True, text=True,
        )
        if result.returncode != 0:
            sys.exit(f"zola build failed:\n{result.stdout}\n{result.stderr}")
        with open(os.path.join(out, "style.css"), encoding="utf-8") as f:
            return f.read()


def css_classes(css):
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    selectors = re.findall(r"([^{}]+)\{", css)
    classes = set()
    for sel in selectors:
        if sel.strip().startswith("@"):
            continue
        classes.update(re.findall(r"\.([A-Za-z0-9_-]+)", sel))
    return classes


def main():
    used = template_classes()
    css = compile_stylesheet()
    styled = css_classes(css)
    problems = []

    for cls in sorted(PORTED):
        if cls not in used:
            problems.append(f"PORTED lists `{cls}` but no template uses it; prune it from sass/bulma/ and this list")
        if cls not in styled:
            problems.append(f"templates use `{cls}` but the compiled stylesheet has no rule for it")

    for cls in sorted(PORTED_FOR_SITES):
        if cls not in styled:
            problems.append(f"a site's templates use `{cls}` but the compiled stylesheet has no rule for it")

    for cls in sorted(used):
        if cls in NOT_PORTED:
            problems.append(f"templates use Bulma class `{cls}`, which was not ported")
        elif re.match(r"^(is|has|are)-", cls) and cls not in PORTED and cls not in THEME_MODIFIERS:
            problems.append(f"templates use Bulma-style modifier `{cls}`, which is neither ported nor a known theme modifier")

    if problems:
        print("\n".join(problems))
        sys.exit(1)
    print(f"ok: {len(PORTED)} ported classes covered; stylesheet compiles ({len(css)} bytes)")


if __name__ == "__main__":
    main()
