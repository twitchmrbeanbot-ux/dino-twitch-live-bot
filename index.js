require("dotenv").config();
const express = require("express");
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const crypto = require("crypto");
const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));

const app = express();
const PORT = process.env.PORT || 3000;

// ----------------------------
// GLOBAL ERROR LOGGING
// ----------------------------
process.on("unhandledRejection", (reason) => {
  console.error("❌ UNHANDLED REJECTION:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("❌ UNCAUGHT EXCEPTION:", err);
});

// ----------------------------
// EXPRESS RAW BODY
// ----------------------------
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

// ----------------------------
// DISCORD CLIENT
// ----------------------------
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once("clientReady", async () => {
  console.log(`✅ DinoBot online as ${client.user.tag}`);

  try {
    await subscribeToTwitchUsers();
    console.log("✅ Twitch subscriptions active");
  } catch (err) {
    console.error("❌ Twitch subscription error:", err);
  }
});

client.on("error", (err) => {
  console.error("❌ Discord client error:", err);
});

client.on("shardDisconnect", (event, id) => {
  console.warn(`⚠️ Shard ${id} disconnected:`, event?.code, event?.reason);
});

client.on("shardError", (error, shardId) => {
  console.error(`❌ Shard ${shardId} error:`, error);
});

client.on("invalidated", () => {
  console.error("❌ Discord session invalidated");
});

// ----------------------------
// HEALTH CHECK
// ----------------------------
app.get("/", (req, res) => {
  res.send("DinoBot Twitch notifier running");
});

// ----------------------------
// TWITCH HELPERS
// ----------------------------
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

  if (!data.access_token) {
    throw new Error(`Twitch OAuth failure: ${JSON.stringify(data)}`);
  }

  return data.access_token;
}

async function getTwitchUserIds(token, logins) {
  const params = logins.map(l => `login=${encodeURIComponent(l)}`).join("&");

  const res = await fetch(`https://api.twitch.tv/helix/users?${params}`, {
    headers: {
      "Client-ID": process.env.TWITCH_CLIENT_ID,
      "Authorization": `Bearer ${token}`
    }
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(`Failed to get Twitch users: ${JSON.stringify(data)}`);
  }

  return data.data || [];
}

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
  return { ok: res.ok, status: res.status, data };
}

async function getStreamInfo(token, userId) {
  const res = await fetch(`https://api.twitch.tv/helix/streams?user_id=${encodeURIComponent(userId)}`, {
    headers: {
      "Client-ID": process.env.TWITCH_CLIENT_ID,
      "Authorization": `Bearer ${token}`
    }
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(`Failed to get stream info: ${JSON.stringify(data)}`);
  }

  return data.data[0] || null;
}

async function subscribeToTwitchUsers() {
  const logins = process.env.TWITCH_USER_LOGINS
    .split(",")
    .map(l => l.trim().toLowerCase())
    .filter(Boolean);

  console.log("Monitoring:", logins.join(", "));

  const token = await getTwitchToken();
  const users = await getTwitchUserIds(token, logins);

  if (!users.length) {
    console.warn("⚠️ No Twitch users found");
    return;
  }

  for (const user of users) {
    const result = await createEventSubSubscription(token, user.id);

    if (!result.ok && result.status !== 409) {
      console.error(`❌ Failed to subscribe to ${user.login}:`, result.data);
    } else if (result.status === 409) {
      console.log(`ℹ️ Already subscribed: ${user.login}`);
    } else {
      console.log(`✅ Subscribed: ${user.login}`);
    }
  }
}

// ----------------------------
// DUPLICATE PROTECTION
// ----------------------------
const processedMessageIds = new Set();

// ----------------------------
// TWITCH EVENTSUB WEBHOOK
// ----------------------------
app.post("/twitch/eventsub", async (req, res) => {
  try {
    const secret = process.env.TWITCH_WEBHOOK_SECRET;
    const messageId = req.headers["twitch-eventsub-message-id"];
    const timestamp = req.headers["twitch-eventsub-message-timestamp"];
    const signature = req.headers["twitch-eventsub-message-signature"];
    const messageType = req.headers["twitch-eventsub-message-type"];

    if (!messageId || !timestamp || !signature) {
      return res.status(400).send("Missing headers");
    }

    const hmacMessage = messageId + timestamp + req.rawBody;
    const expectedSignature =
      "sha256=" +
      crypto.createHmac("sha256", secret).update(hmacMessage).digest("hex");

    const valid =
      expectedSignature.length === signature.length &&
      crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature));

    if (!valid) {
      console.warn("❌ Invalid Twitch signature");
      return res.status(403).send("Forbidden");
    }

    if (processedMessageIds.has(messageId)) {
      return res.status(200).send("Duplicate ignored");
    }

    processedMessageIds.add(messageId);

    if (processedMessageIds.size > 1000) {
      const firstKey = processedMessageIds.values().next().value;
      processedMessageIds.delete(firstKey);
    }

    if (messageType === "webhook_callback_verification") {
      return res.status(200).type("text/plain").send(req.body.challenge);
    }

    if (messageType === "notification" && req.body.subscription?.type === "stream.online") {
      const {
        broadcaster_user_id,
        broadcaster_user_login,
        broadcaster_user_name
      } = req.body.event;

      console.log(`📡 ${broadcaster_user_name} went live`);

      const token = await getTwitchToken();
      const stream = await getStreamInfo(token, broadcaster_user_id);
      const channel = await client.channels.fetch(process.env.DISCORD_CHANNEL_ID);

      if (!channel || !stream) {
        console.warn("⚠️ Channel or stream data missing");
        return res.status(200).send("Missing data");
      }

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
      return res.status(200).send("Notification processed");
    }

    if (messageType === "revocation") {
      console.warn("⚠️ Subscription revoked:", req.body.subscription?.type);
      return res.status(200).send("Revocation received");
    }

    return res.status(200).send("OK");

  } catch (err) {
    console.error("❌ Webhook error:", err);
    return res.status(500).send("Internal Server Error");
  }
});

// ----------------------------
// START SERVER
// ----------------------------
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});

// ----------------------------
// DISCORD LOGIN
// ----------------------------
(async () => {
  try {
    const token = (process.env.DISCORD_TOKEN || "").trim();

    await new Promise(resolve => setTimeout(resolve, 3000));

    await Promise.race([
      client.login(token),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Discord login timeout")), 30000)
      )
    ]);

  } catch (err) {
    console.error("❌ Discord login failed:", err.message);
  }
})();