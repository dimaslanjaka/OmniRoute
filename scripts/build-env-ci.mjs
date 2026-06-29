import dotenv from "dotenv";
import fs from "fs";

const env = dotenv.config({ path: ".env.example" }).parsed || {};

const override_env = {
  STORAGE_ENCRYPTION_KEY: "6e7d60fc67c78ba89ae5d749e166096e6e212e54db2fb94ddde273b74baa3570",
  NODE_ENV: "production",
  ENABLE_SOCKS5_PROXY: "true",
  NEXT_PUBLIC_ENABLE_SOCKS5_PROXY: "true",
  JWT_SECRET:
    "e77d7e8496cae619d79fe4253d4e82b16270e3aa8c5c1504d6d76c67bf91fe3c590342fd75457c17fbf2eda728f93362192d8993f5bf9760a07df9cd4eb00006",
  API_KEY_SECRET: "9defd6df0c936f35233304f9acc45f2f1ecd232e9e4d99f8fe79516bd77154b2",
  INITIAL_PASSWORD: "OmniRoute@2026",
  OMNIROUTE_USE_TURBOPACK: "1",
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
