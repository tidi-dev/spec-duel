import { SCENE_INTROS } from './scene-intros.js';

const KITS = ['openspec', 'speckit'];
const KIT_NAMES = { openspec: 'OpenSpec', speckit: 'Spec Kit' };
const PLAYBACK_SECONDS = 120;
const PHASE_NAMES = { setup: 'Setup', specify: 'Specify', plan: 'Plan', check: 'Check', implement: 'Implement', close: 'Close' };

const STEP_DESCRIPTIONS = {
  openspec: {
    propose: 'Reads the brief and the code, then writes the proposal, design, specs and task list',
    validate: 'Checks the spec files with the OpenSpec command line; no AI, under a second',
    apply: 'Writes the code and tests, working through its task list',
    archive: 'Merges this change into the living specs and files the change away',
  },
  speckit: {
    specify: 'Reads the brief and writes the specification: requirements, scenarios, success criteria',
    clarify: 'Looks for unclear points in the specification and settles them',
    plan: 'Researches the code, then writes the technical plan, data model and contracts',
    tasks: 'Breaks the plan into a numbered task list and marks tasks that can run in parallel',
    analyze: 'AI check: compares the spec, plan and tasks with each other and with the project rules',
    implement: 'Writes the code and tests, working through its task list',
  },
};

const ROUND_NOTES = {
  'openspec:1:apply:2': 'Continues the same work after the account usage limit cut the first part off',
  'openspec:1:archive:2': 'Answers the confirmation question the first attempt stopped on',
  'openspec:1:archive:3': 'Runs again with the answers given up front, after the second attempt was blocked',
};

const describeStep = (kitName, change, phase) =>
  ROUND_NOTES[`${kitName}:${change}:${phase.step}:${phase.round}`] ?? STEP_DESCRIPTIONS[kitName]?.[phase.step] ?? '';

const GROUP_ORDER = ['baseline', 'change-1', 'change-2', 'change-3'];
const GROUP_NAMES = { baseline: 'baseline (health, rooms)', 'change-1': 'change 1 (bookings)', 'change-2': 'change 2 (no overlap)', 'change-3': 'change 3 (room paging)' };

const WHY_REASONS = {
  1: [
    ['It plans in more steps and writes more.', "Its plan and tasks steps alone took 11:40, producing a technical plan, research notes, a data model, three contract files, a quickstart and 91 tasks, against OpenSpec's 34."],
    ['Its check is an AI session.', "analyze cross-checks spec, plan and tasks in 3:56; OpenSpec's check is a command-line format check that takes under a second."],
  ],
  2: [
    ['It writes a complete new spec for the change; OpenSpec only writes what changes.', 'OpenSpec added 585 lines of notes against its existing specs in one step. Spec Kit started a fresh spec folder with its own plan, research, data model, contracts, quickstart and 30 tasks: 1,265 lines over four steps. Spec Kit actually wrote the code slightly faster.'],
    ['The AI check again.', '3:00, against under a second.'],
  ],
  3: [
    ['It ran its full feature process for a 2-line fix.', "Its plan and tasks steps alone (4:43) took longer than OpenSpec's whole run (3:56): research, a data model, two contract files, a quickstart and 15 tasks, 900 lines against OpenSpec's 4 tasks and 225 lines."],
    ['More tasks meant longer coding.', "With 15 tasks, including verification steps, it wrote a 47-line test against OpenSpec's 11 lines: 2:28 against 1:20 for the same fix, plus 1:23 for the AI check."],
  ],
};

const WHY_PHASES = [
  ['Specify and plan', ['specify', 'plan']],
  ['Check', ['check']],
  ['Implement', ['implement']],
  ['Close', ['close']],
];

const phaseTime = (kit, names) => {
  const steps = kit.phases.filter((phase) => names.includes(phase.phase));
  if (steps.length === 0) {
    return 'none';
  }
  const ms = steps.reduce((sum, phase) => sum + (phase.endMs - phase.startMs), 0);
  return ms < 1000 ? 'under 1 s' : clock(ms);
};

