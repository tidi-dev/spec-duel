"""Adds the CyberRock kit to the original two-kit code audit page.

Usage: python3 extend-original-code-audit.py <original-page.html> <output.html>
The original page keeps all its content; the CyberRock kit is added as a third kit,
with a switch that hides it again. The kit's own audit is appended from
plans/reports/cyberrock-variant-code-audit.md.
"""
import html, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
src = Path(sys.argv[1]).read_text()
page = re.sub(r'^<!doctype html>.*?<body>\n?', '', src, count=1, flags=re.S)
page = re.sub(r'\n?</body></html>\s*$', '\n', page)


def rep(old, new, count=1):
    global page
    assert page.count(old) == count, (page.count(old), old[:90])
    page = page.replace(old, new)


def both(three, two):
    return f'<span class="three-only">{three}</span><span class="two-only">{two}</span>'


def pips(score):
    return '<td class="cr"><span class="rating"><span class="pips c">' + '<i class="on"></i>' * score + '<i></i>' * (5 - score) + f'</span><b class="c">{score}</b></span></td>'


# ---- styles, switch, author -------------------------------------------------
rep("    --speckit: #b4540f;\n", "    --speckit: #b4540f;\n    --cyberrock: #5b3fb8;\n")
rep("--openspec: #48c9bd; --speckit: #f2994a;", "--openspec: #48c9bd; --speckit: #f2994a; --cyberrock: #ffd166;", 2)
rep("  footer { color: var(--muted);", """  .ck { color: var(--cyberrock); font-weight: 600; }
  .headline { grid-template-columns: repeat(auto-fit, minmax(176px, 1fr)); }
  .fig { grid-template-rows: auto 1fr; gap: 12px; padding: 14px; }
  .fig .rows { display: grid; gap: 6px; align-self: end; }
  .fig .vrow { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; padding-top: 6px; border-top: 1px solid var(--line); font-size: 0.85rem; }
  .fig .vrow > span { white-space: nowrap; }
  .fig .vrow b { font-family: var(--mono); font-size: 1.05rem; font-weight: 500; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .pips.c i.on { background: var(--cyberrock); }
  .rating b.c { color: var(--cyberrock); }
  .panel.c, .evidence.c { border-top: 3px solid var(--cyberrock); }
  table.areas thead th.ck { color: var(--cyberrock); font-weight: 600; }
  .chip.part { color: var(--warn); }
  .chip.na { color: var(--muted); }
  .switchrow { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; }
  .switch { display: inline-flex; border: 1px solid var(--line); border-radius: 999px; padding: 3px; background: var(--panel); }
  .switch button { font: inherit; font-size: 0.9rem; font-weight: 500; color: var(--muted); background: transparent; border: 0; border-radius: 999px; padding: 6px 14px; cursor: pointer; }
  .switch button[aria-pressed="true"] { background: var(--accent); color: var(--panel); font-weight: 600; }
  .switch button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .two-only { display: none; }
  body.view-two .two-only { display: revert; }
  body.view-two .three-only, body.view-two .cr { display: none; }
  footer { color: var(--muted);""")
rep("""    <p class="meta">Scope: <code>apps/</code> and <code>libs/</code>, only the code each kit added after the shared starting point (<code>baseline-v1</code>) · Two independent reviewers, one per kit, run in parallel, then cross-checked</p>
""", """    <p class="lead cr">Added later the same day: the <span class="ck">CyberRock kit</span>, our own kit built from what the other two got right and wrong, was audited the same way. It has no high-severity finding, the fewest medium ones and the fewest known bugs, and it is the only one whose concurrency guarantees are enforced by the database and tested against it. It also wrote the most tests and has the most small findings.</p>
    <p class="meta">Scope: <code>apps/</code> and <code>libs/</code>, only the code each kit added after the shared starting point (<code>baseline-v1</code>) · """ + both('Three independent reviewers, one per kit, then cross-checked', 'Two independent reviewers, one per kit, run in parallel, then cross-checked') + """</p>
    <p class="meta">Author: Dai Ho · contact@daiho.tech</p>
""")
rep("""      <a href="#audit-speckit">Spec Kit audit ↓</a>
    </nav>
  </header>
""", """      <a href="#audit-speckit">Spec Kit audit ↓</a>
      <a class="cr" href="#audit-cyberrock">CyberRock kit audit ↓</a>
      <a class="cr" href="https://claude.ai/artifact/Gi22wVojhqjsC6xLPfDSY3" target="_blank" rel="noopener">CyberRock kit: why it exists and how it did ↗</a>
    </nav>
  </header>

  <section class="switchrow">
    <span class="eyebrow" id="switch-label">Show</span>
    <div class="switch" role="group" aria-labelledby="switch-label">
      <button type="button" id="view-three" aria-pressed="true">Three kits</button>
      <button type="button" id="view-two" aria-pressed="false">OpenSpec and Spec Kit only</button>
    </div>
  </section>
""")

