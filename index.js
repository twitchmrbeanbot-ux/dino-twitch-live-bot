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

const GUILD_ID = "1480080172400250992";
const WELCOME_CHANNEL_ID = "1480080173469532194";
const RULES_CHANNEL_ID = "1480080173469532195";
const INFO_CATEGORY_ID = "1480080173469532193";

const ROLE_IDS = {
  unverified: "1480647122285236438",
  goofyGoobers: "1480088633540083732",
  streamer: "1480647124038455498",
  viewer: "1480647124529189128",
  gamers: "1480674153722937354",
  creative: "1480674490231816403",
  mods: "1480282547769573538",
  admin: "1480083446704509091",
  owner: "1480082698159525909",
  streamAlerts: "1480729998339080232",
  announcements: "1480730218896556075"
};

let rulesMessageId = null;
let onboardingCategoryId = null;
let pickRolesChannelId = null;
let notificationChannelId = null;
let botInfoChannelId = null;
let supportChannelId = null;
let modTicketsChannelId = null;
let staffCategoryId = null;
let ticketsCategoryId = null;

const openTickets = new Map(); // userId -> channelId

process.on("unhandledRejection", (reason) => console.error("❌ UNHANDLED REJECTION:", reason));
process.on("uncaughtException", (err) => console.error("❌ UNCAUGHT EXCEPTION:", err));

app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; }
}));

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
    await setupPickRolesChannel();
    await setupNotificationChannel();
    await setupBotInfoChannel();
    await setupStaffCategory();
    await setupTicketsCategory();
    await setupSupportChannel();
    await setupModTicketsChannel();
    await lockChannelsForUnverified();
    console.log("✅ All systems ready");
  } catch (err) {
    console.error("❌ Setup error:", err);
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
    permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }]
  });

  onboardingCategoryId = category.id;
  console.log("✅ Onboarding category created");
}

// ----------------------------
// SETUP STAFF ONLY CATEGORY
// ----------------------------
async function setupStaffCategory() {
  const guild = await client.guilds.fetch(GUILD_ID);
  const channels = await guild.channels.fetch();
  const existing = channels.find(c => c.type === ChannelType.GuildCategory && c.name === "STAFF ONLY");

  if (existing) {
    staffCategoryId = existing.id;
    console.log("ℹ️ Staff Only category already exists");
    return;
  }

  const category = await guild.channels.create({
    name: "STAFF ONLY",
    type: ChannelType.GuildCategory,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: ROLE_IDS.mods, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks] },
      { id: ROLE_IDS.admin, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks] },
      { id: ROLE_IDS.owner, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks] }
    ]
  });

  staffCategoryId = category.id;
  console.log("✅ Staff Only category created");
}

// ----------------------------
// SETUP TICKETS CATEGORY
// ----------------------------
async function setupTicketsCategory() {
  const guild = await client.guilds.fetch(GUILD_ID);
  const channels = await guild.channels.fetch();
  const existing = channels.find(c => c.type === ChannelType.GuildCategory && c.name === "TICKETS");

  if (existing) {
    ticketsCategoryId = existing.id;
    console.log("ℹ️ Tickets category already exists");
    return;
  }

  const category = await guild.channels.create({
    name: "TICKETS",
    type: ChannelType.GuildCategory,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }
    ]
  });

  ticketsCategoryId = category.id;
  console.log("✅ Tickets category created");
}

// ----------------------------
// SETUP SUPPORT CHANNEL
// ----------------------------
async function setupSupportChannel() {
  const guild = await client.guilds.fetch(GUILD_ID);
  const channels = await guild.channels.fetch();

  const existing = channels.find(
    c => c.parentId === INFO_CATEGORY_ID && c.name === "🎟️support"
  );

  if (existing) {
    supportChannelId = existing.id;
    console.log("ℹ️ Support channel already exists");
    const messages = await existing.messages.fetch({ limit: 5 });
    const botMsg = messages.find(m => m.author.id === client.user.id && m.embeds.length > 0);
    if (botMsg) return;
    await postSupportMessage(existing);
    return;
  }

  const channel = await guild.channels.create({
    name: "🎟️support",
    type: ChannelType.GuildText,
    parent: INFO_CATEGORY_ID,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: ROLE_IDS.unverified, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: ROLE_IDS.goofyGoobers,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
        deny: [PermissionFlagsBits.SendMessages]
      }
    ]
  });

  supportChannelId = channel.id;
  console.log("✅ Support channel created");
  await postSupportMessage(channel);
}

