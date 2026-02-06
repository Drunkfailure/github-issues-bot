import "dotenv/config";
import { REST, Routes } from "discord.js";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;

if (!token || !clientId) {
  console.error("Set DISCORD_TOKEN and DISCORD_CLIENT_ID in .env");
  process.exit(1);
}

const commands = [
  {
    name: "issues",
    description: "Open a form to create a new issue in the linked GitHub repo (with optional labels)",
    options: [],
  },
];

const rest = new REST().setToken(token);

(async () => {
  try {
    console.log("Registering slash commands...");
    const data = await rest.put(Routes.applicationCommands(clientId), {
      body: commands,
    });
    console.log(`Registered ${data.length} command(s). You can use /issues in Discord.`);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