# ---- headline figures --------------------------------------------------------
for first, second, third in [('40', '37', '39'), ('11 (0)', '14 (1)', '18 (0)'), ('4,158', '5,047', '5,791'), ('309', '321', '429'), ('99.2%', '99.1%', '97.7%')]:
    rep(f'<span class="pair"><b class="os">{first}</b><b class="sk">{second}</b></span>',
        '<span class="rows">'
        f'<span class="vrow"><span class="os">OpenSpec</span><b>{first}</b></span>'
        f'<span class="vrow"><span class="sk">Spec Kit</span><b>{second}</b></span>'
        f'<span class="vrow cr"><span class="ck">CyberRock kit</span><b>{third}</b></span>'
        '</span>')
rep('    <p class="legend"><span><i style="background:var(--openspec)"></i>OpenSpec</span><span><i style="background:var(--speckit)"></i>Spec Kit</span></p>\n', '')

# ---- what we found -----------------------------------------------------------
rep("""Spec Kit splits rules between create and update and keeps a hand-written column list in raw SQL.</li>
    </ul>""", """Spec Kit splits rules between create and update and keeps a hand-written column list in raw SQL.</li>
      <li class="cr"><strong>The CyberRock kit avoids ten of the twelve known bugs.</strong> One is reduced (the lost confirmation job) and one remains (nothing is ever cleaned up). It was built knowing these bugs, so this shows its bug catalogue works for the bugs that are in it.</li>
      <li class="cr"><strong>The CyberRock kit's own worst problems:</strong> a booking can be saved while the caller is told it failed; valid times without seconds are refused; and its real-database tests can be skipped without anyone noticing.</li>
      <li class="cr"><strong>One weakness is shared by all three:</strong> network errors between the worker and the booking service use up the three confirmation attempts, so a booking can stay pending for good.</li>
    </ul>""")

# ---- scorecard ---------------------------------------------------------------
rep('<thead><tr><th>Area</th><th class="os">OpenSpec</th><th class="sk">Spec Kit</th><th>Who is ahead, and why</th></tr></thead>',
    '<thead><tr><th>Area</th><th class="os">OpenSpec</th><th class="sk">Spec Kit</th><th class="ck cr">CyberRock kit</th><th>Who is ahead, and why</th></tr></thead>')
SCORES = {
    'Code quality': (4, '<span class="tie">Even</span>'),
    'Code smells': (4, '<span class="tie">Even</span>'),
    'Structure': (4, '<strong class="os">OpenSpec</strong>: one place for each booking rule, checked in the service'),
    'Duplication': (4, '<strong class="sk">Spec Kit</strong> and <strong class="ck">CyberRock kit</strong>: form rules shared in one schema'),
    'Potential bugs': (3, '<span class="tie">Even score</span>; the CyberRock kit has the fewest known bugs, OpenSpec has no high one'),
    'Security': (4, '<strong class="os">OpenSpec</strong>: Spec Kit has two input-validation gaps; the CyberRock kit refuses some valid dates'),
    'Rule compliance': (4, '<strong class="os">OpenSpec</strong> and <strong class="sk">Spec Kit</strong>: the CyberRock kit has one test file over 200 lines'),
    'Tests': (4, '<strong class="ck">CyberRock kit</strong>: the only one that tests the locks against a real database'),
    'Maintainability': (4, '<strong class="os">OpenSpec</strong> and <strong class="ck">CyberRock kit</strong>: plain ORM calls, one path for rules'),
    'Web front end': (4, '<strong class="os">OpenSpec</strong> and <strong class="ck">CyberRock kit</strong>: Spec Kit has two web bugs'),
}
for area, (score, edge) in SCORES.items():
    pattern = re.compile(r'(<tr><th>' + re.escape(area) + r'</th><td>.*?</td><td>.*?</td>)<td class="edge">(.*?)</td></tr>')
    assert len(pattern.findall(page)) == 1, area
    page = pattern.sub(lambda m: m.group(1) + pips(score) + '<td class="edge">' + both(edge, m.group(2)) + '</td></tr>', page)