// ----------------------------
// POST SUPPORT MESSAGE
// ----------------------------
async function postSupportMessage(channel) {
  const embed = new EmbedBuilder()
    .setTitle("🎟️ Support & Tickets")
    .setDescription(
      "Need help or want to reach the mods? Use the buttons below to open a ticket.\n\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
      "🚨 **Report a User** — report a member for breaking rules *(anonymous)*\n\n" +
      "💬 **General Feedback** — share general feedback about the server\n\n" +
      "💡 **Server Suggestion** — suggest a new feature or change\n\n" +
      "❓ **Question for Mods** — ask the mod team something privately\n\n" +
      "⚖️ **Appeal a Ban** — appeal a ban or punishment\n\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
      "⚠️ **You can only have one open ticket at a time.**\n" +
      "Please be patient — mods will respond as soon as possible.\n\n" +
      "*All tickets are private between you and the mod team.*"
    )
    .setColor(0x9146FF)
    .setFooter({ text: "DinoBot • Support System" });

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticket_report").setLabel("Report a User").setEmoji("🚨").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("ticket_feedback").setLabel("General Feedback").setEmoji("💬").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("ticket_suggestion").setLabel("Server Suggestion").setEmoji("💡").setStyle(ButtonStyle.Primary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticket_question").setLabel("Question for Mods").setEmoji("❓").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ticket_appeal").setLabel("Appeal a Ban").setEmoji("⚖️").setStyle(ButtonStyle.Secondary)
  );

  await channel.send({ embeds: [embed], components: [row1, row2] });
  console.log("✅ Support message posted");
}

// ----------------------------
// SETUP MOD TICKETS CHANNEL
// ----------------------------
async function setupModTicketsChannel() {
  const guild = await client.guilds.fetch(GUILD_ID);
  const channels = await guild.channels.fetch();

  const existing = channels.find(
    c => c.parentId === staffCategoryId && c.name === "🔒mod-tickets"
  );

  if (existing) {
    modTicketsChannelId = existing.id;
    console.log("ℹ️ Mod tickets channel already exists");
    return;
  }

  const channel = await guild.channels.create({
    name: "🔒mod-tickets",
    type: ChannelType.GuildText,
    parent: staffCategoryId,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: ROLE_IDS.mods, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks] },
      { id: ROLE_IDS.admin, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks] },
      { id: ROLE_IDS.owner, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks] }
    ]
  });

  modTicketsChannelId = channel.id;
  console.log("✅ Mod tickets channel created");
}

// ----------------------------
// SETUP PICK YOUR ROLES CHANNEL
// ----------------------------
async function setupPickRolesChannel() {
  const guild = await client.guilds.fetch(GUILD_ID);
  const channels = await guild.channels.fetch();

  const existing = channels.find(
    c => c.parentId === INFO_CATEGORY_ID && c.name === "🎭pick-your-roles"
  );

  if (existing) {
    pickRolesChannelId = existing.id;
    console.log("ℹ️ Pick your roles channel already exists");
    const messages = await existing.messages.fetch({ limit: 5 });
    const botMsg = messages.find(m => m.author.id === client.user.id && m.embeds.length > 0);
    if (botMsg) return;
    await postPickRolesMessage(existing);
    return;
  }

  const channel = await guild.channels.create({
    name: "🎭pick-your-roles",
    type: ChannelType.GuildText,
    parent: INFO_CATEGORY_ID,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: ROLE_IDS.unverified, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: ROLE_IDS.goofyGoobers,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
        deny: [PermissionFlagsBits.SendMessages]
      }
    ]
  });

  pickRolesChannelId = channel.id;
  console.log("✅ Pick your roles channel created");
  await postPickRolesMessage(channel);
}

// ----------------------------
// POST PICK ROLES MESSAGE
// ----------------------------
async function postPickRolesMessage(channel) {
  const embed = new EmbedBuilder()
    .setTitle("🎭 Pick Your Roles")
    .setDescription(
      "Use the buttons below to assign or update your roles anytime!\n\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
      "**Optional — Interest Space**\n\n" +
      "🎮 **Gamers** — private hangout space for gamers\n" +
      "🎨 **Creative** — private hangout space for creative types\n\n" +
      "⚠️ These roles are completely optional and exist as private spaces for members with shared interests. " +
      "These unlock private hidden channels. You are under no obligation to pick one.\n\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
      "**Content Role**\n\n" +
      "🎙️ **Streamer** — You stream on Twitch\n" +
      "👀 **Viewer** — You watch streams\n\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
      "*Clicking a role button will toggle it on or off.*"
    )
    .setColor(0x9146FF)
    .setFooter({ text: "DinoBot • Role Selection" });

  const interestRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("roles_gamers").setLabel("Gamers").setEmoji("🎮").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("roles_creative").setLabel("Creative").setEmoji("🎨").setStyle(ButtonStyle.Primary)
  );

  const contentRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("roles_streamer").setLabel("Streamer").setEmoji("🎙️").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("roles_viewer").setLabel("Viewer").setEmoji("👀").setStyle(ButtonStyle.Secondary)
  );

  await channel.send({ embeds: [embed], components: [interestRow, contentRow] });
  console.log("✅ Pick your roles message posted");
}

