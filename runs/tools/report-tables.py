import json

m = json.load(open('runs/metrics.json'))
NAMES = {'openspec': 'OpenSpec', 'speckit': 'Spec Kit', 'cyberrock': 'CyberRock kit'}
K = [k for k in NAMES if k in m['kits']]
C = {'1': 'Feature', '2': 'Brownfield change', '3': 'Bugfix'}
MERGED = {('openspec', 'plan'): 'inside Specify', ('cyberrock', 'plan'): 'inside Specify', ('cyberrock', 'close'): 'inside Implement'}


def t(ms):
    s = round(ms / 1000); h, r = divmod(s, 3600); mi, se = divmod(r, 60)
    return f"{h}:{mi:02d}:{se:02d}" if h else f"{mi}:{se:02d}"


def tok(x): return x['inputTokens'] + x['outputTokens'] + x['cacheReadTokens'] + x['cacheCreationTokens']
def n(v): return f"{v:,}"
def kit(k): return m['kits'][k]
def change(k, c): return kit(k)['changes'].get(c)
def sumc(k, f): return sum(f(change(k, c)) for c in C if change(k, c))
def head(first): return f"| {' | '.join(first + [NAMES[k] for k in K])} |\n|{'---|' * (len(first) + len(K))}"
def row(cells): return f"| {' | '.join(cells)} |"
def safe(f, x): return f(x) if x else 'not run'


ROWS = [
    ('Hidden acceptance tests', lambda x: f"{x['acceptance']['passed']} of {x['acceptance']['total']}"),
    ('Build / lint / unit tests', lambda x: f"{'pass' if x['verify']['build']['exit'] == 0 else 'FAIL'} / {'pass' if x['verify']['lint']['exit'] == 0 else 'FAIL'} / {x['verify']['test']['detail']}"),
    ('Real time, all steps', lambda x: t(x['totals']['wallMs'])),
    ('Cost', lambda x: f"${x['totals']['costUsd']:.2f}"),
    ('Turns', lambda x: n(x['totals']['turns'])),
    ('Output tokens', lambda x: n(x['totals']['outputTokens'])),
    ('All tokens, including cache reads', lambda x: n(tok(x['totals']))),
    ('Kit steps run', lambda x: str(x['totals']['steps'])),
    ('Kit documents written', lambda x: f"{x['stats']['kit']['files']} files, {n(x['stats']['kit']['added'])} lines"),
    ('Code changed', lambda x: f"{x['stats']['code']['files']} files, +{n(x['stats']['code']['added'])} / -{x['stats']['code']['deleted']}"),
    ('Tests changed', lambda x: f"{x['stats']['tests']['files']} files, +{n(x['stats']['tests']['added'])} / -{x['stats']['tests']['deleted']}"),
]
out = [head(['Change', 'Measure'])]
for c in C:
    for i, (label, f) in enumerate(ROWS):
        out.append(row([C[c] if i == 0 else '', label] + [safe(f, change(k, c)) for k in K]))
print('\n'.join(out)); print('\n@@PHASES@@\n')

P = [('specify', 'Specify'), ('plan', 'Plan'), ('check', 'Check'), ('implement', 'Implement'), ('close', 'Close')]
out = [f"| Change | Phase | {' | '.join(f'{NAMES[k]} time | {NAMES[k]} cost' for k in K)} |\n|---|---|{'---|---|' * len(K)}"]
for c in C:
    for i, (key, name) in enumerate(P):
        cells = []
        for k in K:
            phases = (change(k, c) or {}).get('phases', {})
            if key in phases:
                cells += [t(phases[key]['wallMs']), f"${phases[key]['costUsd']:.2f}"]
            else:
                cells += [MERGED.get((k, key), '—')] * 2
        out.append(row([C[c] if i == 0 else '', name] + cells))
print('\n'.join(out)); print('\n@@TOTALS@@\n')

out = [head([''])]
out.append(row(['Setup (one-off)'] + [f"{t(change(k, 'setup')['totals']['wallMs'])}, ${change(k, 'setup')['totals']['costUsd']:.2f}" if change(k, 'setup') else '—' for k in K]))
TOTALS = [
    ('Three changes, real time', lambda k: t(sumc(k, lambda x: x['totals']['wallMs']))),
    ('Three changes, cost', lambda k: f"${sumc(k, lambda x: x['totals']['costUsd']):.2f}"),
    ('Three changes, turns', lambda k: n(sumc(k, lambda x: x['totals']['turns']))),
    ('Three changes, output tokens', lambda k: n(sumc(k, lambda x: x['totals']['outputTokens']))),
    ('Three changes, all tokens', lambda k: n(sumc(k, lambda x: tok(x['totals'])))),
    ('Kit steps run, AI and script', lambda k: str(sumc(k, lambda x: x['totals']['steps']))),
    ('Kit documents written, lines', lambda k: n(sumc(k, lambda x: x['stats']['kit']['added']))),
    ('Code lines added', lambda k: n(sumc(k, lambda x: x['stats']['code']['added']))),
    ('Test lines added', lambda k: n(sumc(k, lambda x: x['stats']['tests']['added']))),
]
for label, f in TOTALS:
    out.append(row([label] + [f(k) for k in K]))
print('\n'.join(out)); print('\n@@INTERV@@\n')

out = [head(['Change', 'Kind'])]
kinds = ['question', 'approval', 'reprompt', 'manual-fix', 'interruption', 'denied-permission']
for c in C:
    for i, kd in enumerate(kinds):
        out.append(row([C[c] if i == 0 else '', kd] + [str((change(k, c) or {}).get('interventions', {}).get(kd, 0)) for k in K]))
print('\n'.join(out)); print('\n@@TRACKS@@\n')
for k in K:
    for tr in (change(k, '1') or {}).get('tracks') or []:
        print(NAMES[k], tr['agent'], t(tr['wallMs']) if tr['wallMs'] else 'no end recorded')
print('\n@@RULES@@\n')
for k in K:
    for c in C:
        r = (change(k, c) or {}).get('rules')
        if r:
            print(NAMES[k], C[c], {x: (v['count'] if isinstance(v, dict) else v) for x, v in r.items()})
