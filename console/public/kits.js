export const KITS = ['openspec', 'speckit', 'cyberrock'];
export const KIT_NAMES = { openspec: 'OpenSpec', speckit: 'Spec Kit', cyberrock: 'CyberRock kit' };

export const STEP_DESCRIPTIONS = {
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
  cyberrock: {
    propose: 'Reads the brief and the code, picks the tier, then writes one change file: numbered requirements, design decisions, risk table and tasks. A bugfix is fixed, tested and archived in this same step',
    validate: 'Checks the change file and the living specs with the kit script; no AI, under a second',
    apply: 'Writes the code and tests test-first, has the diff reviewed once against the risk catalogue, then merges the change into the living specs with the kit script',
  },
};

// Phases a step also carries out, beyond the one it is filed under.
export const alsoCovers = (kitName, kit, phase) => {
  if (kitName !== 'cyberrock') {
    return [];
  }
  if (phase.step === 'apply') {
    return ['close'];
  }
  const codeChanged = (kit.diffStat?.code.files ?? 0) > 0;
  const hasApply = kit.phases.some((other) => other.step === 'apply');
  return phase.step === 'propose' && codeChanged && !hasApply ? ['implement', 'close'] : [];
};

export const ROUND_NOTES = {
  'openspec:1:archive:2': 'Answers the confirmation question the first attempt stopped on',
  'openspec:1:archive:3': 'Runs again with the answers given up front, after the second attempt was blocked',
};

export const WHY_REASONS = {
  1: [
    {
      slower: 'speckit',
      faster: 'openspec',
      points: [
        ['It plans in more steps and writes more.', "Its plan and tasks steps alone took 11:40, producing a technical plan, research notes, a data model, three contract files, a quickstart and 91 tasks, against OpenSpec's 34."],
        ['Its check is an AI session.', "analyze cross-checks spec, plan and tasks in 3:56; OpenSpec's check is a command-line format check that takes under a second."],
      ],
    },
    {
      slower: 'cyberrock',
      faster: 'openspec',
      points: [
        ['Its implement step did more work and was interrupted once.', 'Implementing took 28:56 against 20:01. It wrote 3,201 lines of tests against 2,254, including 17 tests that run against the real database, then had the diff reviewed and fixed three of the four findings. Its backend agent ran past the 10-minute limit Claude Code gives background agents in a headless session and had to be resumed.'],
        ['It was faster before and after the code.', "Planning took 5:34 against 6:50, and merging the change into the living specs is a script inside the implement step, where OpenSpec's archive took 1:39 over three attempts."],
      ],
    },
  ],
  2: [
    {
      slower: 'speckit',
      faster: 'openspec',
      points: [
        ['It writes a complete new spec for the change; OpenSpec only writes what changes.', 'OpenSpec added 585 lines of notes against its existing specs in one step. Spec Kit started a fresh spec folder with its own plan, research, data model, contracts, quickstart and 30 tasks: 1,265 lines over four steps. Spec Kit actually wrote the code slightly faster.'],
        ['The AI check again.', '3:00, against under a second.'],
      ],
    },
    {
      slower: 'cyberrock',
      faster: 'openspec',
      points: [
        ['Faster planning, slower implementing: two seconds apart in total.', 'Planning took 2:33 against 5:22 and there is no separate archive step (1:26 for OpenSpec). Implementing took 13:44 against 9:27: it added a database constraint against overlapping bookings and 38 tests against the real database, had the diff reviewed, and lost about a minute when the account usage limit cut the step off.'],
      ],
    },
  ],
  3: [
    {
      slower: 'speckit',
      faster: 'openspec',
      points: [
        ['It ran its full feature process for a 2-line fix.', "Its plan and tasks steps alone (4:43) took longer than OpenSpec's whole run (3:56): research, a data model, two contract files, a quickstart and 15 tasks, 900 lines against OpenSpec's 4 tasks and 225 lines."],
        ['More tasks meant longer coding.', "With 15 tasks, including verification steps, it wrote a 47-line test against OpenSpec's 11 lines: 2:28 against 1:20 for the same fix, plus 1:23 for the AI check."],
      ],
    },
    {
      slower: 'openspec',
      faster: 'cyberrock',
      points: [
        ['It ran three AI sessions where the CyberRock kit ran one.', 'OpenSpec proposed (1:58), applied (1:20) and archived (0:38) in separate sessions, and every session loads about 50,000 tokens of context before it does any work. The CyberRock kit recognised the brief as a bugfix and found the cause, wrote the regression test, fixed, verified and archived in one session of 1:17.'],
      ],
    },
  ],
};
