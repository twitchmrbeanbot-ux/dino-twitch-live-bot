require("dotenv").config();
const express = require("express");
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");

const app = express();

// ✅ Preserve raw body for Twitch signature verification later
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; }
}));

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);

app.get("/", (req, res) => {
  res.send("DinoBot Twitch notifier running");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});