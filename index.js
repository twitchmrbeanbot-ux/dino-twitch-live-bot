require("dotenv").config();
const express = require("express");
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType
} = require("discord.js");
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

const ROLE_IDS = {
  unverified: "1480647122285236438",
  goofyGoobers: "1480088633540083732",
  streamer: "1480647124038455498",
  viewer: "1480647124529189128",
  bros: "1480674153722937354",
  gurls: "1480674490231816403",
  mods: "1480282547769573538",
  admin: "1480083446704509091",
  owner: "1480082698159525909"
};

let rulesMessageId = null;
let roleMessageId = null;
let onboardingCategoryId = null;

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
    await setupOnboardingCategory();
    await setupRulesMessage();
    await lockChannelsForUnverified();
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

client.on("error", (err) => console.error("❌ Discord client error:", err));
client.on("shardDisconnect", (event, id) => console.warn(`⚠️ Shard ${id} disconnected`));
client.on("shardError", (error, shardId) => console.error(`❌ Shard ${shardId} error:`, error));
client.on("invalidated", () => console.error("❌ Discord session invalidated"));

// ----------------------------
// SETUP ONBOARDING CATEGORY
// ----------------------------
async function setupOnboardingCategory() {
  const guild = await client.guilds.fetch(GUILD_ID);
  const channels = await guild.channels.fetch();
  const existing = channels.find(c => c.type === ChannelType.GuildCategory && c.name === "ONBOARDING");

  if (existing) {
    onboardingCategoryId = existing.id;
    console.log("ℹ️ Onboarding category already exists");
    return;
  }

  const category = await guild.channels.create({
    name: "ONBOARDING",
    type: ChannelType.GuildCategory,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel]
      }
    ]
  });

  onboardingCategoryId = category.id;
  console.log("✅ Onboarding category created");
}

// ----------------------------
// LOCK CHANNELS FOR UNVERIFIED
// ----------------------------
async function lockChannelsForUnverified() {
  const guild = await client.guilds.fetch(GUILD_ID);
  const channels = await guild.channels.fetch();

  for (const channel of channels.values()) {
    if (!channel) continue;

    // Skip ONBOARDING category and its children
    if (channel.id === onboardingCategoryId) continue;
    if (channel.parentId === onboardingCategoryId) continue;

    // Allow Unverified to see #welcome and #rules only
    if (channel.id === WELCOME_CHANNEL_ID || channel.id === RULES_CHANNEL_ID) {
      await channel.permissionOverwrites.edit(ROLE_IDS.unverified, {
        ViewChannel: true,
        SendMessages: false,
        AddReactions: true,
        ReadMessageHistory: true
      }).catch(() => {});
      continue;
    }

    // Deny everything else
    if (channel.type === ChannelType.GuildCategory ||
        channel.type === ChannelType.GuildText ||
        channel.type === ChannelType.GuildVoice ||
        channel.type === ChannelType.GuildAnnouncement) {
      await channel.permissionOverwrites.edit(ROLE_IDS.unverified, {
        ViewChannel: false
      }).catch(() => {});
    }
  }

  console.log("✅ Channel lockdown applied for Unverified role");
}

// ----------------------------
// SETUP RULES MESSAGE
// ----------------------------
async function setupRulesMessage() {
  const rulesChannel = await client.channels.fetch(RULES_CHANNEL_ID);
  const messages = await rulesChannel.messages.fetch({ limit: 10 });
  const botMessages = messages.filter(m => m.author.id === client.user.id && m.embeds.length > 0);

  if (botMessages.size >= 2) {
    const sorted = botMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    rulesMessageId = sorted.first().id;
    roleMessageId = sorted.last().id;
    console.log("ℹ️ Rules messages already exist");
    return;
  }

  for (const msg of botMessages.values()) {
    await msg.delete().catch(() => {});
  }

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
  await rulesMsg.react("✅");
  rulesMessageId = rulesMsg.id;
  console.log("✅ Rules message posted");

  const roleEmbed = new EmbedBuilder()
    .setTitle("🎭 Existing Members — Pick Your Roles")
    .setDescription(
      "Already part of the crew? Pick your content role below!\n\n" +
      "🎮 — **Streamer** — You stream on Twitch\n" +
      "👀 — **Viewer** — You watch streams\n\n" +
      "*New members will go through the full onboarding flow after verifying.*"
    )
    .setColor(0x9146FF);

  const roleRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("role_streamer")
      .setLabel("Streamer")
      .setEmoji("🎮")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("role_viewer")
      .setLabel("Viewer")
      .setEmoji("👀")
      .setStyle(ButtonStyle.Secondary)
  );

  const roleMsg = await rulesChannel.send({ embeds: [roleEmbed], components: [roleRow] });
  roleMessageId = roleMsg.id;
  console.log("✅ Role picker message posted");
}

