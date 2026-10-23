// Windows caps a command line at about 8,000 characters and lint-staged 17 no longer
// splits long file lists, so a big commit runs each tool in batches of 40 files.
const batch = (command) => (files) => {
  const commands = [];
  for (let i = 0; i < files.length; i += 40) {
    commands.push(`${command} ${files.slice(i, i + 40).map((f) => JSON.stringify(f)).join(" ")}`);
  }
  return commands;
};

const config = {
  "*.{js,jsx,ts,tsx}": [batch("eslint --fix"), batch("prettier --write")],
  "*.{json,md,css}": [batch("prettier --write")],
};

export default config;