// ----------------------------
// SETUP NOTIFICATION CHANNEL
// ----------------------------
async function setupNotificationChannel() {
  const guild = await client.guilds.fetch(GUILD_ID);
  const channels = await guild.channels.fetch();

  const existing = channels.find(
    c => c.parentId === INFO_CATEGORY_ID && c.name === "🔔notification-settings"
  );

  if (existing) {
    notificationChannelId = existing.id;
    console.log("ℹ️ Notification settings channel already exists");
    const messages = await existing.messages.fetch({ limit: 5 });
    const botMsg = messages.find(m => m.author.id === client.user.id && m.embeds.length > 0);
    if (botMsg) return;
    await postNotificationMessage(existing);
    return;
  }

  const channel = await guild.channels.create({
    name: "🔔notification-settings",
    type: ChannelType.GuildText,
    parent: INFO_CATEGORY_ID,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: ROLE_IDS.unverified, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: ROLE_IDS.goofyGoobers,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
        deny: [PermissionFlagsBits.SendMessages]
      }
    ]
  });

  notificationChannelId = channel.id;
  console.log("✅ Notification settings channel created");
  await postNotificationMessage(channel);
}

// ----------------------------
// POST NOTIFICATION MESSAGE
// ----------------------------
async function postNotificationMessage(channel) {
  const embed = new EmbedBuilder()
    .setTitle("🔔 Notification Settings")
    .setDescription(
      "Choose which notifications you want to receive.\n\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
      "🔴 **Stream Alerts** — get pinged when a DinoGang member goes live on Twitch\n\n" +
      "📢 **Announcements** — get pinged for important server announcements\n\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
      "*Clicking a button will toggle the notification on or off. Only you can see the confirmation message.*"
    )
    .setColor(0x9146FF)
    .setFooter({ text: "DinoBot • Notification Settings" });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("notif_stream_alerts").setLabel("Stream Alerts").setEmoji("🔴").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("notif_announcements").setLabel("Announcements").setEmoji("📢").setStyle(ButtonStyle.Primary)
  );

  await channel.send({ embeds: [embed], components: [row] });
  console.log("✅ Notification settings message posted");
}

// ----------------------------
// SETUP BOT INFO CHANNEL
// ----------------------------
async function setupBotInfoChannel() {
  const guild = await client.guilds.fetch(GUILD_ID);
  const channels = await guild.channels.fetch();

  const existing = channels.find(
    c => c.parentId === INFO_CATEGORY_ID && c.name === "🤖bot-info"
  );

  if (existing) {
    botInfoChannelId = existing.id;
    console.log("ℹ️ Bot info channel already exists");
    const messages = await existing.messages.fetch({ limit: 5 });
    const botMsg = messages.find(m => m.author.id === client.user.id && m.embeds.length > 0);
    if (!botMsg) await postBotInfoMessage(existing);
    return;
  }

  const channel = await guild.channels.create({
    name: "🤖bot-info",
    type: ChannelType.GuildText,
    parent: INFO_CATEGORY_ID,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: ROLE_IDS.unverified, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: ROLE_IDS.goofyGoobers,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
        deny: [PermissionFlagsBits.SendMessages]
      }
    ]
  });

  botInfoChannelId = channel.id;
  console.log("✅ Bot info channel created");
  await postBotInfoMessage(channel);
}

// ----------------------------
// POST BOT INFO MESSAGE
// ----------------------------
async function postBotInfoMessage(channel) {
  const embed = new EmbedBuilder()
    .setTitle("🤖 DinoBot — Server Guide")
    .setDescription(
      "Hey there! I'm **DinoBot** 🦕 — the custom bot built specifically for **DinoGang**.\n\n" +
      "Here's everything I do and how to use me.\n\n" +

      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +

      "**⚙️ What DinoBot Does**\n\n" +
      "🔴 **Twitch Live Alerts** — automatically posts an alert whenever a DinoGang member goes live on Twitch\n\n" +
      "👋 **Member Onboarding** — when you join, DinoBot creates a private channel just for you to get set up with rules and roles\n\n" +
      "🎭 **Role Management** — self-assign interest, content, and notification roles at any time\n\n" +
      "🔔 **Notification Controls** — opt in or out of stream alerts and announcements pings whenever you want\n\n" +
      "🔒 **Channel Lockdown** — new members can only see #welcome and #rules until onboarding is complete\n\n" +
      "🎟️ **Ticket System** — submit private tickets to the mod team for reports, feedback, suggestions, and more\n\n" +

      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +

      "**🗺️ Server Features**\n\n" +
      "📋 `#rules` — server rules, read-only\n" +
      "🎭 `#🎭pick-your-roles` — toggle your Gamers, Creative, Streamer, and Viewer roles\n" +
      "🔔 `#🔔notification-settings` — opt in or out of Stream Alerts and Announcements\n" +
      "🎟️ `#🎟️support` — open a private ticket with the mod team\n" +
      "🎮 `Gamers` — private space for gamers *(requires Gamers role)*\n" +
      "🎨 `Creative` — private space for creative types *(requires Creative role)*\n\n" +

      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +

      "**👋 How Onboarding Works**\n\n" +
      "When you first join the server DinoBot creates a private channel just for you:\n\n" +
      "**Step 1** ✅ — Read and accept the server rules\n" +
      "**Step 2** 🎭 — Pick an optional interest space *(Gamers, Creative, or skip)*\n" +
      "**Step 3** 🎙️ — Pick your content role *(Streamer or Viewer)*\n" +
      "**Step 4** 🔔 — Set your notification preferences *(or skip)*\n\n" +
      "Once complete your private onboarding channel self-destructs and you have full server access! 🎉\n\n" +

      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +

      "**🎟️ How the Ticket System Works**\n\n" +
      "Head to `#🎟️support` and click a button to open a ticket:\n\n" +
      "🚨 **Report a User** — report rule-breaking *(fully anonymous)*\n" +
      "💬 **General Feedback** — share feedback about the server\n" +
      "💡 **Server Suggestion** — suggest a new feature or change\n" +
      "❓ **Question for Mods** — ask the mod team something privately\n" +
      "⚖️ **Appeal a Ban** — appeal a ban or punishment\n\n" +
      "⚠️ You can only have **one open ticket at a time**. Once it's resolved you can open another.\n\n" +

      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +

      "**🛠️ Commands**\n\n" +
      "*Slash commands coming soon!*\n\n" +

      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
      "*DinoBot is a custom bot built for DinoGang* 🦕"
    )
    .setColor(0x9146FF)
    .setFooter({ text: "DinoBot • Server Guide" });

  await channel.send({ embeds: [embed] });
  console.log("✅ Bot info message posted");
}

