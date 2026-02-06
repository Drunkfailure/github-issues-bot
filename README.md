# GitHub Issues Discord Bot

A small Discord bot that creates GitHub issues from your server. Use the `/issues` slash command to open a modal and post a new issue (with optional labels) to your repo.

The bot runs as an **HTTP server** so it works behind **ngrok** or any reverse proxy: Discord sends interactions to your **Interactions Endpoint URL**.

## What actually creates and handles `/issues`

Slash commands only appear if the app registers them with Discord’s API. This repo does both:

| Requirement | What this repo does |
|-------------|----------------------|
| **1. Permissions** | You add `applications.commands` when inviting the bot (OAuth2 URL Generator). |
| **2. Register the command** | **`npm run register`** runs `src/register-commands.js`, which calls Discord’s API to register the `issues` command (equivalent to `PUT /applications/{application.id}/commands`). Until this runs, `/issues` will not appear in Discord. Run it once after cloning; run again if you change the command name or description. |
| **3. Handle the interaction** | The **HTTP server** in `src/index.js` receives Discord’s POST at **`/interactions`**. It verifies the request, then responds: for the `/issues` command it returns the modal (response within 3s); when the user submits the modal it defers, creates the GitHub issue, then updates the message via the interaction webhook. |

So: **register-commands.js** is what makes `/issues` show up; **index.js** (and the Interactions Endpoint URL pointing at it) is what makes it work. If you get 404s, the endpoint URL is wrong or the server/ngrok isn’t running on that URL.

## Setup

### 1. Create `.env` with the right values

Yes — you need a `.env` file with all required variables.

```bash
cp .env.example .env
```

Edit `.env` and set:

| Variable | Where to get it |
|----------|------------------|
| `DISCORD_TOKEN` | Developer Portal → your app → **Bot** → Reset Token / copy token |
| `DISCORD_CLIENT_ID` | **General Information** → Application ID |
| `DISCORD_PUBLIC_KEY` | **General Information** → Public Key (required for endpoint verification) |
| `PORT` | Port your server listens on (default `3000`) |
| `GITHUB_TOKEN` | [GitHub → Personal access tokens](https://github.com/settings/tokens) (scope: `repo` or `public_repo`) |
| `GITHUB_REPO` | Repo to create issues in, e.g. `your-username/your-repo` |

### 2. Discord application and bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications) → **New Application**.
2. **Bot** → **Add Bot** → copy the **Token** → `DISCORD_TOKEN`.
3. **General Information** → copy **Application ID** → `DISCORD_CLIENT_ID`, and **Public Key** → `DISCORD_PUBLIC_KEY`.
4. **OAuth2 → URL Generator**: scopes `bot`, `applications.commands`; invite the bot to your server.

### 3. Interactions Endpoint URL (for ngrok / Linux server)

The app is an HTTP server. Discord sends slash commands and modal submits to the **Interactions Endpoint URL** you configure.

- **Port:** The server listens on **`PORT`** from `.env` (default **3000**).
- **Path:** Discord must POST to **`/interactions`**.

So your **Interactions Endpoint URL** must be:

```text
https://<your-public-host>/interactions
```

Examples:

- **ngrok:** If ngrok forwards to local port 3000, use:  
  `https://your-subdomain.ngrok-free.dev/interactions`  
  (same as in your screenshot: the path is `/interactions`.)
- **Linux server with ngrok:** Run the app on the server (e.g. `PORT=3000`), start ngrok with that port, then set the URL above in the Developer Portal.

In the Discord Developer Portal:

1. Open your app → **General Information**.
2. Set **Interactions Endpoint URL** to your public URL with path `/interactions`, e.g.  
   `https://unadult-unobjectivized-keri.ngrok-free.dev/interactions`.
3. Save.

### 4. Install and run

```bash
npm install
npm run register   # register /issues slash command (once)
npm start
```

On a Linux server, run the same commands (after setting `.env` there). The server will listen on `PORT` (e.g. 3000); point ngrok (or your proxy) at that port.

### 5. Use in Discord

Type `/issues`. A **modal** opens with:

- **Issue title** (required)
- **Description** (optional)
- **Labels / tags** (optional, comma-separated). Use label names that already exist in your repo.

Submit the form; the bot creates the issue and replies with the link (and labels if provided).