rep('<td><span class="rating"><b class="s">37</b></span></td><td class="edge"><strong class="os">OpenSpec</strong> ahead in 4 areas, <strong class="sk">Spec Kit</strong> in 1, even in 5</td></tr>',
    '<td><span class="rating"><b class="s">37</b></span></td><td class="cr"><span class="rating"><b class="c">39</b></span></td><td class="edge">' + both('OpenSpec 40, CyberRock kit 39, Spec Kit 37: within what one reviewer differs from another', '<strong class="os">OpenSpec</strong> ahead in 4 areas, <strong class="sk">Spec Kit</strong> in 1, even in 5') + '</td></tr>')
rep('Each reviewer scored one kit; the cross-check found the scores consistent with the code, so none was changed.</p>',
    'Each reviewer scored one kit; the cross-check found the scores consistent with the code, so none was changed.<span class="cr"> The CyberRock kit was scored a day later by a third reviewer, whose brief asked explicitly for strictness.</span></p>')

# ---- bug table ---------------------------------------------------------------
rep('<h2>Potential bugs, checked in both kits</h2>', '<h2>' + both('Potential bugs, checked in all three kits', 'Potential bugs, checked in both kits') + '</h2>')
rep('means that kit\'s code prevents it.</p>', 'means that kit\'s code prevents it.<span class="cr"> <span class="chip part">reduced</span> means it can still happen, but in fewer cases.</span></p>')
rep('<thead><tr><th>Bug</th><th>Severity</th><th>OpenSpec</th><th>Spec Kit</th><th>Where</th></tr></thead>',
    '<thead><tr><th>Bug</th><th>Severity</th><th>OpenSpec</th><th>Spec Kit</th><th class="cr">CyberRock kit</th><th>Where</th></tr></thead>')
YES, NO, PART = '<span class="chip yes">has it</span>', '<span class="chip no">avoids it</span>', '<span class="chip part">reduced</span>'
ORDER = [NO, NO, PART, NO, NO, NO, NO, NO, NO, NO, YES, NO]
rows = re.compile(r'(<td><span class="chip (?:yes|no)">[^<]*</span></td><td><span class="chip (?:yes|no)">[^<]*</span></td>)(<td>)')
assert len(rows.findall(page)) == 12
chips = iter(ORDER)
page = rows.sub(lambda m: m.group(1) + f'<td class="cr">{next(chips)}</td>' + m.group(2), page)
rep("""<td><code>bookings-page.tsx</code> in both</td></tr>
        </tbody>""", """<td><code>bookings-page.tsx</code> in both</td></tr>
          <tr class="cr"><th>Network errors between the worker and the booking service use up the three confirmation attempts, so a booking can stay pending for good</th><td><span class="sev medium">medium</span></td><td>""" + YES + """</td><td>""" + YES + """</td><td class="cr">""" + YES + """</td><td>worker confirmation code in all three; rated low in OpenSpec's audit, missed in Spec Kit's</td></tr>
          <tr class="cr"><th>A valid time the contract accepts, for example without seconds, is refused with a 400</th><td><span class="sev medium">medium</span></td><td>""" + NO + """</td><td>""" + NO + """</td><td class="cr">""" + YES + """</td><td><code>booking-instant.ts:1-2</code> (CyberRock kit)</td></tr>
          <tr class="cr"><th>The only real proof of the concurrency guarantees can be skipped without anyone noticing</th><td><span class="sev medium">medium</span></td><td><span class="chip na">no such test</span></td><td><span class="chip na">no such test</span></td><td class="cr">""" + YES + """</td><td>line 11 of the <code>*.int.spec.ts</code> files (CyberRock kit)</td></tr>
        </tbody>""")
rep('is correct in both kits, including the last page and pages past the end.</p>', 'is correct in ' + both('all three kits', 'both kits') + ', including the last page and pages past the end.<span class="cr"> In the CyberRock kit the lost confirmation job is reduced, not gone: the queue call has a timeout, the caller gets a 503, and a retry queues the job again; a caller that never retries still leaves the booking pending. The last three rows are the CyberRock audit\'s own medium findings, looked for in the other two kits.</span></p>')