// ----------------------------
// LOCK CHANNELS FOR UNVERIFIED
// ----------------------------
async function lockChannelsForUnverified() {
  const guild = await client.guilds.fetch(GUILD_ID);
  const channels = await guild.channels.fetch();

  for (const channel of channels.values()) {
    if (!channel) continue;
    if (channel.id === onboardingCategoryId) continue;
    if (channel.parentId === onboardingCategoryId) continue;
    if (channel.id === staffCategoryId) continue;
    if (channel.parentId === staffCategoryId) continue;
    if (channel.id === ticketsCategoryId) continue;
    if (channel.parentId === ticketsCategoryId) continue;

    if (channel.id === WELCOME_CHANNEL_ID || channel.id === RULES_CHANNEL_ID) {
      await channel.permissionOverwrites.edit(ROLE_IDS.unverified, {
        ViewChannel: true, SendMessages: false, AddReactions: false, ReadMessageHistory: true
      }).catch(() => {});
      continue;
    }

    if (
      channel.type === ChannelType.GuildCategory ||
      channel.type === ChannelType.GuildText ||
      channel.type === ChannelType.GuildVoice ||
      channel.type === ChannelType.GuildAnnouncement
    ) {
      await channel.permissionOverwrites.edit(ROLE_IDS.unverified, { ViewChannel: false }).catch(() => {});
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

  if (botMessages.size >= 1) {
    const sorted = botMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    rulesMessageId = sorted.first().id;
    console.log("ℹ️ Rules message already exists");
    return;
  }

  for (const msg of botMessages.values()) await msg.delete().catch(() => {});

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
    .setColor(0x9146FF);

  const rulesMsg = await rulesChannel.send({ embeds: [rulesEmbed] });
  rulesMessageId = rulesMsg.id;
  console.log("✅ Rules message posted");
}

// ----------------------------
// WELCOME NEW MEMBERS
// ----------------------------
client.on("guildMemberAdd", async (member) => {
  try {
    console.log(`👋 New member joined: ${member.user.tag}`);
    await member.roles.add(ROLE_IDS.unverified);

    const guild = await client.guilds.fetch(GUILD_ID);
    const welcomeChannel = await client.channels.fetch(WELCOME_CHANNEL_ID);

    const welcomeEmbed = new EmbedBuilder()
      .setTitle(`🦕 Welcome to the server, ${member.user.username}!`)
      .setDescription(
        `Hey ${member}! Welcome to the community! 🎉\n\n` +
        "**To get started:**\n" +
        "Head over to your **private onboarding channel** under the ONBOARDING category — DinoBot has set it up just for you!\n\n" +
        "Inside you'll find the server rules and everything you need to get set up. See you in there! 🦕"
      )
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .setColor(0x9146FF)
      .setFooter({ text: `Member #${guild.memberCount}` })
      .setTimestamp();

    await welcomeChannel.send({ embeds: [welcomeEmbed] });
    await createOnboardingChannel(guild, member);
  } catch (err) {
    console.error("❌ Error handling new member:", err);
  }
});

// ----------------------------
// CREATE PRIVATE ONBOARDING CHANNEL
// ----------------------------
async function createOnboardingChannel(guild, member) {
  try {
    const channelName = `welcome-${member.user.username.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
    const channels = await guild.channels.fetch();
    const existing = channels.find(c => c.parentId === onboardingCategoryId && c.name === channelName);

    if (existing) {
      console.log(`ℹ️ Onboarding channel already exists for ${member.user.tag}`);
      return;
    }

    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: onboardingCategoryId,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        { id: ROLE_IDS.mods, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] },
        { id: ROLE_IDS.admin, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] },
        { id: ROLE_IDS.owner, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] }
      ]
    });

    console.log(`✅ Created onboarding channel for ${member.user.tag}`);

    const rulesEmbed = new EmbedBuilder()
      .setTitle("📋 Server Rules")
      .setDescription(
        `Hey ${member}! Welcome to **DinoGang** 🦕\n\n` +
        "Before you get access to the server please read and accept the rules below.\n\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
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
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
        "✔️ **We're all here to hang out, game, and have fun. Be respectful and enjoy the community.**\n\n" +
        "*By clicking **Accept Rules** below you confirm you are 18+ and agree to follow all server rules.*"
      )
      .setColor(0x9146FF)
      .setFooter({ text: "Step 1 of 4 — Accept Rules" });

    const rulesRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`onboard_accept_rules_${member.id}`)
        .setLabel("Accept Rules")
        .setEmoji("✅")
        .setStyle(ButtonStyle.Success)
    );

    await channel.send({ content: `${member}`, embeds: [rulesEmbed], components: [rulesRow] });
  } catch (err) {
    console.error("❌ Error creating onboarding channel:", err);
  }
}

// ----------------------------
// CREATE TICKET CHANNEL
// ----------------------------
async function createTicketChannel(guild, member, ticketType, anonymous) {
  const safeName = member.user.username.toLowerCase().replace(/[^a-z0-9]/g, "");
  const channelName = `ticket-${safeName}`;

  const channels = await guild.channels.fetch();
  const existing = channels.find(c => c.parentId === ticketsCategoryId && c.name === channelName);

  if (existing) return null; // already has open ticket

  const permOverwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: ROLE_IDS.mods, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks] },
    { id: ROLE_IDS.admin, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks] },
    { id: ROLE_IDS.owner, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks] }
  ];

  if (!anonymous) {
    permOverwrites.push({
      id: member.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
    });
  }

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: ticketsCategoryId,
    permissionOverwrites
  });

  openTickets.set(member.id, channel.id);

  const typeLabels = {
    report: "🚨 Report a User",
    feedback: "💬 General Feedback",
    suggestion: "💡 Server Suggestion",
    question: "❓ Question for Mods",
    appeal: "⚖️ Appeal a Ban"
  };

  const embed = new EmbedBuilder()
    .setTitle(`🎟️ ${typeLabels[ticketType]}`)
    .setDescription(
      (anonymous
        ? "🔒 **This ticket is anonymous.** The mod team cannot see who submitted it.\n\n"
        : `👤 **Submitted by:** ${member}\n\n`) +
      "Please describe your issue in as much detail as possible. The mod team will respond shortly.\n\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
      "*Use the buttons below to close this ticket when resolved.*"
    )
    .setColor(0x9146FF)
    .setTimestamp()
    .setFooter({ text: `DinoBot • Ticket System • ${typeLabels[ticketType]}` });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_resolve_${member.id}`)
      .setLabel("Resolve")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`ticket_close_${member.id}`)
      .setLabel("Close Without Resolving")
      .setEmoji("🗑️")
      .setStyle(ButtonStyle.Danger)
  );

  const staffPing = `<@&${ROLE_IDS.mods}>`;
  await channel.send({
    content: anonymous ? `${staffPing} 🎟️ New anonymous ticket!` : `${staffPing} 🎟️ New ticket from ${member}!`,
    embeds: [embed],
    components: [row]
  });

  console.log(`✅ Ticket created: ${channelName} (${ticketType}${anonymous ? ", anonymous" : ""})`);
  return channel;
}

