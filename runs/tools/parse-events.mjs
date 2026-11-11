const safeParse = (line) => {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
};

const eventOf = (line) => {
  const parsed = safeParse(line);
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }
  return parsed.event && typeof parsed.event === 'object' ? parsed.event : parsed;
};

const statusOf = (result) => {
  if (!result) {
    return 'interrupted';
  }
  return result.is_error || result.subtype !== 'success' ? 'error' : 'ok';
};

export const parseEvents = (lines) => {
  const events = lines.map(eventOf).filter(Boolean);
  const result = events.findLast((event) => event.type === 'result') ?? null;
  const sessionId = result?.session_id ?? events.find((event) => event.session_id)?.session_id ?? null;
  const perModel = Object.values(result?.modelUsage ?? {});
  const sum = (key) => perModel.reduce((total, model) => total + (model[key] ?? 0), 0);
  const usage = perModel.length
    ? {
        input_tokens: sum('inputTokens'),
        output_tokens: sum('outputTokens'),
        cache_read_input_tokens: sum('cacheReadInputTokens'),
        cache_creation_input_tokens: sum('cacheCreationInputTokens'),
      }
    : result?.usage ?? {};
  return {
    status: statusOf(result),
    sessionId,
    turns: result?.num_turns ?? 0,
    apiMs: result?.duration_api_ms ?? 0,
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
    costUsd: result?.total_cost_usd ?? 0,
    modelUsage: result?.modelUsage ?? {},
    permissionDenials: (result?.permission_denials ?? []).map((denial) => ({
      tool: denial.tool_name,
      input: denial.tool_input,
    })),
    resultText: typeof result?.result === 'string' ? result.result : '',
  };
};