# ---- measured figures --------------------------------------------------------
rep('<thead><tr><th>Measure</th><th class="n">OpenSpec</th><th class="n">Spec Kit</th></tr></thead>', '<thead><tr><th>Measure</th><th class="n">OpenSpec</th><th class="n">Spec Kit</th><th class="n cr">CyberRock kit</th></tr></thead>')
FIGURES = {
    'Files changed, lines added': '84, +5,791', 'Source files / code lines': '45 / 1,580', 'Test files / test lines': '39 / 3,585',
    'Test lines per code line': '2.27', 'Build, lint, unit tests': 'pass, pass, pass', 'Unit tests run (whole app)': '429',
    'Unit-test line / branch coverage (whole app)': '97.7% / 94.4%', 'Average / highest function complexity': '1.73 / 11',
    'Functions with complexity above 5': '3', 'Duplicated source lines': 'not comparable (see note)', 'Raw SQL calls, all parameterised': '9, yes',
    'Files over 200 lines': '1 (a test file)', 'Lines a cleanup could remove': 'about 510, nearly all tests',
}
for label, value in FIGURES.items():
    pattern = re.compile(r'(<tr><th>' + re.escape(label) + r'</th><td class="n">[^<]*</td><td class="n">[^<]*</td>)</tr>')
    assert len(pattern.findall(page)) == 1, label
    page = pattern.sub(lambda m: m.group(1) + f'<td class="n cr">{value}</td></tr>', page)
rep('lint suppressions)</th><td class="n">0</td><td class="n">0</td></tr>', 'lint suppressions)</th><td class="n">0</td><td class="n">0</td><td class="n cr">0</td></tr>')
rep("""<td class="n cr">about 510, nearly all tests</td></tr>
        </tbody>""", """<td class="n cr">about 510, nearly all tests</td></tr>
          <tr class="cr"><th>Test files that run against a real Postgres</th><td class="n">0</td><td class="n">0</td><td class="n cr">6 (38 tests)</td></tr>
          <tr class="cr"><th>Database constraint behind the no-overlap rule</th><td class="n">no</td><td class="n">no</td><td class="n cr">yes</td></tr>
        </tbody>""")
rep('<p class="prose note"> Build and test times were a single run', '<p class="prose note cr">CyberRock kit figures were collected a day later with scripts that reproduce the file, test, complexity and SQL counts above. Duplication was measured by a different rule: by that rule OpenSpec is 3.2%, Spec Kit 6.0% and the CyberRock kit 2.1%. Its coverage was measured with its database running, because its real-database tests run in the same command.</p>\n    <p class="prose note"> Build and test times were a single run')

# ---- by area -----------------------------------------------------------------
rep('<thead><tr><th>Area</th><th>Both kits</th><th class="os">OpenSpec only</th><th class="sk">Spec Kit only</th></tr></thead>',
    '<thead><tr><th>Area</th><th>' + both('OpenSpec and Spec Kit share', 'Both kits') + '</th><th class="os">OpenSpec only</th><th class="sk">Spec Kit only</th><th class="ck cr">CyberRock kit</th></tr></thead>')
AREAS = {
    'Code quality': 'Small pure functions for parsing and merging input, typed results, one complete <code>switch</code>. Rejects <code>null</code> dates.',
    'Code smells': 'No unused <code>response_status</code> column. Its own: a "pipe" that is not used as a pipe, and a gateway service that receives the HTTP response object.',
    'Structure': 'One overlap check and one time-order check shared by create and update. They run inside the repository, because the merge has to happen inside the lock.',
    'Duplication': 'One form schema and one fields component for both forms. Its copies are in tests: the real-database tests repeat the same setup four times.',
    'Security': 'Rejects <code>null</code>, times without a time zone and unusual date forms. Too strict in one place: valid times without seconds are refused.',
    'Tests': 'Runs the double-booking race against a real Postgres, including a case that fails when the lock is removed. Those tests can be skipped silently, and about 400 lines of other tests only check which database calls were made.',
    'Extending it': 'A new rule goes in one place. A new field goes in one shared form schema; the fingerprint lists fields by hand, so one can be missed.',
    'Web front end': 'Keeps the retry key while the outcome is unknown, recovers after a delete, sends only the fields an edit changed, loads all rooms. Gaps: the status column goes stale, a delete error stays on screen, delete has no confirmation.',
}
for area, text in AREAS.items():
    pattern = re.compile(r'(<tr><th>' + re.escape(area) + r'</th><td>[^\n]*?</td><td>[^\n]*?</td><td>[^\n]*?</td>)</tr>(?=\n          <tr><th>|\n        </tbody>\n      </table>\n    </div>\n  </section>\n\n  <section>\n    <h2>Strengths)')
    assert len(pattern.findall(page)) == 1, area
    page = pattern.sub(lambda m: m.group(1) + f'<td class="cr">{text}</td></tr>', page)

