import "dotenv/config";
import express from "express";
import { createRequire } from "module";
import { Octokit } from "octokit";

const require = createRequire(import.meta.url);
const {
  verifyKeyMiddleware,
  InteractionType,
  InteractionResponseType,
} = require("discord-interactions");

const app = express();
const PORT = 3000;

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

// Parse "owner/repo" from env
const repo = process.env.GITHUB_REPO;
if (!repo || !repo.includes("/")) {
  console.error("GITHUB_REPO must be set to owner/repo (e.g. myuser/my-repo)");
  process.exit(1);
}

const [owner, repoName] = repo.split("/").map((s) => s.trim());

const MODAL_CUSTOM_ID = "github-issue-modal";
const MODAL_TITLE_ID = "issue-title";
const MODAL_BODY_ID = "issue-body";
const MODAL_LABELS_ID = "issue-labels";

async function createGitHubIssue(title, body, labels = []) {
  const payload = {
    owner,
    repo: repoName,
    title,
    body: body || null,
  };
  if (labels.length > 0) payload.labels = labels;
  const { data } = await octokit.rest.issues.create(payload);
  return data;
}

// Modal payload for Discord API (response type 9)
function getModalPayload() {
  return {
    type: InteractionResponseType.MODAL,
    data: {
      custom_id: MODAL_CUSTOM_ID,
      title: "Create GitHub Issue",
      components: [
        {
          type: 1,
          components: [
            {
              type: 4,
              custom_id: MODAL_TITLE_ID,
              label: "Issue title",
              style: 1,
              required: true,
              placeholder: "e.g. Fix login button on mobile",
              max_length: 256,
            },
          ],
        },
        {
          type: 1,
          components: [
            {
              type: 4,
              custom_id: MODAL_BODY_ID,
              label: "Description (optional)",
              style: 2,
              required: false,
              placeholder: "Add more details, steps to reproduce...",
              max_length: 4000,
            },
          ],
        },
        {
          type: 1,
          components: [
            {
              type: 4,
              custom_id: MODAL_LABELS_ID,
              label: "Labels / tags (optional)",
              style: 1,
              required: false,
              placeholder: "bug, enhancement, documentation (comma-separated)",
              max_length: 200,
            },
          ],
        },
      ],
    },
  };
}

// POST /interactions — raw body required for signature verification
app.post(
  "/interactions",
  express.raw({ type: "application/json" }),
  (req, res, next) => {
    try {
      if (!req.body || !req.body.length) {
        console.error("[interactions] Empty body");
        return res.status(400).send("Bad request: empty body");
      }
      req.rawBody = req.body;
      req.body = JSON.parse(req.body.toString());
      next();
    } catch (e) {
      console.error("[interactions] Body parse error:", e.message);
      return res.status(400).send("Bad request: invalid JSON");
    }
  },
  verifyKeyMiddleware(process.env.DISCORD_PUBLIC_KEY),
  async (req, res) => {
    const body = req.body;
    const typeName = { 1: "PING", 2: "APPLICATION_COMMAND", 5: "MODAL_SUBMIT" }[body.type] || body.type;
    console.log(`[interactions] Received type=${typeName}`);
    try {
      // PING (e.g. Discord verifying endpoint)
      if (body.type === InteractionType.PING) {
        return res.send({ type: InteractionResponseType.PONG });
      }

      // Slash command /issues → show modal
      if (body.type === InteractionType.APPLICATION_COMMAND) {
        if (body.data?.name === "issues") {
          return res.send(getModalPayload());
        }
      }

      // Modal submit → create issue and follow up
      if (body.type === InteractionType.MODAL_SUBMIT && body.data?.custom_id === MODAL_CUSTOM_ID) {
        const components = body.data.components || [];
        const getValue = (id) => {
          const row = components.find((r) => r.components?.some((c) => c.custom_id === id));
          const comp = row?.components?.find((c) => c.custom_id === id);
          return comp?.value?.trim() ?? "";
        };
        const title = getValue(MODAL_TITLE_ID);
        const bodyText = getValue(MODAL_BODY_ID) || null;
        const labelsStr = getValue(MODAL_LABELS_ID);
        const labels = labelsStr ? labelsStr.split(",").map((s) => s.trim()).filter(Boolean) : [];

        // Respond with defer so we have time to create the issue
        res.send({
          type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
          data: { flags: 0 },
        });

        const appId = body.application_id;
        const token = body.token;
        const url = `https://discord.com/api/v10/webhooks/${appId}/${token}/messages/@original`;
        const headers = {
          Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
          "Content-Type": "application/json",
        };

        try {
          const issue = await createGitHubIssue(title, bodyText, labels);
          const tagList = issue.labels?.length
            ? issue.labels.map((l) => `\`${l.name}\``).join(" ")
            : "";
          const content = `Issue created: **${title}**\n${issue.html_url}${tagList ? `\nLabels: ${tagList}` : ""}`;
          await fetch(url, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ content }),
          });
        } catch (err) {
          const msg = err.message || String(err);
          await fetch(url, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ content: `Failed to create issue: ${msg}` }),
          });
        }
        return;
      }

      res.status(400).send({ error: "Unknown interaction" });
    } catch (err) {
      console.error("[interactions] Handler error:", err);
      res.status(500).send({ error: "Internal server error" });
    }
  }
);

// Health check (optional, for ngrok/uptime)
app.get("/", (req, res) => {
  res.send("GitHub Issues Bot — interactions at POST /interactions");
});

// Catch any unhandled errors in the pipeline so we always respond (avoids 502)
app.use((err, req, res, next) => {
  console.error("[interactions] Unhandled error:", err);
  if (!res.headersSent) res.status(500).send({ error: "Internal server error" });
});

const token = process.env.DISCORD_TOKEN;
const publicKey = process.env.DISCORD_PUBLIC_KEY;
if (!token || !publicKey) {
  console.error(
    "DISCORD_TOKEN and DISCORD_PUBLIC_KEY are required. Copy .env.example to .env and set them (Public Key is in Developer Portal → General Information)."
  );
  process.exit(1);
}

app.listen(PORT, "0.0.0.0", () => {
  console.log("");
  console.log(`  GitHub Issues Bot is running`);
  console.log(`  Port: ${PORT}`);
  console.log(`  Local:  http://localhost:${PORT}`);
  console.log(`  Health: http://localhost:${PORT}/`);
  console.log("");
  console.log(`  Point ngrok at this port:  ngrok http ${PORT}`);
  console.log(`  Discord Interactions URL:   https://YOUR-NGROK-URL/interactions`);
  console.log("");
});
