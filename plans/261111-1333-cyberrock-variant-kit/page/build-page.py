"""Builds one shareable report page from its Markdown report.

Usage: python3 build-page.py evaluation <output.html>
Pages, their source reports and the links between them are in pages.json.
"""
import html, json, re, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
CONFIG = json.loads((HERE / 'pages.json').read_text())
KEY, OUT = sys.argv[1], sys.argv[2]
PAGE = CONFIG['pages'][KEY]
MODE = PAGE['text']  # cr-only: all prose is about the CyberRock kit; marked: only prose naming it; shown: no switch
LINK_LABELS = {
    'evaluation': 'Evaluation: results and verdict',
    'original summary': 'Original two-kit summary',
    'original full report': 'Original two-kit full report',
    'original code audit': 'Code audit of the three kits',
}
KIT_CLASS = {'OpenSpec': 'os', 'Spec Kit': 'sk', 'CyberRock kit': 'cr'}
lines = (ROOT / PAGE['src']).read_text().split('\n')


def inline(text):
    text = html.escape(text, quote=False)
    text = re.sub(r'`([^`]+)`', r'<code>\1</code>', text)
    text = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', text)
    return re.sub(r'\[(Verified|Judgement)([^\]]*)\]', lambda m: f'<span class="tag">{m.group(1)}{m.group(2)}</span>', text)


def slug(text):
    return re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-')


def prose_class(raw):
    if MODE == 'cr-only' or (MODE == 'marked' and 'CyberRock' in raw):
        return ' class="cr-only"'
    return ''


def table(rows):
    head = [c.strip() for c in rows[0].strip().strip('|').split('|')]
    body = [[c.strip() for c in r.strip().strip('|').split('|')] for r in rows[2:]]
    cr_cols = {i for i, c in enumerate(head) if 'cyberrock' in c.lower()}
    mixed = any(c == 'OpenSpec' or c.startswith('OpenSpec time') for c in head)
    numeric = {
        i for i in range(1, len(head))
        if body and sum(1 for r in body if i < len(r) and re.match(r'^[\$\d+\-—]|^(pass|none|inside|not run|fastest|no|yes|same)', r[i].replace('**', ''))) >= len(body) * 0.6
    }

    def cell(tag, i, c):
        classes = (['cr'] if i in cr_cols else []) + (['num'] if i in numeric else [])
        dot = ''
        if tag == 'th':
            dot = next((f'<i class="dot dot-{cls}"></i>' for name, cls in KIT_CLASS.items() if c == name or c.startswith(name + ' ')), '')
        attr = f' class="{" ".join(classes)}"' if classes else ''
        return f'<{tag}{attr}>{dot}{inline(c)}</{tag}>'

    hidden = MODE == 'cr-only' and not mixed
    out = f'<div class="table-wrap{" cr-only" if hidden else ""}"><table><thead><tr>'
    out += ''.join(cell('th', i, c) for i, c in enumerate(head)) + '</tr></thead><tbody>'
    out += ''.join('<tr>' + ''.join(cell('td', i, c) for i, c in enumerate(r)) + '</tr>' for r in body)
    return out + '</tbody></table></div>', mixed


blocks, meta, i = [], '', 1
while i < len(lines):
    line = lines[i]
    if not line.strip():
        i += 1
        continue
    if line.startswith(('**Author:**', '**Date:**')):
        meta, i = inline(line), i + 1
        continue
    heading = re.match(r'^(#{2,4}) (.+)$', line)
    if heading:
        blocks.append(('h', len(heading.group(1)), heading.group(2), False))
        i += 1
        continue
    if line.startswith('|'):
        j = i
        while j < len(lines) and lines[j].startswith('|'):
            j += 1
        blocks.append(('table', 0, *table(lines[i:j])))
        i = j
        continue
    if re.match(r'^(- |\d+\. )', line):
        tag, items = ('ul' if line.startswith('- ') else 'ol'), []
        while i < len(lines) and (re.match(r'^(- |\d+\. )', lines[i]) or lines[i].startswith('  ')):
            if re.match(r'^(- |\d+\. )', lines[i]):
                items.append(re.sub(r'^(- |\d+\. )', '', lines[i]))
            else:
                items[-1] += ' ' + lines[i].strip()
            i += 1
        whole = ' class="cr-only"' if MODE == 'cr-only' else ''
        blocks.append(('text', 0, f'<{tag}{whole}>' + ''.join(f'<li{prose_class(x) if MODE == "marked" else ""}>{inline(x)}</li>' for x in items) + f'</{tag}>', False))
        continue
    j, para = i, []
    while j < len(lines) and lines[j].strip() and not lines[j].startswith(('|', '#', '- ')) and not re.match(r'^\d+\. ', lines[j]):
        para.append(lines[j])
        j += 1
    text = ' '.join(para)
    blocks.append(('text', 0, f'<p{prose_class(text)}>{inline(text)}</p>', False))
    i = j


def section_hidden(title, has_mixed):
    return (MODE == 'cr-only' and not has_mixed) or (MODE == 'marked' and 'CyberRock' in title)


def render(start, level):
    out, k, has_mixed = [], start, False
    while k < len(blocks):
        kind, lvl, content, mixed = blocks[k]
        if kind == 'h':
            if lvl <= level:
                break
            inner, k, sub_mixed = render(k + 1, lvl)
            cls = ' class="cr-only"' if section_hidden(content, sub_mixed) else ''
            out.append(f'<section{cls} id="{slug(content)}"><h{lvl}>{inline(content)}</h{lvl}>{inner}</section>')
            has_mixed = has_mixed or sub_mixed
            continue
        out.append(content)
        has_mixed, k = has_mixed or mixed, k + 1
    return ''.join(out), k, has_mixed


body, _, _ = render(0, 1)
toc = ''
for n, block in enumerate(blocks):
    if block[0] == 'h' and block[1] == 2:
        end = next((m for m in range(n + 1, len(blocks)) if blocks[m][0] == 'h' and blocks[m][1] == 2), len(blocks))
        mixed = any(b[0] == 'table' and b[3] for b in blocks[n + 1:end])
        cls = ' class="cr-only"' if section_hidden(block[2], mixed) else ''
        toc += f'<li{cls}><a href="#{slug(block[2])}">{inline(block[2])}</a></li>'
links = ''.join(f'<a href="{url}">{LINK_LABELS[name]}</a>' for name, url in CONFIG['links'].items() if url and name != KEY)
page = (HERE / 'template.html').read_text()
fills = {
    'TITLE': PAGE['title'],
    'H1': PAGE['h1'],
    'LEDE': PAGE['lede'],
    'META': meta,
    'LINKS': f'<nav class="links" aria-label="Related reports">{links}</nav>' if links else '',
    'SWITCH': (HERE / 'switch.html').read_text() if PAGE['switch'] else '',
    'INTRO': (HERE / PAGE['intro']).read_text() if PAGE['intro'] else '',
    'TOC_CLASS': 'cr-only' if MODE == 'cr-only' else '',
    'TOC': toc,
    'BODY': body,
}
for name, value in fills.items():
    page = page.replace('{{' + name + '}}', value)
Path(OUT).write_text(page)
print(KEY, 'blocks', len(blocks), 'tables', sum(1 for b in blocks if b[0] == 'table'), '->', OUT)
