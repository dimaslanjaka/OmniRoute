import dotenv from "dotenv";
import fs from "fs";

const env = dotenv.config({ path: ".env.example" }).parsed || {};

const override_env = {
  STORAGE_ENCRYPTION_KEY: "6e7d60fc67c78ba89ae5d749e166096e6e212e54db2fb94ddde273b74baa3570",
  NODE_ENV: "production",
  ENABLE_SOCKS5_PROXY: "true",
  NEXT_PUBLIC_ENABLE_SOCKS5_PROXY: "true",
  // CLAUDE_OAUTH_CLIENT_ID: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
  // CODEX_OAUTH_CLIENT_ID: 'app_EMoamEEZ73f0CkXaXp7hrann',
  // QWEN_OAUTH_CLIENT_ID: 'f0304373b74a44d2b584a3fb70ca9e56',
  // KIMI_CODING_OAUTH_CLIENT_ID: '17e5f671-d194-4dfb-9706-5516cb48c098',
  // GITHUB_OAUTH_CLIENT_ID: 'Iv1.b507a08c87ecfe98',
};

const merged_env = { ...env, ...override_env, ...process.env };

const envFile = Object.entries(merged_env)
  .map(([key, value]) => `${key}=${value}`)
  .join("\n");

if (process.env.GITHUB_ACTIONS === "true") {
  fs.writeFileSync(".env", envFile);
} else {
  console.log(envFile);
}