// ----------------------------
// WELCOME NEW MEMBERS
// ----------------------------
client.on("guildMemberAdd", async (member) => {
  try {
    console.log(`👋 New member joined: ${member.user.tag}`);

    await member.roles.add(ROLE_IDS.unverified);
    console.log(`✅ Assigned Unverified role to ${member.user.tag}`);

    const guild = await client.guilds.fetch(GUILD_ID);
    const welcomeChannel = await client.channels.fetch(WELCOME_CHANNEL_ID);

    const welcomeEmbed = new EmbedBuilder()
      .setTitle(`🦕 Welcome to the server, ${member.user.username}!`)
      .setDescription(
        `Hey ${member}! Welcome to the community! 🎉\n\n` +
        "**To get started:**\n" +
        `1. Head over to <#${RULES_CHANNEL_ID}> and read the rules\n` +
        "2. React with ✅ to verify your age and gain access\n" +
        "3. Pick your roles in your private welcome channel\n\n" +
        "We're happy to have you here!"
      )
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .setColor(0x9146FF)
      .setFooter({ text: `Member #${guild.memberCount}` })
      .setTimestamp();

    await welcomeChannel.send({ embeds: [welcomeEmbed] });

  } catch (err) {
    console.error("❌ Error handling new member:", err);
  }
});

// ----------------------------
// REACTION ADD — VERIFY
// ----------------------------
client.on("messageReactionAdd", async (reaction, user) => {
  try {
    if (user.bot) return;
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();

    if (reaction.message.id === rulesMessageId && reaction.emoji.name === "✅") {
      const guild = await client.guilds.fetch(GUILD_ID);
      const member = await guild.members.fetch(user.id);

      if (!member.roles.cache.has(ROLE_IDS.unverified)) return;

      await member.roles.remove(ROLE_IDS.unverified);
      await member.roles.add(ROLE_IDS.goofyGoobers);
      console.log(`✅ Verified: ${user.tag}`);

      await createOnboardingChannel(guild, member);
    }

  } catch (err) {
    console.error("❌ Reaction add error:", err);
  }
});

// ----------------------------
// REACTION REMOVE — UNVERIFY
// ----------------------------
client.on("messageReactionRemove", async (reaction, user) => {
  try {
    if (user.bot) return;
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();

    const guild = await client.guilds.fetch(GUILD_ID);
    const member = await guild.members.fetch(user.id);

    // Un-verify — remove all assigned roles and re-lock
    if (reaction.message.id === rulesMessageId && reaction.emoji.name === "✅") {
      const rolesToRemove = [
        ROLE_IDS.goofyGoobers,
        ROLE_IDS.streamer,
        ROLE_IDS.viewer,
        ROLE_IDS.bros,
        ROLE_IDS.gurls
      ];

      for (const roleId of rolesToRemove) {
        if (member.roles.cache.has(roleId)) {
          await member.roles.remove(roleId).catch(() => {});
        }
      }

      await member.roles.add(ROLE_IDS.unverified);
      console.log(`🔒 Unverified: ${user.tag} — all roles removed`);

      // Delete their onboarding channel if it still exists
      const channels = await guild.channels.fetch();
      const onboardingChannel = channels.find(
        c => c.parentId === onboardingCategoryId &&
        c.name === `welcome-${user.username.toLowerCase().replace(/[^a-z0-9]/g, "")}`
      );
      if (onboardingChannel) {
        await onboardingChannel.delete().catch(() => {});
        console.log(`🗑️ Deleted onboarding channel for ${user.tag}`);
      }

      return;
    }

    // Remove Streamer role
    if (reaction.message.id === roleMessageId && reaction.emoji.name === "🎮") {
      if (member.roles.cache.has(ROLE_IDS.streamer)) {
        await member.roles.remove(ROLE_IDS.streamer);
        console.log(`ℹ️ Removed Streamer role from ${user.tag}`);
      }
    }

    // Remove Viewer role
    if (reaction.message.id === roleMessageId && reaction.emoji.name === "👀") {
      if (member.roles.cache.has(ROLE_IDS.viewer)) {
        await member.roles.remove(ROLE_IDS.viewer);
        console.log(`ℹ️ Removed Viewer role from ${user.tag}`);
      }
    }

  } catch (err) {
    console.error("❌ Reaction remove error:", err);
  }
});