// ----------------------------
// BUTTON INTERACTION HANDLER
// ----------------------------
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  const { customId, user, guild } = interaction;
  const member = await guild.members.fetch(user.id);

  try {

    // ----------------------------
    // TICKET BUTTONS
    // ----------------------------
    const ticketTypes = ["report", "feedback", "suggestion", "question", "appeal"];
    const ticketMatch = ticketTypes.find(t => customId === `ticket_${t}`);

    if (ticketMatch) {
      // Check for existing open ticket
      if (openTickets.has(user.id)) {
        const existingChannelId = openTickets.get(user.id);
        await interaction.reply({
          content: `❌ You already have an open ticket! Please resolve it before opening a new one. <#${existingChannelId}>`,
          flags: 64
        });
        return;
      }

      const anonymous = ticketMatch === "report";
      const ticketChannel = await createTicketChannel(guild, member, ticketMatch, anonymous);

      if (!ticketChannel) {
        await interaction.reply({
          content: "❌ You already have an open ticket! Please resolve it before opening a new one.",
          flags: 64
        });
        return;
      }

      if (anonymous) {
        await interaction.reply({
          content: `🔒 Your anonymous ticket has been submitted. The mod team will handle it shortly.`,
          flags: 64
        });
      } else {
        await interaction.reply({
          content: `✅ Your ticket has been created! <#${ticketChannel.id}>`,
          flags: 64
        });
      }
      return;
    }

    // Resolve ticket
    if (customId.startsWith("ticket_resolve_")) {
      const ticketUserId = customId.replace("ticket_resolve_", "");
      await logAndCloseTicket(guild, interaction.channel, ticketUserId, "resolved", interaction.user);
      await interaction.update({ components: [] }).catch(() => {});
      return;
    }

    // Close without resolving
    if (customId.startsWith("ticket_close_")) {
      const ticketUserId = customId.replace("ticket_close_", "");
      await logAndCloseTicket(guild, interaction.channel, ticketUserId, "closed", interaction.user);
      await interaction.update({ components: [] }).catch(() => {});
      return;
    }

    // ----------------------------
    // NOTIFICATION BUTTONS
    // ----------------------------
    if (customId === "notif_stream_alerts") {
      if (member.roles.cache.has(ROLE_IDS.streamAlerts)) {
        await member.roles.remove(ROLE_IDS.streamAlerts);
        await interaction.reply({ content: "🔕 **Stream Alerts** disabled — you won't be pinged when someone goes live.", flags: 64 });
      } else {
        await member.roles.add(ROLE_IDS.streamAlerts);
        await interaction.reply({ content: "🔔 **Stream Alerts** enabled — you'll be pinged when someone goes live!", flags: 64 });
      }
      return;
    }

    if (customId === "notif_announcements") {
      if (member.roles.cache.has(ROLE_IDS.announcements)) {
        await member.roles.remove(ROLE_IDS.announcements);
        await interaction.reply({ content: "🔕 **Announcements** disabled — you won't be pinged for server announcements.", flags: 64 });
      } else {
        await member.roles.add(ROLE_IDS.announcements);
        await interaction.reply({ content: "🔔 **Announcements** enabled — you'll be pinged for important server announcements!", flags: 64 });
      }
      return;
    }

    // ----------------------------
    // PICK YOUR ROLES BUTTONS
    // ----------------------------
    if (customId === "roles_gamers") {
      if (member.roles.cache.has(ROLE_IDS.gamers)) {
        await member.roles.remove(ROLE_IDS.gamers);
        await interaction.reply({ content: "✅ **Gamers** 🎮 role removed!", flags: 64 });
      } else {
        await member.roles.add(ROLE_IDS.gamers);
        await interaction.reply({ content: "✅ **Gamers** 🎮 role assigned!", flags: 64 });
      }
      return;
    }

    if (customId === "roles_creative") {
      if (member.roles.cache.has(ROLE_IDS.creative)) {
        await member.roles.remove(ROLE_IDS.creative);
        await interaction.reply({ content: "✅ **Creative** 🎨 role removed!", flags: 64 });
      } else {
        await member.roles.add(ROLE_IDS.creative);
        await interaction.reply({ content: "✅ **Creative** 🎨 role assigned!", flags: 64 });
      }
      return;
    }

    if (customId === "roles_streamer") {
      if (member.roles.cache.has(ROLE_IDS.streamer)) {
        await member.roles.remove(ROLE_IDS.streamer);
        await interaction.reply({ content: "✅ **Streamer** 🎙️ role removed!", flags: 64 });
      } else {
        await member.roles.add(ROLE_IDS.streamer);
        await interaction.reply({ content: "✅ **Streamer** 🎙️ role assigned!", flags: 64 });
      }
      return;
    }

    if (customId === "roles_viewer") {
      if (member.roles.cache.has(ROLE_IDS.viewer)) {
        await member.roles.remove(ROLE_IDS.viewer);
        await interaction.reply({ content: "✅ **Viewer** 👀 role removed!", flags: 64 });
      } else {
        await member.roles.add(ROLE_IDS.viewer);
        await interaction.reply({ content: "✅ **Viewer** 👀 role assigned!", flags: 64 });
      }
      return;
    }

    // ----------------------------
    // ONBOARDING BUTTONS
    // ----------------------------
    const parts = customId.split("_");
    const memberId = parts[parts.length - 1];

    if (memberId !== user.id) {
      await interaction.reply({ content: "❌ These buttons are not for you!", flags: 64 });
      return;
    }

    if (customId.startsWith("onboard_accept_rules_")) {
      await member.roles.remove(ROLE_IDS.unverified);
      await member.roles.add(ROLE_IDS.goofyGoobers);
      console.log(`✅ Rules accepted: ${user.tag}`);

      await interaction.update({
        embeds: [new EmbedBuilder()
          .setTitle("✅ Rules Accepted!")
          .setDescription("You're verified! Now let's get your roles set up.")
          .setColor(0x57F287)
          .setFooter({ text: "Step 1 of 4 — Complete ✅" })],
        components: []
      });

      await sendInterestRoleSelection(interaction.channel, member);
      return;
    }

    if (customId.startsWith("onboard_gamers_")) {
      await member.roles.add(ROLE_IDS.gamers);
      await interaction.update({
        embeds: [new EmbedBuilder()
          .setTitle("🎮 Gamers role assigned!")
          .setDescription("Nice! Keep going...")
          .setColor(0x9146FF)
          .setFooter({ text: "Step 2 of 4 — Complete ✅" })],
        components: []
      });
      await sendContentRoleSelection(interaction.channel, member);
      return;
    }

    if (customId.startsWith("onboard_creative_")) {
      await member.roles.add(ROLE_IDS.creative);
      await interaction.update({
        embeds: [new EmbedBuilder()
          .setTitle("🎨 Creative role assigned!")
          .setDescription("Nice! Keep going...")
          .setColor(0x9146FF)
          .setFooter({ text: "Step 2 of 4 — Complete ✅" })],
        components: []
      });
      await sendContentRoleSelection(interaction.channel, member);
      return;
    }

    if (customId.startsWith("onboard_skip_interest_")) {
      await interaction.update({
        embeds: [new EmbedBuilder()
          .setTitle("⏭️ Skipped!")
          .setDescription("No worries! Keep going...")
          .setColor(0x9146FF)
          .setFooter({ text: "Step 2 of 4 — Complete ✅" })],
        components: []
      });
      await sendContentRoleSelection(interaction.channel, member);
      return;
    }

    if (customId.startsWith("onboard_streamer_")) {
      await member.roles.add(ROLE_IDS.streamer);
      await interaction.update({
        embeds: [new EmbedBuilder()
          .setTitle("🎙️ Streamer role assigned!")
          .setDescription("Almost done!")
          .setColor(0x57F287)
          .setFooter({ text: "Step 3 of 4 — Complete ✅" })],
        components: []
      });
      await sendNotificationSelection(interaction.channel, member);
      return;
    }

    if (customId.startsWith("onboard_viewer_")) {
      await member.roles.add(ROLE_IDS.viewer);
      await interaction.update({
        embeds: [new EmbedBuilder()
          .setTitle("👀 Viewer role assigned!")
          .setDescription("Almost done!")
          .setColor(0x57F287)
          .setFooter({ text: "Step 3 of 4 — Complete ✅" })],
        components: []
      });
      await sendNotificationSelection(interaction.channel, member);
      return;
    }

    if (customId.startsWith("onboard_notif_")) {
      const stripped = customId.replace(`onboard_notif_`, "").replace(`_${memberId}`, "");

      if (stripped.includes("stream")) await member.roles.add(ROLE_IDS.streamAlerts);
      if (stripped.includes("announcements")) await member.roles.add(ROLE_IDS.announcements);

      const selected = [];
      if (stripped.includes("stream")) selected.push("🔴 Stream Alerts");
      if (stripped.includes("announcements")) selected.push("📢 Announcements");

      await interaction.update({
        embeds: [new EmbedBuilder()
          .setTitle("🔔 Notifications set!")
          .setDescription(
            selected.length
              ? `You selected: **${selected.join(", ")}**\n\nYou can change this anytime in #🔔notification-settings.`
              : "No notifications selected. You can opt in anytime in #🔔notification-settings."
          )
          .setColor(0x57F287)
          .setFooter({ text: "Step 4 of 4 — Complete ✅" })],
        components: []
      });

      await finishOnboarding(interaction.channel, member);
      return;
    }

  } catch (err) {
    console.error("❌ Button interaction error:", err);
    await interaction.reply({ content: "❌ Something went wrong. Please contact a mod.", flags: 64 }).catch(() => {});
  }
});

