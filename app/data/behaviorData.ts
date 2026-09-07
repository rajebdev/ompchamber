export const DEFAULT_BEHAVIOR_RULES = `<mandatory_rules>
ALWAY USE CODEGRAPH (codegraph_codegraph_explore) TOOL MCP FIRST BEFORE OTHER TOOL BUILT-IN.
</mandatory_rules>

<mandatory_rules>
IF SUBAGENT NOT DEFINE MODELID, DELEGATE TASK USING INHERIT WITH PARENT MODELID.
</mandatory_rules>

<mandatory_rules>
WHEN COMMIT, ALWAYS USE CONVENTIONAL COMMIT. JANGAN COMMIT SAMPAI AKU MINTA.
</mandatory_rules>
`;
