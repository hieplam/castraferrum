// Valid: the Claude executor is the only place that imports the Agent SDK.
import { query } from '@anthropic-ai/claude-agent-sdk';
export const q = query;
