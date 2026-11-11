import json, sys
m = json.load(open('runs/metrics.json'))
K = {'openspec': 'OpenSpec', 'speckit': 'Spec Kit'}
C = {'1': 'Feature', '2': 'Brownfield change', '3': 'Bugfix'}
def t(ms):
    s = round(ms / 1000); h, r = divmod(s, 3600); mi, se = divmod(r, 60)
    return f"{h}:{mi:02d}:{se:02d}" if h else f"{mi}:{se:02d}"
def tok(x): return x['inputTokens'] + x['outputTokens'] + x['cacheReadTokens'] + x['cacheCreationTokens']
def n(v): return f"{v:,}"
out = []
out.append("| Change | Measure | OpenSpec | Spec Kit |\n|---|---|---|---|")
for c in ('1', '2', '3'):
    a, b = (m['kits'][k]['changes'][c] for k in ('openspec', 'speckit'))
    rows = [
        ('Hidden acceptance tests', lambda x: f"{x['acceptance']['passed']} of {x['acceptance']['total']}"),
        ('Build / lint / unit tests', lambda x: f"pass / pass / {x['verify']['test']['detail']}"),
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
    for i, (label, f) in enumerate(rows):
        out.append(f"| {C[c] if i == 0 else ''} | {label} | {f(a)} | {f(b)} |")
print('\n'.join(out)); print('\n@@PHASES@@\n')
P = [('specify', 'Specify'), ('plan', 'Plan'), ('check', 'Check'), ('implement', 'Implement'), ('close', 'Close')]
out = ["| Change | Phase | OpenSpec time | OpenSpec cost | Spec Kit time | Spec Kit cost |\n|---|---|---|---|---|---|"]
for c in ('1', '2', '3'):
    a, b = (m['kits'][k]['changes'][c]['phases'] for k in ('openspec', 'speckit'))
    first = True
    for key, name in P:
        def cell(p, key=key):
            return (t(p[key]['wallMs']), f"${p[key]['costUsd']:.2f}") if key in p else ('—', '—')
        at, ac = cell(a); bt, bc = cell(b)
        if key == 'plan': at, ac = 'inside Specify', 'inside Specify'
        out.append(f"| {C[c] if first else ''} | {name} | {at} | {ac} | {bt} | {bc} |"); first = False
print('\n'.join(out)); print('\n@@TOTALS@@\n')
out = ["| | OpenSpec | Spec Kit |\n|---|---|---|"]
def kit(k): return m['kits'][k]
def sumc(k, f): return sum(f(kit(k)['changes'][c]) for c in ('1', '2', '3'))
out.append(f"| Setup (one-off) | {t(kit('openspec')['changes']['setup']['totals']['wallMs'])}, ${kit('openspec')['changes']['setup']['totals']['costUsd']:.2f} | {t(kit('speckit')['changes']['setup']['totals']['wallMs'])}, ${kit('speckit')['changes']['setup']['totals']['costUsd']:.2f} |")
out.append(f"| Three changes, real time | {t(sumc('openspec', lambda x: x['totals']['wallMs']))} | {t(sumc('speckit', lambda x: x['totals']['wallMs']))} |")
out.append(f"| Three changes, cost | ${sumc('openspec', lambda x: x['totals']['costUsd']):.2f} | ${sumc('speckit', lambda x: x['totals']['costUsd']):.2f} |")
out.append(f"| Three changes, turns | {n(sumc('openspec', lambda x: x['totals']['turns']))} | {n(sumc('speckit', lambda x: x['totals']['turns']))} |")
out.append(f"| Three changes, output tokens | {n(sumc('openspec', lambda x: x['totals']['outputTokens']))} | {n(sumc('speckit', lambda x: x['totals']['outputTokens']))} |")
out.append(f"| Kit documents written, lines | {n(sumc('openspec', lambda x: x['stats']['kit']['added']))} | {n(sumc('speckit', lambda x: x['stats']['kit']['added']))} |")
out.append(f"| Code lines added | {n(sumc('openspec', lambda x: x['stats']['code']['added']))} | {n(sumc('speckit', lambda x: x['stats']['code']['added']))} |")
out.append(f"| Test lines added | {n(sumc('openspec', lambda x: x['stats']['tests']['added']))} | {n(sumc('speckit', lambda x: x['stats']['tests']['added']))} |")
print('\n'.join(out)); print('\n@@INTERV@@\n')
out = ["| Change | Kind | OpenSpec | Spec Kit |\n|---|---|---|---|"]
kinds = ['question', 'approval', 'reprompt', 'manual-fix', 'interruption', 'denied-permission']
for c in ('1', '2', '3'):
    for i, kd in enumerate(kinds):
        a, b = (m['kits'][k]['changes'][c]['interventions'].get(kd, 0) for k in ('openspec', 'speckit'))
        out.append(f"| {C[c] if i == 0 else ''} | {kd} | {a} | {b} |")
print('\n'.join(out)); print('\n@@TRACKS@@\n')
for k in ('openspec', 'speckit'):
    for tr in m['kits'][k]['changes']['1']['tracks']:
        print(K[k], tr['agent'], t(tr['wallMs']))
print('\n@@RULES@@\n')
for k in ('openspec', 'speckit'):
    for c in ('1', '2', '3'):
        r = m['kits'][k]['changes'][c]['rules']
        print(K[k], C[c], {x: (v['count'] if isinstance(v, dict) else v) for x, v in r.items()})