# ---- strengths and weaknesses ------------------------------------------------
rep("""          <li>Weaker: raw SQL with a hand-kept column list, and rules split across layers.</li>
        </ul></div>
    </div>""", """          <li>Weaker: raw SQL with a hand-kept column list, and rules split across layers.</li>
        </ul></div>
      <div class="panel c cr"><h3 class="ck">CyberRock kit</h3>
        <ul>
          <li>Overlap is stopped twice: a room lock and a database constraint, both answering the same 409.</li>
          <li>The retry key, the booking and the stored answer are saved in one transaction.</li>
          <li>Edits lock the row, merge inside the lock and write only what changed.</li>
          <li>The guarantees are tested against a real Postgres with real concurrency.</li>
          <li>The web form keeps its retry key, sends only changed fields and recovers after a delete.</li>
          <li>Weaker: a booking can be saved while the caller is told it failed; its confirmation is then sent only if the caller retries.</li>
          <li>Weaker: valid times without seconds are refused.</li>
          <li>Weaker: the real-database tests can be skipped silently, and about 510 lines of tests could be removed.</li>
        </ul></div>
    </div>""")

# ---- recommendation, method, limits -----------------------------------------
rep("""        <li>A review of each change with the <code>lean-review</code> skill or the code-reviewer agent.</li>
      </ol>
    </div>
    </div>
  </section>""", """        <li>A review of each change with the <code>lean-review</code> skill or the code-reviewer agent.</li>
      </ol>
    </div>
    <div class="stack cr">
      <h3>What the CyberRock kit's code adds to this picture</h3>
      <ol>
        <li><strong>It did the four things on the list above.</strong> Its code has the real-Postgres test, the database constraint and a review of each change; the retry for lost confirmations is only half done.</li>
        <li><strong>Its bug catalogue worked where the bug was in it.</strong> Ten of the twelve known bugs are gone.</li>
        <li><strong>It did not stop new mistakes.</strong> Three of its four medium findings are in areas the catalogue covers. A rule prevents the bug it describes, not the one next to it.</li>
        <li><strong>Its extra tests are a cost as well as a gain.</strong> It wrote 62% more test code than OpenSpec. The real-database tests are what this audit asked for; about 400 lines of call-checking tests next to them are not.</li>
        <li><strong>OpenSpec is still the leanest,</strong> with the least code and the highest score. Whether the CyberRock kit is worth piloting is a question of cost and process as well as code; the <a href="https://claude.ai/artifact/Gi22wVojhqjsC6xLPfDSY3" target="_blank" rel="noopener">evaluation</a> covers that, including four defects in the kit itself.</li>
      </ol>
    </div>
    </div>
  </section>""")
rep("""      <li><strong>Read-only.</strong> Neither copy was changed.</li>
    </ul>""", """      <li><strong>Read-only.</strong> Neither copy was changed.</li>
      <li class="cr"><strong>The CyberRock kit, a day later.</strong> One more reviewer with the same checklist, able to see only that kit and none of the reports. All four of its medium findings were re-read in the code, the twelve known bugs were checked in it line by line, and its medium findings were looked for in the other two kits.</li>
    </ul>""")
rep("""      <li><strong>Judged against the brief,</strong> not against each kit's own specification documents.</li>
    </ul>""", """      <li><strong>Judged against the brief,</strong> not against each kit's own specification documents.</li>
      <li class="cr"><strong>The CyberRock kit was built knowing this audit's findings.</strong> Avoiding them is its purpose; it does not show the same result on code nobody has audited yet.</li>
      <li class="cr"><strong>Its reviewer was asked to be strict,</strong> which may explain part of its 14 small findings. Those small findings were not looked for in the other two kits.</li>
      <li class="cr"><strong>Concurrency was run for the CyberRock kit only,</strong> through its own real-database tests (38 tests, all passing).</li>
    </ul>""")