// ----------------------------
// CREATE PRIVATE ONBOARDING CHANNEL
// ----------------------------
async function createOnboardingChannel(guild, member) {
  try {
    const channelName = `welcome-${member.user.username.toLowerCase().replace(/[^a-z0-9]/g, "")}`;

    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: onboardingCategoryId,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel]
        },
        {
          id: member.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory
          ]
        },
        {
          id: ROLE_IDS.mods,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory]
        },
        {
          id: ROLE_IDS.admin,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory]
        },
        {
          id: ROLE_IDS.owner,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory]
        }
      ]
    });

    console.log(`✅ Created onboarding channel for ${member.user.tag}`);

    const genderEmbed = new EmbedBuilder()
      .setTitle(`🦕 Welcome, ${member.user.username}! You're verified!`)
      .setDescription(
        "You now have full access to the server! 🎉\n\n" +
        "Let's get you set up with your roles. First, an optional one:\n\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "😎 **BROS** — private hangout space for the guys\n" +
        "💅 **Gurls** — private hangout space for the girls\n" +
        "⏭️ **Skip** — no role assigned, no questions asked\n\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "⚠️ **This role is completely optional.**\n" +
        "BROS & Gurls roles exist in good faith for members who enjoy hanging out in a more relaxed same-gender space. " +
        "These unlock private hidden channels. You are under no obligation to pick one. " +
        "Skipping will not affect your access to the server in any way.\n\n" +
        "*This selection is completely private. Nobody else can see what you choose.*"
      )
      .setColor(0x9146FF);

    const genderRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`onboard_bros_${member.id}`)
        .setLabel("BROS")
        .setEmoji("😎")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`onboard_gurls_${member.id}`)
        .setLabel("Gurls")
        .setEmoji("💅")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`onboard_skip_gender_${member.id}`)
        .setLabel("Skip")
        .setEmoji("⏭️")
        .setStyle(ButtonStyle.Secondary)
    );

    await channel.send({ content: `${member}`, embeds: [genderEmbed], components: [genderRow] });

  } catch (err) {
    console.error("❌ Error creating onboarding channel:", err);
  }
}

// ----------------------------
// BUTTON INTERACTION HANDLER
// ----------------------------
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  const { customId, user, guild } = interaction;
  const member = await guild.members.fetch(user.id);

  try {
    // Existing member role buttons in #rules
    if (customId === "role_streamer") {
      await member.roles.add(ROLE_IDS.streamer);
      await interaction.reply({ content: "✅ You've been given the **Streamer** 🎮 role!", ephemeral: true });
      return;
    }

    if (customId === "role_viewer") {
      await member.roles.add(ROLE_IDS.viewer);
      await interaction.reply({ content: "✅ You've been given the **Viewer** 👀 role!", ephemeral: true });
      return;
    }

    // Onboarding buttons — verify the button belongs to this user
    const parts = customId.split("_");
    const memberId = parts[parts.length - 1];

    if (memberId !== user.id) {
      await interaction.reply({ content: "❌ These buttons are not for you!", ephemeral: true });
      return;
    }

    // BROS role
    if (customId.startsWith("onboard_bros_")) {
      await member.roles.add(ROLE_IDS.bros);
      await interaction.update({ content: "✅ **BROS** 😎 role assigned!", components: [] });
      await sendContentRoleSelection(interaction.channel, member);
      return;
    }

    // Gurls role
    if (customId.startsWith("onboard_gurls_")) {
      await member.roles.add(ROLE_IDS.gurls);
      await interaction.update({ content: "✅ **Gurls** 💅 role assigned!", components: [] });
      await sendContentRoleSelection(interaction.channel, member);
      return;
    }

    // Skip gender
    if (customId.startsWith("onboard_skip_gender_")) {
      await interaction.update({ content: "⏭️ Gender role skipped!", components: [] });
      await sendContentRoleSelection(interaction.channel, member);
      return;
    }

    // Streamer role
    if (customId.startsWith("onboard_streamer_")) {
      await member.roles.add(ROLE_IDS.streamer);
      await interaction.update({ content: "✅ **Streamer** 🎮 role assigned!", components: [] });
      await finishOnboarding(interaction.channel, member);
      return;
    }

    // Viewer role
    if (customId.startsWith("onboard_viewer_")) {
      await member.roles.add(ROLE_IDS.viewer);
      await interaction.update({ content: "✅ **Viewer** 👀 role assigned!", components: [] });
      await finishOnboarding(interaction.channel, member);
      return;
    }

  } catch (err) {
    console.error("❌ Button interaction error:", err);
    await interaction.reply({ content: "❌ Something went wrong. Please contact a mod.", ephemeral: true }).catch(() => {});
  }
});

