require("dotenv").config();
const express = require("express");
const { Client, GatewayIntentBits, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const crypto = require("crypto");
const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));

const app = express();
const PORT = process.env.PORT || 3000;

// ----------------------------
// CONSTANTS
// ----------------------------
const GUILD_ID = "1480080172400250992";
const WELCOME_CHANNEL_ID = "1480080173469532194";
const RULES_CHANNEL_ID = "1480080173469532195";
const VERIFY_EMOJI = "✅";
const STREAMER_EMOJI = "🎮";
const VIEWER_EMOJI = "👀";

// Store rules message ID for reaction tracking
let rulesMessageId = null;
let roleMessageId = null;

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
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent
  ]
});

client.once("clientReady", async () => {
  console.log(`✅ DinoBot online as ${client.user.tag}`);

  try {
    await setupRoles();
    await setupRulesMessage();
    console.log("✅ Onboarding system ready");
  } catch (err) {
    console.error("❌ Onboarding setup error:", err);
  }

  try {
    await subscribeToTwitchUsers();
    console.log("✅ Twitch subscriptions active");
  } catch (err) {
    console.error("❌ Twitch subscription error:", err);
  }
});

// ----------------------------
// ROLE SETUP
// ----------------------------
async function setupRoles() {
  const guild = await client.guilds.fetch(GUILD_ID);
  const existingRoles = await guild.roles.fetch();

  const roleNames = ["Unverified", "Member", "Streamer", "Viewer"];

  for (const roleName of roleNames) {
    const exists = existingRoles.find(r => r.name === roleName);
    if (!exists) {
      await guild.roles.create({
        name: roleName,
        reason: "DinoBot onboarding setup"
      });
      console.log(`✅ Created role: ${roleName}`);
    } else {
      console.log(`ℹ️ Role already exists: ${roleName}`);
    }
  }
}

// ----------------------------
// RULES MESSAGE SETUP
// ----------------------------
async function setupRulesMessage() {
  const guild = await client.guilds.fetch(GUILD_ID);
  const rulesChannel = await client.channels.fetch(RULES_CHANNEL_ID);

  // Check if rules message already exists
  const messages = await rulesChannel.messages.fetch({ limit: 10 });
  const existing = messages.find(m => m.author.id === client.user.id && m.embeds.length > 0);

  if (existing) {
    rulesMessageId = existing.id;
    console.log("ℹ️ Rules message already exists");

    // Check for role picker message
    const roleMsg = messages.find(m => m.author.id === client.user.id && m.id !== existing.id);
    if (roleMsg) roleMessageId = roleMsg.id;
    return;
  }

  // Post rules embed
  const rulesEmbed = new EmbedBuilder()
    .setTitle("📋 Server Rules")
    .setDescription(
      "Welcome to the server! This is a **private 18+ community** for gaming, streaming, and hanging out.\n\n" +
      "**🔞 Age Requirement**\n" +
      "This server is 18+ only. Anyone found to be under 18 will be removed immediately.\n\n" +
      "**🤝 Respect Everyone**\n" +
      "No harassment, bullying, hate speech, personal attacks, or threats. Friendly banter is fine — targeted harassment is not.\n\n" +
      "**🚫 Illegal Content**\n" +
      "No illegal material, piracy, doxxing, malware, scams, or phishing. Violations result in immediate removal.\n\n" +
      "**🔞 Mature Content**\n" +
      "Mature humor is allowed. No explicit pornography, non-consensual content, or illegal adult material.\n\n" +
      "**💬 Spam & Channel Use**\n" +
      "Keep channels on topic. No spam, flooding, or mass pinging.\n\n" +
      "**📢 Advertising**\n" +
      "Self promotion is allowed only in #shameless-plug. No advertising in other channels.\n\n" +
      "**🎙️ Voice Chat**\n" +
      "No intentional disruption, soundboard spam, or disrespecting others in voice.\n\n" +
      "**⚠️ Moderation**\n" +
      "Follow moderator instructions. Breaking rules may result in a warning, mute, kick, or ban.\n\n" +
      "✔️ **We're all here to hang out, game, and have fun. Be respectful and enjoy the community.**"
    )
    .setColor(0x9146FF)
    .setFooter({ text: "React with ✅ below to verify and gain access to the server" });

  const rulesMsg = await rulesChannel.send({ embeds: [rulesEmbed] });
  await rulesMsg.react(VERIFY_EMOJI);
  rulesMessageId = rulesMsg.id;
  console.log("✅ Rules message posted");

  // Post role picker message
  const roleEmbed = new EmbedBuilder()
    .setTitle("🎭 Pick Your Role")
    .setDescription(
      "After verifying, pick your role:\n\n" +
      "🎮 — **Streamer** — You stream on Twitch\n" +
      "👀 — **Viewer** — You watch streams\n\n" +
      "React below to assign your role!"
    )
    .setColor(0x9146FF);

  const roleMsg = await rulesChannel.send({ embeds: [roleEmbed] });
  await roleMsg.react(STREAMER_EMOJI);
  await roleMsg.react(VIEWER_EMOJI);
  roleMessageId = roleMsg.id;
  console.log("✅ Role picker message posted");
}