const renderWhy = (scene) => {
  const section = $('#why');
  const [openspec, speckit] = [scene.kits.openspec, scene.kits.speckit];
  const reasons = WHY_REASONS[scene.change];
  if (!reasons || openspec.status === 'missing' || speckit.status === 'missing' || speckit.totals.wallMs <= openspec.totals.wallMs) {
    section.hidden = true;
    return;
  }
  const gapSeconds = Math.round(speckit.totals.wallMs / 1000) - Math.round(openspec.totals.wallMs / 1000);
  $('#why-title').textContent = `Why Spec Kit took ${clock(gapSeconds * 1000)} longer`;
  const table = $('#why-table');
  table.replaceChildren();
  const head = el('tr');
  head.append(el('th', '', 'Phase'), el('th', 'num', 'OpenSpec'), el('th', 'num', 'Spec Kit'));
  table.append(head);
  for (const [label, names] of WHY_PHASES) {
    const row = el('tr');
    row.append(el('th', '', label), el('td', 'num', phaseTime(openspec, names)), el('td', 'num', phaseTime(speckit, names)));
    table.append(row);
  }
  $('#why-reasons').replaceChildren(
    ...reasons.map(([lead, detail]) => {
      const item = el('li');
      item.append(el('strong', '', lead), ` ${detail}`);
      return item;
    }),
  );
  section.hidden = false;
};

const stepLabel = (phase) => `${phase.step}${phase.round > 1 ? ` (round ${phase.round})` : ''}`;

const $ = (selector, root = document) => root.querySelector(selector);

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
};