// ----------------------------
// CONTENT ROLE SELECTION
// ----------------------------
async function sendContentRoleSelection(channel, member) {
  const embed = new EmbedBuilder()
    .setTitle("🎮 One more thing!")
    .setDescription(
      "Are you a streamer or a viewer?\n\n" +
      "🎮 **Streamer** — You stream on Twitch\n" +
      "👀 **Viewer** — You watch streams"
    )
    .setColor(0x9146FF);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`onboard_streamer_${member.id}`)
      .setLabel("Streamer")
      .setEmoji("🎮")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`onboard_viewer_${member.id}`)
      .setLabel("Viewer")
      .setEmoji("👀")
      .setStyle(ButtonStyle.Secondary)
  );

  await channel.send({ embeds: [embed], components: [row] });
}

// ----------------------------
// FINISH ONBOARDING
// ----------------------------
async function finishOnboarding(channel, member) {
  const embed = new EmbedBuilder()
    .setTitle("🦕 You're all set!")
    .setDescription(
      "Welcome to the crew! You now have full access to the server.\n\n" +
      "Have fun, be respectful, and enjoy the community! 🎉"
    )
    .setColor(0x57F287);

  await channel.send({ embeds: [embed] });
  console.log(`✅ Onboarding complete for ${member.user.tag}`);

  // Delete channel after 30 seconds
  setTimeout(async () => {
    await channel.delete().catch(() => {});
    console.log(`🗑️ Deleted onboarding channel for ${member.user.tag}`);
  }, 30000);
}

// ----------------------------
// HEALTH CHECK
// ----------------------------
app.get("/", (req, res) => {
  res.send("DinoBot running");
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
  if (!data.access_token) throw new Error(`Twitch OAuth failure: ${JSON.stringify(data)}`);
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
  if (!res.ok) throw new Error(`Failed to get Twitch users: ${JSON.stringify(data)}`);
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
  if (!res.ok) throw new Error(`Failed to get stream info: ${JSON.stringify(data)}`);
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

    if (!messageId || !timestamp || !signature) return res.status(400).send("Missing headers");

    const hmacMessage = messageId + timestamp + req.rawBody;
    const expectedSignature = "sha256=" + crypto.createHmac("sha256", secret).update(hmacMessage).digest("hex");

    const valid =
      expectedSignature.length === signature.length &&
      crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature));

    if (!valid) return res.status(403).send("Forbidden");

    if (processedMessageIds.has(messageId)) return res.status(200).send("Duplicate ignored");
    processedMessageIds.add(messageId);
    if (processedMessageIds.size > 1000) {
      processedMessageIds.delete(processedMessageIds.values().next().value);
    }

    if (messageType === "webhook_callback_verification") {
      return res.status(200).type("text/plain").send(req.body.challenge);
    }

    if (messageType === "notification" && req.body.subscription?.type === "stream.online") {
      const { broadcaster_user_id, broadcaster_user_login, broadcaster_user_name } = req.body.event;
      console.log(`📡 ${broadcaster_user_name} went live`);

      const token = await getTwitchToken();
      const stream = await getStreamInfo(token, broadcaster_user_id);
      const channel = await client.channels.fetch(process.env.DISCORD_CHANNEL_ID);

      if (!channel || !stream) return res.status(200).send("Missing data");

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

      await channel.send({ content: "@here 🔴 A friend just went live!", embeds: [embed] });
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