# ---- per-kit audit of the CyberRock kit --------------------------------------
def inline(text):
    text = html.escape(text, quote=False)
    text = re.sub(r'`([^`]+)`', r'<code>\1</code>', text)
    return re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', text)


def audit_html(lines):
    out, i = [], 1
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
            continue
        heading = re.match(r'^(#{2,3}) (.+)$', line)
        if heading:
            level = len(heading.group(1)) + 1
            out.append(f'<h{level} id="audit-cyberrock-{re.sub(r"[^a-z0-9]+", "-", heading.group(2).lower()).strip("-")}">{inline(heading.group(2))}</h{level}>')
            i += 1
        elif line.startswith('|'):
            j = i
            while j < len(lines) and lines[j].startswith('|'):
                j += 1
            cells = [[c.strip() for c in r.strip().strip('|').split('|')] for r in lines[i:j]]
            out.append('<div class="scroll"><table><thead><tr>' + ''.join(f'<th>{inline(c)}</th>' for c in cells[0]) + '</tr></thead><tbody>'
                       + ''.join('<tr>' + ''.join(f'<td>{inline(c)}</td>' for c in r) + '</tr>' for r in cells[2:]) + '</tbody></table></div>')
            i = j
        elif re.match(r'^\d+\. ', line):
            number = int(line.split('.')[0])
            item, subs, i = re.sub(r'^\d+\. ', '', line), [], i + 1
            while i < len(lines) and re.match(r'^\s+- ', lines[i]):
                subs.append(re.sub(r'^\s+- ', '', lines[i]))
                i += 1
            nested = '<ul>' + ''.join(f'<li>{inline(s)}</li>' for s in subs) + '</ul>' if subs else ''
            out.append(f'<ol start="{number}"><li>{inline(item)}{nested}</li></ol>')
        elif line.startswith('- '):
            items = []
            while i < len(lines) and line_is_bullet(lines[i]):
                items.append(lines[i][2:])
                i += 1
            out.append('<ul>' + ''.join(f'<li>{inline(x)}</li>' for x in items) + '</ul>')
        else:
            out.append(f'<p>{inline(line)}</p>')
            i += 1
    return '\n'.join(out)


def line_is_bullet(line):
    return line.startswith('- ')


audit = audit_html((ROOT / 'plans' / 'reports' / 'cyberrock-variant-code-audit.md').read_text().split('\n'))
rep("<p>The two reviewers' reports, unedited.", "<p>" + both("The three reviewers' reports, unedited.", "The two reviewers' reports, unedited."))
rep("<!-- KIT-AUDITS:END -->", """  <section class="panel evidence c cr" id="audit-cyberrock">
    <p class="eyebrow">Per-kit audit · <code>plans/reports/cyberrock-variant-code-audit.md</code></p>
    <h2 class="ck">CyberRock kit: full audit</h2>
""" + audit + """
  </section>
<!-- KIT-AUDITS:END -->""")

# ---- footer and switch script ------------------------------------------------
rep("""    <p>Reviewed on 11 November 2026, from the code at each copy's final tag.</p>""", """    <p>Reviewed on 11 November 2026, from the code at each copy's final tag. Author: Dai Ho · contact@daiho.tech</p>""")
page = page.rstrip('\n') + """

<script>
  (function () {
    var three = document.getElementById('view-three');
    var two = document.getElementById('view-two');
    function show(view, writeHash) {
      var isTwo = view === 'two-kits';
      document.body.classList.toggle('view-two', isTwo);
      three.setAttribute('aria-pressed', String(!isTwo));
      two.setAttribute('aria-pressed', String(isTwo));
      if (writeHash) { location.hash = view; }
    }
    function fromHash() {
      var name = location.hash.replace('#', '');
      if (name === 'two-kits' || name === 'three-kits') { show(name, false); }
    }
    three.addEventListener('click', function () { show('three-kits', true); });
    two.addEventListener('click', function () { show('two-kits', true); });
    window.addEventListener('hashchange', fromHash);
    fromHash();
  })();
</script>
"""
Path(sys.argv[2]).write_text(page)
print('written', sys.argv[2], len(page), 'bytes;', page.count('class="cr"') + page.count(' cr"'), 'CyberRock-only elements')
