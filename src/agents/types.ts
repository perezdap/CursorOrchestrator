import type { AgentDefinition, AgentType } from "../schemas/agent.schema.js";

export interface AgentTypeModule {
  type: AgentType;
  defaultInstructions: string;
  defaultModel?: string;
  allowedTools?: string[];
  inputs?: string[];
  outputs?: string[];
}

export function toAgentDefinition(module: AgentTypeModule): AgentDefinition {
  return {
    id: module.type,
    type: module.type,
    model: module.defaultModel ?? "auto",
    instructions: module.defaultInstructions,
    allowedTools: module.allowedTools,
    inputs: module.inputs,
    outputs: module.outputs,
    defaultInstructions: module.defaultInstructions,
  };
}