// ----------------------------
// LOG AND CLOSE TICKET
// ----------------------------
async function logAndCloseTicket(guild, channel, ticketUserId, status, closedBy) {
  try {
    const messages = await channel.messages.fetch({ limit: 50 });
    const firstEmbed = messages.filter(m => m.embeds.length > 0).last();
    const ticketType = firstEmbed?.embeds[0]?.footer?.text?.replace("DinoBot • Ticket System • ", "") || "Unknown";

    openTickets.delete(ticketUserId);

    if (modTicketsChannelId) {
      const logChannel = await guild.channels.fetch(modTicketsChannelId).catch(() => null);
      if (logChannel) {
        const logEmbed = new EmbedBuilder()
          .setTitle(`🎟️ Ticket ${status === "resolved" ? "Resolved ✅" : "Closed 🗑️"}`)
          .setDescription(
            `**Type:** ${ticketType}\n` +
            `**Status:** ${status === "resolved" ? "✅ Resolved" : "🗑️ Closed without resolving"}\n` +
            `**Closed by:** ${closedBy}\n` +
            `**Channel:** ${channel.name}`
          )
          .setColor(status === "resolved" ? 0x57F287 : 0xED4245)
          .setTimestamp()
          .setFooter({ text: "DinoBot • Ticket Log" });

        await logChannel.send({ embeds: [logEmbed] });
      }
    }

    setTimeout(async () => {
      await channel.delete().catch(() => {});
      console.log(`🗑️ Ticket channel deleted: ${channel.name}`);
    }, 5000);

  } catch (err) {
    console.error("❌ Error closing ticket:", err);
  }
}

