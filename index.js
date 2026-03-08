require("dotenv").config();
const express = require("express");
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const crypto = require("crypto");
const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));

const app = express();

// ✅ Preserve raw body for Twitch signature verification
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; }
}));

// ✅ Discord client setup
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await subscribeToTwitchUsers();
});

client.login(process.env.DISCORD_TOKEN);

// ✅ Health check route for Render
app.get("/", (req, res) => {
  res.send("DinoBot Twitch notifier running");
});

// ----------------------------
// TWITCH HELPERS
// ----------------------------

// Get Twitch App Access Token
async function getTwitchToken() {
  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.TWITCH_CLIENT_ID,
      client_secret: process.env.TWITCH_CLIENT_SECRET,
      grant_type: "client_credentials"
    })
  });
  const data = await res.json();
  return data.access_token;
}

// Convert Twitch username → user ID
async function getTwitchUserIds(token, logins) {
  const params = logins.map(l => `login=${l}`).join("&");
  const res = await fetch(`https://api.twitch.tv/helix/users?${params}`, {
    headers: {
      "Client-ID": process.env.TWITCH_CLIENT_ID,
      "Authorization": `Bearer ${token}`
    }
  });
  const data = await res.json();
  return data.data; // array of { id, login, display_name, ... }
}

// Subscribe to stream.online for a user ID
async function createEventSubSubscription(token, userId) {
  const res = await fetch("https://api.twitch.tv/helix/eventsub/subscriptions", {
    method: "POST",
    headers: {
      "Client-ID": process.env.TWITCH_CLIENT_ID,
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      type: "stream.online",
      version: "1",
      condition: { broadcaster_user_id: userId },
      transport: {
        method: "webhook",
        callback: process.env.TWITCH_CALLBACK_URL,
        secret: process.env.TWITCH_WEBHOOK_SECRET
      }
    })
  });
  const data = await res.json();
  return data;
}

// Fetch live stream info for embed
async function getStreamInfo(token, userId) {
  const res = await fetch(`https://api.twitch.tv/helix/streams?user_id=${userId}`, {
    headers: {
      "Client-ID": process.env.TWITCH_CLIENT_ID,
      "Authorization": `Bearer ${token}`
    }
  });
  const data = await res.json();
  return data.data[0]; // null if offline
}

// Main subscription flow on bot startup
async function subscribeToTwitchUsers() {
  try {
    const logins = process.env.TWITCH_USER_LOGINS.split(",").map(l => l.trim());
    const token = await getTwitchToken();
    const users = await getTwitchUserIds(token, logins);

    for (const user of users) {
      const result = await createEventSubSubscription(token, user.id);
      // 409 means already subscribed — that's fine
      if (result.error && result.status !== 409) {
        console.error(`Failed to subscribe to ${user.login}:`, result);
      } else {
        console.log(`✅ Subscribed to stream.online for ${user.login}`);
      }
    }
  } catch (err) {
    console.error("Error subscribing to Twitch users:", err);
  }
}

// ----------------------------
// TWITCH EVENTSUB WEBHOOK
// ----------------------------

app.post("/twitch/eventsub", async (req, res) => {
  const secret = process.env.TWITCH_WEBHOOK_SECRET;
  const messageId = req.headers["twitch-eventsub-message-id"];
  const timestamp = req.headers["twitch-eventsub-message-timestamp"];
  const signature = req.headers["twitch-eventsub-message-signature"];
  const messageType = req.headers["twitch-eventsub-message-type"];

  // ✅ Verify Twitch HMAC signature
  const hmac = "sha256=" + crypto
    .createHmac("sha256", secret)
    .update(messageId + timestamp + req.rawBody)
    .digest("hex");

  if (hmac !== signature) {
    console.warn("❌ Invalid Twitch signature — request rejected");
    return res.status(403).send("Forbidden");
  }

  // ✅ Twitch challenge handshake
  if (messageType === "webhook_callback_verification") {
    console.log("✅ Twitch webhook verified");
    return res.status(200).send(req.body.challenge);
  }

  // ✅ Handle stream.online notification
  if (messageType === "notification" && req.body.subscription.type === "stream.online") {
    const { broadcaster_user_id, broadcaster_user_login, broadcaster_user_name } = req.body.event;

    try {
      const token = await getTwitchToken();
      const stream = await getStreamInfo(token, broadcaster_user_id);

      const channel = client.channels.cache.get(process.env.DISCORD_CHANNEL_ID);
      if (channel && stream) {
        const thumbnailUrl = stream.thumbnail_url
          .replace("{width}", "1280")
          .replace("{height}", "720");

        const embed = new EmbedBuilder()
          .setTitle(`🦕 ${broadcaster_user_name} is now LIVE on Twitch!`)
          .setURL(`https://twitch.tv/${broadcaster_user_login}`)
          .setDescription(`**${stream.title}**\n\n🎮 Playing: ${stream.game_name}`)
          .setImage(thumbnailUrl)
          .setColor(0x9146FF)
          .setFooter({ text: "Twitch Live Alert • DinoBot" })
          .setTimestamp();

        await channel.send({
          content: "@here 🔴 A friend just went live!",
          embeds: [embed]
        });

        console.log(`✅ Alert sent for ${broadcaster_user_name}`);
      } else {
        console.warn("⚠️ Channel not found or stream data missing");
      }
    } catch (err) {
      console.error("Error sending Discord alert:", err);
    }
  }

  res.status(200).send("OK");
});

// ----------------------------
// START SERVER
// ----------------------------

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