// ----------------------------
// WELCOME NEW MEMBERS
// ----------------------------
client.on("guildMemberAdd", async (member) => {
  try {
    console.log(`👋 New member joined: ${member.user.tag}`);

    const guild = await client.guilds.fetch(GUILD_ID);
    const roles = await guild.roles.fetch();
    const unverifiedRole = roles.find(r => r.name === "Unverified");

    if (unverifiedRole) {
      await member.roles.add(unverifiedRole);
      console.log(`✅ Assigned Unverified role to ${member.user.tag}`);
    }

    // Post welcome message in #welcome
    const welcomeChannel = await client.channels.fetch(WELCOME_CHANNEL_ID);
    const welcomeEmbed = new EmbedBuilder()
      .setTitle(`🦕 Welcome to the server, ${member.user.username}!`)
      .setDescription(
        `Hey ${member}! Welcome to the community! 🎉\n\n` +
        "**To get started:**\n" +
        "1. Head over to <#" + RULES_CHANNEL_ID + "> and read the rules\n" +
        "2. React with ✅ to verify your age and gain access\n" +
        "3. Pick your role — Streamer 🎮 or Viewer 👀\n\n" +
        "We're happy to have you here!"
      )
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .setColor(0x9146FF)
      .setFooter({ text: `Member #${guild.memberCount}` })
      .setTimestamp();

    await welcomeChannel.send({ embeds: [welcomeEmbed] });

    // Send welcome DM
    const dmEmbed = new EmbedBuilder()
      .setTitle("👋 Welcome to the server!")
      .setDescription(
        "Thanks for joining! Here's what you need to know:\n\n" +
        "**📋 Rules**\n" +
        "This is a private 18+ community. Please read and follow all rules.\n\n" +
        "**✅ Verify**\n" +
        "Head to #rules and react with ✅ to gain full access.\n\n" +
        "**📺 Channels**\n" +
        "• #shameless-plug — post your streams and content\n" +
        "• #general — hang out and chat\n\n" +
        "If you have any questions, feel free to ask a moderator. See you in there! 🦕"
      )
      .setColor(0x9146FF);

    await member.send({ embeds: [dmEmbed] });
    console.log(`✅ Welcome DM sent to ${member.user.tag}`);

  } catch (err) {
    console.error("❌ Error handling new member:", err);
  }
});

// ----------------------------
// REACTION HANDLER
// ----------------------------
client.on("messageReactionAdd", async (reaction, user) => {
  try {
    if (user.bot) return;

    // Fetch partial reaction/message if needed
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();

    const guild = await client.guilds.fetch(GUILD_ID);
    const member = await guild.members.fetch(user.id);
    const roles = await guild.roles.fetch();

    // ✅ Verify reaction on rules message
    if (
      reaction.message.id === rulesMessageId &&
      reaction.emoji.name === VERIFY_EMOJI
    ) {
      const unverifiedRole = roles.find(r => r.name === "Unverified");
      const memberRole = roles.find(r => r.name === "Member");

      if (unverifiedRole) await member.roles.remove(unverifiedRole);
      if (memberRole) await member.roles.add(memberRole);

      console.log(`✅ Verified: ${user.tag}`);

      try {
        await user.send({
          embeds: [
            new EmbedBuilder()
              .setTitle("✅ You're verified!")
              .setDescription(
                "You now have full access to the server! 🎉\n\n" +
                "Don't forget to pick your role in <#" + RULES_CHANNEL_ID + ">:\n" +
                "🎮 — Streamer\n" +
                "👀 — Viewer"
              )
              .setColor(0x57F287)
          ]
        });
      } catch (err) {
        console.warn("⚠️ Could not send verified DM:", user.tag);
      }
    }

    // 🎮 Streamer role
    if (
      reaction.message.id === roleMessageId &&
      reaction.emoji.name === STREAMER_EMOJI
    ) {
      const streamerRole = roles.find(r => r.name === "Streamer");
      if (streamerRole) {
        await member.roles.add(streamerRole);
        console.log(`✅ Assigned Streamer role to ${user.tag}`);
      }
    }

    // 👀 Viewer role
    if (
      reaction.message.id === roleMessageId &&
      reaction.emoji.name === VIEWER_EMOJI
    ) {
      const viewerRole = roles.find(r => r.name === "Viewer");
      if (viewerRole) {
        await member.roles.add(viewerRole);
        console.log(`✅ Assigned Viewer role to ${user.tag}`);
      }
    }

  } catch (err) {
    console.error("❌ Reaction handler error:", err);
  }
});

// ----------------------------
// REACTION REMOVE HANDLER
// ----------------------------
client.on("messageReactionRemove", async (reaction, user) => {
  try {
    if (user.bot) return;

    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();

    const guild = await client.guilds.fetch(GUILD_ID);
    const member = await guild.members.fetch(user.id);
    const roles = await guild.roles.fetch();

    // Remove Streamer role
    if (
      reaction.message.id === roleMessageId &&
      reaction.emoji.name === STREAMER_EMOJI
    ) {
      const streamerRole = roles.find(r => r.name === "Streamer");
      if (streamerRole) await member.roles.remove(streamerRole);
      console.log(`ℹ️ Removed Streamer role from ${user.tag}`);
    }

    // Remove Viewer role
    if (
      reaction.message.id === roleMessageId &&
      reaction.emoji.name === VIEWER_EMOJI
    ) {
      const viewerRole = roles.find(r => r.name === "Viewer");
      if (viewerRole) await member.roles.remove(viewerRole);
      console.log(`ℹ️ Removed Viewer role from ${user.tag}`);
    }

  } catch (err) {
    console.error("❌ Reaction remove error:", err);
  }
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