// ----------------------------
// STEP 2 — INTEREST ROLE SELECTION
// ----------------------------
async function sendInterestRoleSelection(channel, member) {
  const embed = new EmbedBuilder()
    .setTitle("🎭 Optional Role")
    .setDescription(
      "Want access to a private interest space?\n\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
      "🎮 **Gamers** — private hangout for gamers\n" +
      "🎨 **Creative** — private hangout for creative types\n" +
      "⏭️ **Skip** — no role assigned, no questions asked\n\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
      "⚠️ **This role is completely optional.**\n" +
      "These unlock private hidden channels based on your interests.\n\n" +
      "*This selection is completely private. Nobody else can see what you choose.*"
    )
    .setColor(0x9146FF)
    .setFooter({ text: "Step 2 of 4 — Pick a role or skip" });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`onboard_gamers_${member.id}`).setLabel("Gamers").setEmoji("🎮").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`onboard_creative_${member.id}`).setLabel("Creative").setEmoji("🎨").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`onboard_skip_interest_${member.id}`).setLabel("Skip").setEmoji("⏭️").setStyle(ButtonStyle.Secondary)
  );

  await channel.send({ embeds: [embed], components: [row] });
}

// ----------------------------
// STEP 3 — CONTENT ROLE SELECTION
// ----------------------------
async function sendContentRoleSelection(channel, member) {
  const embed = new EmbedBuilder()
    .setTitle("🎮 Content Role")
    .setDescription(
      "Are you a streamer or a viewer?\n\n" +
      "🎙️ **Streamer** — You stream on Twitch\n" +
      "👀 **Viewer** — You watch streams"
    )
    .setColor(0x9146FF)
    .setFooter({ text: "Step 3 of 4 — Pick your content role" });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`onboard_streamer_${member.id}`).setLabel("Streamer").setEmoji("🎙️").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`onboard_viewer_${member.id}`).setLabel("Viewer").setEmoji("👀").setStyle(ButtonStyle.Secondary)
  );

  await channel.send({ embeds: [embed], components: [row] });
}

