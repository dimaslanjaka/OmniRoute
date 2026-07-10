// download-skills.mjs
import fs from "fs";
import path from "path";
import https from "https";

// Add more URLs here as needed
const urls = [
  "https://raw.githubusercontent.com/duc01226/EasyPlatform/refs/heads/main/.claude/skills/git-conflict-resolve/SKILL.md",
  // "https://raw.githubusercontent.com/example/project/refs/heads/main/.opencode/skills/sample-skill/SKILL.md",
  // "https://raw.githubusercontent.com/example/project/refs/heads/main/.codex/skills/another-skill/SKILL.md"
];

// Function to derive target path from URL
function getTargetPath(url) {
  // Capture any namespace like .claude, .opencode, .codex, etc.
  const match = url.match(/(\.[^/]+\/skills\/.*)$/);
  if (!match) throw new Error("URL does not contain a recognized skills path");

  const relativePath = match[1]; // e.g. ".codex/skills/another-skill/SKILL.md"
  return path.join(process.cwd(), relativePath);
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(dest);
    fs.mkdirSync(dir, { recursive: true });

    const file = fs.createWriteStream(dest);

    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
        return;
      }

      response.pipe(file);

      file.on("finish", () => {
        file.close(resolve);
      });
    }).on("error", (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
}

async function main() {
  for (const url of urls) {
    try {
      const targetPath = getTargetPath(url);
      console.log(`Downloading: ${url}`);
      await downloadFile(url, targetPath);
      console.log(`Saved to: ${targetPath}`);
    } catch (err) {
      console.error(`Error with ${url}:`, err.message);
    }
  }
}

main();
