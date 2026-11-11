export const SCENE_INTROS = {
  1: {
    purpose: 'All three kits build a new feature from nothing on the same starting code.',
    start: [
      'The roombook codebase, frozen at `baseline-v1`: gateway, room, booking and worker services and a Next.js app in one Nx repo, sharing `libs/contract` (the fixed API) and `libs/backend-common`. Only the room list works.',
      "Each kit's own setup: OpenSpec's 6 skills and 6 commands, Spec Kit's 9 skills and templates, the CyberRock kit's 4 skills, 3 agents and one script, and the same project rules for all.",
      'Two coding agents working in parallel, one for the backend and one for the web app: `nestjs-expert` and `nextjs-fe-developer` for OpenSpec and Spec Kit; the CyberRock kit brings its own, `cr-nestjs-expert` and `cr-nextjs-fe-developer`, which carry the lessons from the other two kits’ bugs.',
    ],
    job: [
      'Build room bookings: the API, a create that is safe to retry, a confirmation job the worker retries, and a `/bookings` page.',
      'Scored by 22 new hidden tests.',
    ],
    shows: "Each kit's full process on new work: how much it plans and checks before writing code, and what that costs.",
  },
  2: {
    purpose: 'All three kits change behaviour they specified themselves in the feature.',
    start: ["Each kit's own result from the feature: its code and the specs it wrote."],
    job: [
      'Stop double-booking: an overlapping create or edit for the same room is rejected with 409 `CONFLICT.BOOKING_OVERLAP`; back-to-back bookings stay allowed.',
      'Scored by 7 new hidden tests; every earlier test must still pass.',
    ],
    shows: 'How each kit changes existing behaviour, and whether its specs still describe the system afterwards.',
  },
  3: {
    purpose: 'All three kits find and fix a small bug planted in the starting code.',
    start: ['The rooms list: with 5 rooms per page, page 2 shows Room 11 and 12 instead of Room 06 to 10.'],
    job: ['Find the cause, write it up, fix it and add a test that would catch it again.', 'Scored by 4 new hidden tests.'],
    shows: "How heavy each kit's process is for a tiny fix. OpenSpec and Spec Kit ran their full process (Spec Kit's lighter bug path was not used); the CyberRock kit picks a light path for a bugfix by itself.",
  },
};
