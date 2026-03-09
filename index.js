require("dotenv").config();
const express = require("express");
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const crypto = require("crypto");
const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));

console.log("=== INDEX.JS STARTING ===");

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
// ENV CHECK
// ----------------------------
console.log("ENV CHECK");
console.log("DISCORD_TOKEN loaded:", !!process.env.DISCORD_TOKEN);
console.log("DISCORD_CHANNEL_ID loaded:", !!process.env.DISCORD_CHANNEL_ID);
console.log("TWITCH_CLIENT_ID loaded:", !!process.env.TWITCH_CLIENT_ID);
console.log("TWITCH_CLIENT_SECRET loaded:", !!process.env.TWITCH_CLIENT_SECRET);
console.log("TWITCH_WEBHOOK_SECRET loaded:", !!process.env.TWITCH_WEBHOOK_SECRET);
console.log("TWITCH_CALLBACK_URL loaded:", !!process.env.TWITCH_CALLBACK_URL);
console.log("TWITCH_USER_LOGINS loaded:", !!process.env.TWITCH_USER_LOGINS);

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
console.log("Creating Discord client...");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once("ready", async () => {
  console.log("✅ Discord READY event fired");
  console.log(`Logged in as ${client.user.tag}`);

  try {
    const channel = await client.channels.fetch(process.env.DISCORD_CHANNEL_ID);
    console.log("Discord channel fetch result:", !!channel);
  } catch (err) {
    console.error("❌ Failed to fetch Discord channel:", err);
  }

  try {
    console.log("Starting Twitch subscription setup...");
    await subscribeToTwitchUsers();
    console.log("✅ Twitch subscription setup finished");
  } catch (err) {
    console.error("❌ Twitch subscription setup error:", err);
  }
});

client.on("error", (err) => {
  console.error("❌ Discord client error:", err);
});

client.on("warn", (info) => {
  console.warn("⚠️ Discord warn:", info);
});

client.on("shardReady", (id) => {
  console.log(`✅ Discord shard ready: ${id}`);
});

client.on("shardDisconnect", (event, id) => {
  console.warn(`⚠️ Discord shard disconnected: ${id}`, event?.code, event?.reason);
});

client.on("shardError", (error, shardId) => {
  console.error(`❌ Discord shard error on shard ${shardId}:`, error);
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
  console.log("Requesting Twitch OAuth token...");

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
    console.error("❌ Twitch OAuth failure:", data);
    throw new Error("Failed to get Twitch token");
  }

  console.log("✅ Twitch OAuth token received");
  return data.access_token;
}

async function getTwitchUserIds(token, logins) {
  console.log("Looking up Twitch users:", logins);

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

  console.log("Twitch users found:", data.data?.length || 0);
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
  console.log("Preparing Twitch subscription list...");

  const logins = process.env.TWITCH_USER_LOGINS
    .split(",")
    .map(l => l.trim().toLowerCase())
    .filter(Boolean);

  console.log("Users to monitor:", logins.join(", "));

  const token = await getTwitchToken();
  const users = await getTwitchUserIds(token, logins);

  if (!users.length) {
    console.warn("⚠️ No Twitch users found from TWITCH_USER_LOGINS");
    return;
  }

  for (const user of users) {
    console.log("Subscribing to:", user.login);
    const result = await createEventSubSubscription(token, user.id);

    if (!result.ok && result.status !== 409) {
      console.error(`❌ Failed to subscribe to ${user.login}:`, result.data);
    } else if (result.status === 409) {
      console.log(`ℹ️ Already subscribed for ${user.login}`);
    } else {
      console.log(`✅ Subscribed to stream.online for ${user.login}`);
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
  console.log("EventSub request received");

  try {
    const secret = process.env.TWITCH_WEBHOOK_SECRET;
    const messageId = req.headers["twitch-eventsub-message-id"];
    const timestamp = req.headers["twitch-eventsub-message-timestamp"];
    const signature = req.headers["twitch-eventsub-message-signature"];
    const messageType = req.headers["twitch-eventsub-message-type"];

    if (!messageId || !timestamp || !signature) {
      console.warn("❌ Missing Twitch signature headers");
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
      console.warn("❌ Invalid Twitch signature — request rejected");
      return res.status(403).send("Forbidden");
    }

    if (processedMessageIds.has(messageId)) {
      console.log(`ℹ️ Duplicate Twitch message ignored: ${messageId}`);
      return res.status(200).send("Duplicate ignored");
    }

    processedMessageIds.add(messageId);

    if (processedMessageIds.size > 1000) {
      const firstKey = processedMessageIds.values().next().value;
      processedMessageIds.delete(firstKey);
    }

    if (messageType === "webhook_callback_verification") {
      console.log("✅ Twitch webhook verified");
      return res.status(200).type("text/plain").send(req.body.challenge);
    }

    if (messageType === "notification" && req.body.subscription?.type === "stream.online") {
      const {
        broadcaster_user_id,
        broadcaster_user_login,
        broadcaster_user_name
      } = req.body.event;

      console.log(`📡 stream.online received for ${broadcaster_user_login}`);

      const token = await getTwitchToken();
      const stream = await getStreamInfo(token, broadcaster_user_id);
      const channel = await client.channels.fetch(process.env.DISCORD_CHANNEL_ID);

      if (!channel) {
        console.warn("⚠️ Discord channel not found");
        return res.status(200).send("Channel missing");
      }

      if (!stream) {
        console.warn("⚠️ Stream data missing");
        return res.status(200).send("Stream missing");
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
      console.warn("⚠️ Twitch subscription revoked:", req.body);
      return res.status(200).send("Revocation received");
    }

    return res.status(200).send("Unhandled message type");

  } catch (err) {
    console.error("❌ Error in /twitch/eventsub:", err);
    return res.status(500).send("Internal Server Error");
  }
});

// ----------------------------
// START SERVER
// ----------------------------
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// ----------------------------
// DISCORD LOGIN
// ----------------------------
(async () => {
  try {
    console.log("ABOUT TO CALL DISCORD LOGIN");
    const token = (process.env.DISCORD_TOKEN || "").trim();
    console.log("Discord token length:", token.length);

    // Small delay to avoid hammering Discord on rapid redeploys
    await new Promise(resolve => setTimeout(resolve, 3000));
    console.log("Startup delay complete, attempting login...");

    await Promise.race([
      client.login(token).then(() => {
        console.log("✅ Discord login resolved");
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Discord login timeout after 30000ms")), 30000)
      )
    ]);

  } catch (err) {
    console.error("❌ Discord login failed:", err.message);
  }
})();