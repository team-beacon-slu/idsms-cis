// Excludes .agents/ and .claude/skills/ (vendored Supabase agent-skill docs,
// installed via `npx skills add`) from eslint/prettier — running prettier over
// dozens of vendored files at once blew past Windows' command-line length limit,
// and they're not our code to reformat anyway.
export default {
  "{*,!(.agents|.claude)/**/*}.{js,jsx,ts,tsx}": ["eslint --fix", "prettier --write"],
  "{*,!(.agents|.claude)/**/*}.{json,md,css}": ["prettier --write"],
};