// ----------------------------
// STEP 4 — NOTIFICATION SELECTION
// ----------------------------
async function sendNotificationSelection(channel, member) {
  const embed = new EmbedBuilder()
    .setTitle("🔔 Notification Preferences")
    .setDescription(
      "Last step! Choose which notifications you want to receive.\n\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
      "🔴 **Stream Alerts** — get pinged when a DinoGang member goes live\n\n" +
      "📢 **Announcements** — get pinged for important server announcements\n\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
      "⏭️ Skip to opt out of all pings.\n\n" +
      "*You can change this anytime in #🔔notification-settings.*"
    )
    .setColor(0x9146FF)
    .setFooter({ text: "Step 4 of 4 — Notification preferences" });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`onboard_notif_stream_${member.id}`).setLabel("Stream Alerts").setEmoji("🔴").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`onboard_notif_announcements_${member.id}`).setLabel("Announcements").setEmoji("📢").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`onboard_notif_stream_and_announcements_${member.id}`).setLabel("Both").setEmoji("🔔").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`onboard_notif_skip_${member.id}`).setLabel("Skip").setEmoji("⏭️").setStyle(ButtonStyle.Secondary)
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
      "Welcome to the crew! You now have full access to the server. 🎉\n\n" +
      "This channel will self-destruct in 30 seconds. See you in there!"
    )
    .setColor(0x57F287)
    .setFooter({ text: "Onboarding complete — channel deleting in 30 seconds" });

  await channel.send({ embeds: [embed] });
  console.log(`✅ Onboarding complete for ${member.user.tag}`);

  setTimeout(async () => {
    await channel.delete().catch(() => {});
    console.log(`🗑️ Deleted onboarding channel for ${member.user.tag}`);
  }, 30000);
}

// ----------------------------
// HEALTH CHECK
// ----------------------------
app.get("/", (req, res) => res.send("DinoBot running"));

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
    headers: { "Client-ID": process.env.TWITCH_CLIENT_ID, "Authorization": `Bearer ${token}` }
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
    headers: { "Client-ID": process.env.TWITCH_CLIENT_ID, "Authorization": `Bearer ${token}` }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Failed to get stream info: ${JSON.stringify(data)}`);
  return data.data[0] || null;
}

async function subscribeToTwitchUsers() {
  const logins = process.env.TWITCH_USER_LOGINS
    .split(",").map(l => l.trim().toLowerCase()).filter(Boolean);

  console.log("Monitoring:", logins.join(", "));

  const token = await getTwitchToken();
  const users = await getTwitchUserIds(token, logins);

  if (!users.length) { console.warn("⚠️ No Twitch users found"); return; }

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

const processedMessageIds = new Set();

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
    if (processedMessageIds.size > 1000) processedMessageIds.delete(processedMessageIds.values().next().value);

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

      const thumbnailUrl = stream.thumbnail_url.replace("{width}", "1280").replace("{height}", "720");

      const embed = new EmbedBuilder()
        .setTitle(`🦕 ${broadcaster_user_name} is now LIVE on Twitch!`)
        .setURL(`https://twitch.tv/${broadcaster_user_login}`)
        .setDescription(`**${stream.title}**\n\n🎮 Playing: ${stream.game_name}`)
        .setImage(thumbnailUrl)
        .setColor(0x9146FF)
        .setFooter({ text: "Twitch Live Alert • DinoBot" })
        .setTimestamp();

      await channel.send({ content: "<@&1480729998339080232> 🔴 A friend just went live!", embeds: [embed] });
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

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));

(async () => {
  try {
    const token = (process.env.DISCORD_TOKEN || "").trim();
    await new Promise(resolve => setTimeout(resolve, 3000));
    await Promise.race([
      client.login(token),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Discord login timeout")), 30000))
    ]);
  } catch (err) {
    console.error("❌ Discord login failed:", err.message);
  }
})();