const clock = (ms) => {
  const total = Math.round(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
};

const filesLabel = (count) => `${count} ${count === 1 ? 'file' : 'files'}`;
const number = (value) => Math.round(value).toLocaleString('en-US');
const money = (value) => `$${value.toFixed(2)}`;
const allTokens = (totals) => totals.inputTokens + totals.outputTokens + totals.cacheReadTokens + totals.cacheCreationTokens;

const state = { scenes: [], scene: null, timer: null, simulated: 0, speed: 1, shown: { openspec: 0, speckit: 0 } };

const roomsTable = (response, caption) => {
  const table = el('table');
  table.append(el('caption', '', caption));
  const head = el('tr');
  head.append(el('th', '', 'Name'), el('th', 'num', 'Capacity'));
  table.append(head);
  for (const room of response?.items ?? []) {
    const row = el('tr');
    row.append(el('td', '', room.name), el('td', 'num', String(room.capacity)));
    table.append(row);
  }
  return table;
};

const renderResult = (pane, kit) => {
  pane.replaceChildren();
  if (!kit.verify && !kit.acceptance && !kit.diffStat) {
    pane.append(el('p', 'empty', 'No result recorded.'));
    return;
  }
  const table = el('table');
  const add = (label, value, className) => {
    const row = el('tr');
    row.append(el('th', '', label), el('td', className ?? '', value));
    table.append(row);
  };
  for (const name of ['build', 'lint', 'test']) {
    const check = kit.verify?.[name];
    if (check) {
      add(name[0].toUpperCase() + name.slice(1), check.exit === 0 ? `passed${check.detail ? ` (${check.detail})` : ''}` : `failed${check.detail ? ` (${check.detail})` : ''}`, check.exit === 0 ? 'ok' : 'fail');
    }
  }
  if (kit.acceptance) {
    add('Acceptance tests', `${kit.acceptance.passed} of ${kit.acceptance.total} passed`, kit.acceptance.passed === kit.acceptance.total ? 'ok' : 'fail');
    const groups = Object.entries(kit.acceptance.groups ?? {}).sort(([left], [right]) => GROUP_ORDER.indexOf(left) - GROUP_ORDER.indexOf(right));
    for (const [group, counts] of groups) {
      add(`· ${GROUP_NAMES[group] ?? group}`, `${counts.passed} of ${counts.passed + counts.failed}`);
    }
  }
  if (kit.diffStat) {
    add('Kit documents', `${filesLabel(kit.diffStat.kit.files)}, +${kit.diffStat.kit.added} lines (listed in the Documents tab)`);
    add('Code', `${filesLabel(kit.diffStat.code.files)}, +${kit.diffStat.code.added} / −${kit.diffStat.code.deleted} lines`);
    add('Tests', `${filesLabel(kit.diffStat.tests.files)}, +${kit.diffStat.tests.added} lines`);
  }
  pane.append(table);
};

const renderDocs = (root, kit) => {
  const list = $('.doc-list', root);
  const body = $('.doc-body', root);
  list.replaceChildren(el('p', 'doc-count', `${kit.documents.length} ${kit.documents.length === 1 ? 'file' : 'files'} the kit wrote or changed in this change`));
  body.textContent = '';
  if (kit.documents.length === 0) {
    body.textContent = 'No documents recorded for this change.';
    return;
  }
  kit.documents.forEach((doc, index) => {
    const button = el('button', index === 0 ? 'on' : '', doc.title);
    button.type = 'button';
    button.addEventListener('click', () => {
      list.querySelectorAll('button').forEach((other) => other.classList.toggle('on', other === button));
      body.textContent = doc.content;
    });
    list.append(button);
  });
  body.textContent = kit.documents[0].content;
};

const renderKit = (name, kit) => {
  const root = $(`#kit-${name}`);
  root.replaceChildren($('#kit-template').content.cloneNode(true));
  $('.kit-name', root).textContent = KIT_NAMES[name];
  const badge = $('.badge', root);
  if (kit.status === 'missing') {
    badge.textContent = 'Not recorded';
    badge.classList.add('missing');
    $('.phase-now', root).textContent = 'No recording for this scene.';
    $('.clock-of', root).textContent = '';
    return;
  }
  badge.textContent = kit.status === 'partial' ? 'Recording incomplete' : 'Ready';
  badge.classList.toggle('missing', kit.status === 'partial');
  $('.clock-of', root).textContent = `of ${clock(kit.totals.wallMs)} real time`;
  $('.step-count', root).textContent = `${kit.phases.length} steps`;
  const strip = $('.strip', root);
  for (const phase of kit.phases) {
    const segment = el('div', 'seg');
    segment.style.flexGrow = String(Math.max(1, phase.endMs - phase.startMs));
    segment.title = `${PHASE_NAMES[phase.phase] ?? phase.phase} · ${stepLabel(phase)}, ${clock(phase.endMs - phase.startMs)}: ${describeStep(name, state.scene.change, phase)}`;
    segment.append(el('i'));
    strip.append(segment);
  }
  const steps = $('.steps', root);
  kit.phases.forEach((phase, index) => {
    const item = el('li');
    const box = el('button', 'step pending');
    box.type = 'button';
    box.title = `${stepLabel(phase)}: ${describeStep(name, state.scene.change, phase)}`;
    box.setAttribute('aria-expanded', 'false');
    box.append(
      el('span', 'step-phase', `${index + 1} ${PHASE_NAMES[phase.phase] ?? phase.phase}`),
      el('span', 'step-name', phase.round > 1 ? `${phase.step} (${phase.round})` : phase.step),
      el('span', 'step-time', clock(phase.endMs - phase.startMs)),
    );
    box.addEventListener('click', () => toggleStepDetail(root, name, kit, index));
    item.append(box);
    steps.append(item);
  });
  root.querySelectorAll('.tabs button').forEach((button) =>
    button.addEventListener('click', () => {
      root.querySelectorAll('.tabs button').forEach((other) => other.classList.toggle('on', other === button));
      for (const tab of ['feed', 'docs', 'result']) {
        $(`.pane-${tab}`, root).hidden = tab !== button.dataset.tab;
      }
    }),
  );
  renderDocs(root, kit);
  renderResult($('.pane-result', root), kit);
};

const paintKit = (name, kit, at) => {
  if (kit.status === 'missing') {
    return true;
  }
  const root = $(`#kit-${name}`);
  const end = kit.totals.wallMs;
  const now = Math.min(at, end);
  $('.clock-now', root).textContent = clock(now);
  let tokens = 0;
  let cost = 0;
  let turns = 0;
  let current = null;
  let currentIndex = -1;
  kit.phases.forEach((phase, index) => {
    const span = Math.max(1, phase.endMs - phase.startMs);
    const share = Math.min(1, Math.max(0, (now - phase.startMs) / span));
    root.querySelectorAll('.seg > i')[index].style.width = `${share * 100}%`;
    const item = root.querySelectorAll('.steps .step')[index];
    item.classList.toggle('done', share >= 1);
    item.classList.toggle('running', share > 0 && share < 1);
    item.classList.toggle('pending', share <= 0);
    tokens += phase.tokens * share;
    cost += phase.costUsd * share;
    turns += phase.turns * share;
    if (share > 0 && share < 1) {
      current = phase;
      currentIndex = index;
    }
  });
  const finished = now >= end;
  const totals = kit.totals;
  $('.c-tokens', root).textContent = number(finished ? allTokens(totals) : (tokens / Math.max(1, totals.inputTokens + totals.outputTokens)) * allTokens(totals));
  $('.c-cost', root).textContent = money(finished ? totals.costUsd : cost);
  $('.c-turns', root).textContent = number(finished ? totals.turns : turns);
  const phaseNow = $('.phase-now', root);
  const stepCount = $('.step-count', root);
  const stepDesc = $('.step-desc', root);
  phaseNow.replaceChildren();
  if (finished) {
    phaseNow.textContent = `Finished in ${clock(end)}`;
    stepCount.textContent = `${kit.phases.length} of ${kit.phases.length} steps done`;
    stepDesc.textContent = '';
  } else if (current) {
    phaseNow.append(`${PHASE_NAMES[current.phase] ?? current.phase} `, el('small', '', `· ${stepLabel(current)}`));
    stepCount.textContent = `Step ${currentIndex + 1} of ${kit.phases.length}`;
    stepDesc.textContent = describeStep(name, state.scene.change, current);
  }
  const feed = $('.feed', root);
  const files = new Set();
  while (state.shown[name] < kit.events.length && kit.events[state.shown[name]].atMs <= now) {
    const event = kit.events[state.shown[name]];
    feed.append(el('li', event.kind, event.label));
    state.shown[name] += 1;
  }
  for (const event of kit.events.slice(0, state.shown[name])) {
    if (event.kind === 'file') {
      files.add(event.label);
    }
  }
  $('.c-files', root).textContent = String(files.size);
  $('.pane-feed', root).scrollTop = $('.pane-feed', root).scrollHeight;
  const badge = $('.badge', root);
  badge.textContent = finished ? 'Finished' : 'Running';
  badge.classList.toggle('done', finished);
  return finished;
};

const summaryRow = (label, values, lowerIsBetter = true) => {
  const row = el('tr');
  row.append(el('th', '', label));
  const numbers = values.map((value) => value?.sort);
  values.forEach((value, index) => {
    const other = numbers[1 - index];
    const better = lowerIsBetter !== null && value && other !== undefined && value.sort !== other && (lowerIsBetter ? value.sort < other : value.sort > other);
    row.append(el('td', `num${better ? ' ok' : ''}`, value ? value.text : 'not recorded'));
  });
  return row;
};

const renderSummary = (scene) => {
  const kits = KITS.map((name) => (scene.kits[name].status === 'missing' ? null : scene.kits[name]));
  const table = $('#summary-table');
  table.replaceChildren();
  const head = el('tr');
  head.append(el('th', '', ''), el('th', 'num', 'OpenSpec'), el('th', 'num', 'Spec Kit'));
  table.append(head);
  const cell = (pick, format) => kits.map((kit) => (kit ? { sort: pick(kit), text: format(pick(kit)) } : null));
  table.append(
    summaryRow('Real time', cell((kit) => kit.totals.wallMs, clock)),
    summaryRow('Tokens (all kinds)', cell((kit) => allTokens(kit.totals), number)),
    summaryRow('Cost', cell((kit) => kit.totals.costUsd, money)),
    summaryRow('Turns', cell((kit) => kit.totals.turns, number)),
    summaryRow('Steps run', cell((kit) => kit.phases.length, String), null),
    summaryRow('Kit documents written (lines)', cell((kit) => kit.diffStat?.kit.added ?? 0, number), null),
    summaryRow('Questions the kit asked', cell((kit) => kit.totals.questions, String)),
    summaryRow('Re-prompts needed', cell((kit) => kit.totals.reprompts, String)),
    summaryRow('Acceptance tests passed', kits.map((kit) => (kit?.acceptance ? { sort: kit.acceptance.passed, text: `${kit.acceptance.passed} of ${kit.acceptance.total}` } : null)), false),
  );
  $('#summary').hidden = false;
};

const renderAfter = (scene) => {
  const grid = $('#after-rooms');
  grid.replaceChildren();
  let any = false;
  for (const name of KITS) {
    const after = scene.kits[name].after;
    if (!after) {
      continue;
    }
    any = true;
    const box = el('div', 'rooms');
    box.append(roomsTable(after, `${KIT_NAMES[name]}: page 2 with 5 per page, after its fix`));
    grid.append(box);
  }
  $('#after').hidden = !any;
};

const stop = () => {
  clearInterval(state.timer);
  state.timer = null;
  $('#run').disabled = false;
};

const tick = () => {
  state.simulated = (performance.now() - state.startedAt) * state.speed;
  const done = KITS.map((name) => paintKit(name, state.scene.kits[name], state.simulated));
  if (done.every(Boolean)) {
    stop();
    renderSummary(state.scene);
    renderWhy(state.scene);
    if (state.scene.change === '3') {
      renderAfter(state.scene);
    }
  }
};

const toggleStepDetail = (root, name, kit, index) => {
  const detail = $('.step-detail', root);
  const boxes = [...root.querySelectorAll('.steps .step')];
  const closing = boxes[index].classList.contains('selected');
  boxes.forEach((box, i) => {
    const selected = !closing && i === index;
    box.classList.toggle('selected', selected);
    box.setAttribute('aria-expanded', String(selected));
  });
  if (closing) {
    detail.replaceChildren();
    alignStepAreas();
    return;
  }
  const phase = kit.phases[index];
  const heading = el('p', 'step-detail-head');
  heading.append(
    el('strong', '', `Step ${index + 1} of ${kit.phases.length} · ${PHASE_NAMES[phase.phase] ?? phase.phase} · ${stepLabel(phase)}`),
    el('span', 'step-detail-figures', `${phase.endMs - phase.startMs < 1000 ? 'under 1 s' : clock(phase.endMs - phase.startMs)} · ${money(phase.costUsd)} · ${phase.turns} ${phase.turns === 1 ? 'turn' : 'turns'}`),
  );
  const close = el('button', 'step-detail-close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close step details');
  close.addEventListener('click', () => toggleStepDetail(root, name, kit, index));
  heading.append(close);
  detail.replaceChildren(heading, el('p', 'step-detail-text', describeStep(name, state.scene.change, phase)));
  alignStepAreas();
};

const matchHeights = (elements) => {
  elements.forEach((element) => {
    element.style.minHeight = '';
  });
  const tallest = Math.max(0, ...elements.map((element) => element.offsetHeight));
  elements.forEach((element) => {
    element.style.minHeight = `${tallest}px`;
  });
};

const alignStepAreas = () => {
  matchHeights(KITS.map((name) => $(`#kit-${name} .steps`)).filter(Boolean));
  const details = KITS.map((name) => $(`#kit-${name} .step-detail`)).filter(Boolean);
  const anyOpen = details.some((detail) => detail.hasChildNodes());
  details.forEach((detail) => {
    detail.hidden = !anyOpen;
    detail.classList.toggle('spacer', !detail.hasChildNodes());
  });
  if (anyOpen) matchHeights(details);
};

window.addEventListener('resize', () => alignStepAreas());

const resetScene = () => {
  stop();
  state.simulated = 0;
  state.shown = { openspec: 0, speckit: 0 };
  $('#summary').hidden = true;
  $('#why').hidden = true;
  $('#after').hidden = true;
  for (const name of KITS) {
    renderKit(name, state.scene.kits[name]);
  }
  alignStepAreas();
};

const play = () => {
  resetScene();
  const longest = Math.max(...KITS.map((name) => state.scene.kits[name].totals?.wallMs ?? 0));
  if (longest === 0) {
    $('#hint').textContent = 'Nothing is recorded for this scene yet.';
    return;
  }
  state.speed = Math.max(1, longest / (PLAYBACK_SECONDS * 1000));
  $('#hint').textContent = `Playing at ${state.speed.toFixed(state.speed < 10 ? 1 : 0)}× speed.`;
  $('#run').disabled = true;
  state.startedAt = performance.now();
  state.timer = setInterval(tick, 100);
};

const withCode = (text) =>
  text.split(/`([^`]+)`/).map((part, index) => (index % 2 ? el('code', '', part) : document.createTextNode(part)));

const renderIntro = (change) => {
  const intro = SCENE_INTROS[change];
  $('#intro').hidden = !intro;
  if (!intro) {
    return;
  }
  const listItem = (line) => {
    const item = el('li');
    item.append(...withCode(line));
    return item;
  };
  $('#intro-purpose').replaceChildren(...withCode(intro.purpose));
  $('#intro-start').replaceChildren(...intro.start.map(listItem));
  $('#intro-job').replaceChildren(...intro.job.map(listItem));
  $('#intro-shows').replaceChildren(...withCode(intro.shows));
};

const loadScene = async (change) => {
  const scene = await (await fetch(`/api/scenes/${change}`)).json();
  state.scene = scene;
  renderIntro(change);
  document.querySelectorAll('#scenes button').forEach((button) => button.classList.toggle('on', button.dataset.change === change));
  $('#run').textContent = change === '3' ? 'Run bugfix' : `Play: ${scene.title.toLowerCase()}`;
  const banner = $('#banner');
  banner.replaceChildren();
  const longest = Math.max(...KITS.map((name) => scene.kits[name].totals?.wallMs ?? 0));
  if (scene.recordedAt) {
    banner.append(
      el('strong', '', 'Recorded run. '),
      `Recorded ${new Date(scene.recordedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}. The longer kit took ${clock(longest)} of real time; playback fits it into about two minutes. Every figure and document shown is from the real run.`,
    );
  } else {
    banner.textContent = 'This scene has not been recorded yet.';
  }
  const before = scene.kits.openspec.before ?? scene.kits.speckit.before;
  $('#before').hidden = !(change === '3' && before);
  if (change === '3' && before) {
    $('#before-rooms').replaceChildren(roomsTable(before, 'What the page shows today: page 2 with 5 per page'));
  }
  $('#hint').textContent = '';
  resetScene();
};

const start = async () => {
  state.scenes = await (await fetch('/api/scenes')).json();
  const nav = $('#scenes');
  for (const scene of state.scenes) {
    const button = el('button', '', scene.title);
    button.type = 'button';
    button.dataset.change = scene.change;
    button.addEventListener('click', () => loadScene(scene.change));
    nav.append(button);
  }
  $('#run').addEventListener('click', play);
  $('#reset').addEventListener('click', resetScene);
  await loadScene(new URLSearchParams(location.search).get('scene') ?? '1');
};

start();
