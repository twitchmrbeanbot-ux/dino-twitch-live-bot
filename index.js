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
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");
const crypto = require("crypto");
const fs = require("fs");
const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));

const app = express();
const PORT = process.env.PORT || 3000;

const GUILD_ID = "1480080172400250992";
const WELCOME_CHANNEL_ID = "1480080173469532194";
const RULES_CHANNEL_ID = "1480080173469532195";
const INFO_CATEGORY_ID = "1480080173469532193";
const PICK_ROLES_CHANNEL_ID = "1481032622460370954";
const NOTIFICATION_CHANNEL_ID = "1481033002308997120";
const BOT_INFO_CHANNEL_ID = "1481033456724082739";
const SUPPORT_CHANNEL_ID = "1481034688578719774";
const BIRTHDAY_REGISTER_CHANNEL_ID = "1480764987034304535";
const MOD_LOGS_CHANNEL_ID = "1480080173469532199";
const SPAM_LOGS_CHANNEL_ID = "1480080173868257333";
const MOD_CHAT_CHANNEL_ID = "1480080173868257334";
const MRBEAN_ANNOUNCEMENTS_CHANNEL_ID = "1480080173868257336";
const MRBEAN_CATEGORY_ID = "1480099688739901531";
const STREAMING_CATEGORY_ID = "1480080174123978822";
const MRBEAN_TWITCH_LOGIN = "mrbeanthedino";

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
  announcements: "1480730218896556075",
  birthday: "1480762436909928550"
};

const MIN_ACCOUNT_AGE_DAYS = 7;
const BIRTHDAY_FILE = "./birthdays.json";
const SCHEDULE_FILE = "./schedules.json";

let birthdays = {};
if (fs.existsSync(BIRTHDAY_FILE)) {
  try { birthdays = JSON.parse(fs.readFileSync(BIRTHDAY_FILE, "utf8")); }
  catch { birthdays = {}; }
}

let schedules = {};
if (fs.existsSync(SCHEDULE_FILE)) {
  try { schedules = JSON.parse(fs.readFileSync(SCHEDULE_FILE, "utf8")); }
  catch { schedules = {}; }
}

function saveBirthdays() {
  fs.writeFileSync(BIRTHDAY_FILE, JSON.stringify(birthdays, null, 2));
}

function saveSchedules() {
  fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(schedules, null, 2));
}

let onboardingCategoryId = null;
let modTicketsChannelId = null;
let staffCategoryId = null;
let ticketsCategoryId = null;
let birthdayCategoryId = null;
let mrbeanScheduleChannelId = null;
let crewScheduleChannelId = null;
let crewScheduleMessageId = null;
let mrbeanScheduleMessageId = null;

const openTickets = new Map();

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
    await setupBirthdayCategory();
    await setupBirthdayRegisterChannel();
    await setupMrBeanScheduleChannel();
    await setupCrewScheduleChannel();
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
  startBirthdayScheduler();
});

client.on("error", (err) => console.error("❌ Discord client error:", err));
client.on("shardDisconnect", (event, id) => console.warn(`⚠️ Shard ${id} disconnected`));
client.on("shardError", (error, shardId) => console.error(`❌ Shard ${shardId} error:`, error));
client.on("invalidated", () => console.error("❌ Discord session invalidated"));

// ----------------------------
// BIRTHDAY SCHEDULER
// ----------------------------
function startBirthdayScheduler() {
  console.log("🎂 Birthday scheduler started");
  scheduleDailyBirthdayCheck();
}

function scheduleDailyBirthdayCheck() {
  const now = new Date();
  const nextMidnightUTC = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0
  ));
  const msUntilMidnight = nextMidnightUTC - now;
  setTimeout(async () => {
    await runBirthdayCheck();
    setInterval(runBirthdayCheck, 24 * 60 * 60 * 1000);
  }, msUntilMidnight);
  console.log(`⏰ Next birthday check in ${Math.round(msUntilMidnight / 1000 / 60)} minutes`);
}

async function runBirthdayCheck() {
  const now = new Date();
  const todayMonth = now.getUTCMonth() + 1;
  const todayDay = now.getUTCDate();
  console.log(`🎂 Running birthday check for ${todayMonth}/${todayDay}`);
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    await cleanupBirthdays(guild);
    for (const [userId, data] of Object.entries(birthdays)) {
      if (data.month === todayMonth && data.day === todayDay) {
        await celebrateBirthday(guild, userId);
      }
    }
  } catch (err) {
    console.error("❌ Birthday check error:", err);
  }
}

async function cleanupBirthdays(guild) {
  try {
    const members = await guild.members.fetch();
    for (const member of members.values()) {
      if (member.roles.cache.has(ROLE_IDS.birthday)) {
        await member.roles.remove(ROLE_IDS.birthday).catch(() => {});
        console.log(`🎂 Removed birthday role from ${member.user.tag}`);
      }
    }
    const channels = await guild.channels.fetch();
    for (const channel of channels.values()) {
      if (channel && channel.parentId === birthdayCategoryId && channel.name.startsWith("🎉happy-birthday-")) {
        await channel.delete().catch(() => {});
        console.log(`🗑️ Deleted birthday channel: ${channel.name}`);
      }
    }
  } catch (err) {
    console.error("❌ Birthday cleanup error:", err);
  }
}

async function celebrateBirthday(guild, userId) {
  try {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) { console.log(`⚠️ Birthday member not found: ${userId}`); return; }
    console.log(`🎂 It's ${member.user.tag}'s birthday!`);
    await member.roles.add(ROLE_IDS.birthday).catch(() => {});
    const safeName = member.user.username.toLowerCase().replace(/[^a-z0-9]/g, "");
    const channel = await guild.channels.create({
      name: `🎉happy-birthday-${safeName}`,
      type: ChannelType.GuildText,
      parent: birthdayCategoryId,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: ROLE_IDS.unverified, deny: [PermissionFlagsBits.ViewChannel] },
        { id: ROLE_IDS.goofyGoobers, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.AddReactions] }
      ]
    });
    const embed = new EmbedBuilder()
      .setTitle(`🎂 Happy Birthday, ${member.user.username}! 🎉`)
      .setDescription(
        `${member} — today is YOUR day! 🦕🎉\n\n` +
        "The whole DinoGang is here to celebrate with you!\n\n" +
        "Drop your birthday wishes below and let's make it a great one! 🎈🎊🥳"
      )
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .setColor(0xFF73FA)
      .setFooter({ text: "DinoBot • Birthday System" })
      .setTimestamp();
    await channel.send({ content: `<@&${ROLE_IDS.announcements}> 🎂 It's someone's birthday!`, embeds: [embed] });
    try {
      await member.send({
        embeds: [new EmbedBuilder()
          .setTitle("🎂 Happy Birthday from DinoGang! 🦕")
          .setDescription("Hey! The whole crew wants to wish you a **Happy Birthday**! 🎉\n\nHead to the server — there's a special birthday channel just for you today! 🎈\n\nHope your day is amazing! 🥳")
          .setColor(0xFF73FA)
          .setFooter({ text: "DinoBot • Happy Birthday! 🎂" })]
      });
    } catch { /* DMs disabled */ }
    console.log(`✅ Birthday celebrated for ${member.user.tag}`);
  } catch (err) {
    console.error(`❌ Error celebrating birthday for ${userId}:`, err);
  }
}

// ----------------------------
// MRBEAN SCHEDULE CHANNEL
// ----------------------------
async function setupMrBeanScheduleChannel() {
  const guild = await client.guilds.fetch(GUILD_ID);
  const channels = await guild.channels.fetch();
  let channel = channels.find(c => c.parentId === MRBEAN_CATEGORY_ID && c.name === "📅mrbean-schedule");
  if (!channel) {
    channel = await guild.channels.create({
      name: "📅mrbean-schedule",
      type: ChannelType.GuildText,
      parent: MRBEAN_CATEGORY_ID,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
        { id: ROLE_IDS.unverified, deny: [PermissionFlagsBits.ViewChannel] }
      ]
    });
    console.log("✅ MrBean schedule channel created");
  } else {
    console.log("ℹ️ MrBean schedule channel already exists");
  }
  mrbeanScheduleChannelId = channel.id;
  const messages = await channel.messages.fetch({ limit: 10 });
  const existing = messages.find(m => m.author.id === client.user.id && m.embeds.length > 0);
  if (existing) {
    mrbeanScheduleMessageId = existing.id;
    console.log("ℹ️ MrBean schedule message already exists");
    return;
  }
  await postMrBeanSchedule(channel);
}

async function postMrBeanSchedule(channel) {
  const embed = buildMrBeanScheduleEmbed();
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("mrbean_update_schedule").setLabel("Update My Schedule").setEmoji("📅").setStyle(ButtonStyle.Primary)
  );
  const msg = await channel.send({ embeds: [embed], components: [row] });
  mrbeanScheduleMessageId = msg.id;
  console.log("✅ MrBean schedule posted");
}

function buildMrBeanScheduleEmbed() {
  return new EmbedBuilder()
    .setTitle("📅 MrBeanTheDino — Stream Schedule")
    .setDescription(
      "Here's when MrBeanTheDino is live! All times are **PST**.\n\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
      "🕹️ **Retro Day**\n" +
      "📆 Monday / Tuesday / Wednesday\n" +
      "🕐 2:00PM – 6:00PM PST\n" +
      "🎮 Retro Games\n\n" +
      "🎲 **Regular Day**\n" +
      "📆 Thursday / Friday\n" +
      "🕐 2:00PM – 6:00PM PST\n" +
      "🎮 Variety\n\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
      "*Schedule subject to change. Follow on Twitch for live notifications!*"
    )
    .setColor(0x9146FF)
    .setFooter({ text: "DinoBot • Stream Schedule • Last updated" })
    .setTimestamp();
}

// ----------------------------
// CREW SCHEDULE CHANNEL
// ----------------------------
async function setupCrewScheduleChannel() {
  const guild = await client.guilds.fetch(GUILD_ID);
  const channels = await guild.channels.fetch();
  let channel = channels.find(c => c.parentId === STREAMING_CATEGORY_ID && c.name === "📅crew-schedule");
  if (!channel) {
    channel = await guild.channels.create({
      name: "📅crew-schedule",
      type: ChannelType.GuildText,
      parent: STREAMING_CATEGORY_ID,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
        { id: ROLE_IDS.unverified, deny: [PermissionFlagsBits.ViewChannel] }
      ]
    });
    console.log("✅ Crew schedule channel created");
  } else {
    console.log("ℹ️ Crew schedule channel already exists");
  }
  crewScheduleChannelId = channel.id;
  const messages = await channel.messages.fetch({ limit: 10 });
  const existing = messages.find(m => m.author.id === client.user.id && m.embeds.length > 0);
  if (existing) {
    crewScheduleMessageId = existing.id;
    console.log("ℹ️ Crew schedule message already exists");
    return;
  }
  await postCrewSchedule(channel);
}

async function postCrewSchedule(channel) {
  const embed = buildCrewScheduleEmbed();
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("crew_update_schedule").setLabel("Update My Schedule").setEmoji("📅").setStyle(ButtonStyle.Primary)
  );
  const msg = await channel.send({ embeds: [embed], components: [row] });
  crewScheduleMessageId = msg.id;
  console.log("✅ Crew schedule posted");
}

function buildCrewScheduleEmbed() {
  const entries = Object.entries(schedules);
  let description =
    "Click **Update My Schedule** below to add or update your stream schedule.\n\n" +
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n";

  if (entries.length === 0) {
    description += "*No schedules set yet. Streamers — add yours below!*\n\n";
  } else {
    for (const [userId, data] of entries) {
      description +=
        `🎮 **${data.username}**\n` +
        `📆 ${data.days}  🕐 ${data.time}  🎮 ${data.game}\n\n`;
    }
  }

  description += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n*All times in the streamer's local timezone unless noted.*";

  return new EmbedBuilder()
    .setTitle("📅 DinoGang Crew — Stream Schedule")
    .setDescription(description)
    .setColor(0x9146FF)
    .setFooter({ text: "DinoBot • Crew Schedule • Last updated" })
    .setTimestamp();
}

async function updateCrewScheduleEmbed() {
  try {
    const channel = await client.channels.fetch(crewScheduleChannelId);
    const msg = await channel.messages.fetch(crewScheduleMessageId);
    const embed = buildCrewScheduleEmbed();
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("crew_update_schedule").setLabel("Update My Schedule").setEmoji("📅").setStyle(ButtonStyle.Primary)
    );
    await msg.edit({ embeds: [embed], components: [row] });
    console.log("✅ Crew schedule updated");
  } catch (err) {
    console.error("❌ Error updating crew schedule:", err);
  }
}

async function updateMrBeanScheduleEmbed(newDescription) {
  try {
    const channel = await client.channels.fetch(mrbeanScheduleChannelId);
    const msg = await channel.messages.fetch(mrbeanScheduleMessageId);
    const embed = new EmbedBuilder()
      .setTitle("📅 MrBeanTheDino — Stream Schedule")
      .setDescription(newDescription)
      .setColor(0x9146FF)
      .setFooter({ text: "DinoBot • Stream Schedule • Last updated" })
      .setTimestamp();
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("mrbean_update_schedule").setLabel("Update My Schedule").setEmoji("📅").setStyle(ButtonStyle.Primary)
    );
    await msg.edit({ embeds: [embed], components: [row] });
    console.log("✅ MrBean schedule updated");
  } catch (err) {
    console.error("❌ Error updating MrBean schedule:", err);
  }
}

// ----------------------------
// SETUP BIRTHDAY CATEGORY
// ----------------------------
async function setupBirthdayCategory() {
  const guild = await client.guilds.fetch(GUILD_ID);
  const channels = await guild.channels.fetch();
  const existing = channels.find(c => c.type === ChannelType.GuildCategory && c.name === "BIRTHDAYS");
  if (existing) { birthdayCategoryId = existing.id; console.log("ℹ️ Birthdays category already exists"); return; }
  const category = await guild.channels.create({
    name: "BIRTHDAYS", type: ChannelType.GuildCategory,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: ROLE_IDS.goofyGoobers, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
    ]
  });
  birthdayCategoryId = category.id;
  console.log("✅ Birthdays category created");
}

// ----------------------------
// SETUP BIRTHDAY REGISTER CHANNEL
// ----------------------------
async function setupBirthdayRegisterChannel() {
  const channel = await client.channels.fetch(BIRTHDAY_REGISTER_CHANNEL_ID);
  const messages = await channel.messages.fetch({ limit: 5 });
  const botMsg = messages.find(m => m.author.id === client.user.id && m.embeds.length > 0);
  if (botMsg) { console.log("ℹ️ Birthday register channel already exists"); return; }
  await postBirthdayRegisterMessage(channel);
}

async function postBirthdayRegisterMessage(channel) {
  const embed = new EmbedBuilder()
    .setTitle("🎂 Birthday Register")
    .setDescription(
      "Want DinoBot to celebrate your birthday? Register it below! 🦕\n\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
      "🎉 **What happens on your birthday:**\n\n" +
      "- A private birthday channel is created just for you\n" +
      "- The whole server can come wish you happy birthday\n" +
      "- You get a special 🎂 Birthday role for the day\n" +
      "- DinoBot will DM you happy birthday\n" +
      "- Channel and role are removed at midnight 🕛\n\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
      "🔒 **Privacy:** Only your month and day are stored — no year is ever collected.\n\n" +
      "*Use the buttons below to set or remove your birthday.*"
    )
    .setColor(0xFF73FA)
    .setFooter({ text: "DinoBot • Birthday System" });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("birthday_set").setLabel("Set My Birthday").setEmoji("🎂").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("birthday_remove").setLabel("Remove My Birthday").setEmoji("🗑️").setStyle(ButtonStyle.Danger)
  );
  await channel.send({ embeds: [embed], components: [row] });
  console.log("✅ Birthday register message posted");
}

// ----------------------------
// SETUP ONBOARDING CATEGORY
// ----------------------------
async function setupOnboardingCategory() {
  const guild = await client.guilds.fetch(GUILD_ID);
  const channels = await guild.channels.fetch();
  const existing = channels.find(c => c.type === ChannelType.GuildCategory && c.name === "ONBOARDING");
  if (existing) { onboardingCategoryId = existing.id; console.log("ℹ️ Onboarding category already exists"); return; }
  const category = await guild.channels.create({
    name: "ONBOARDING", type: ChannelType.GuildCategory,
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
  if (existing) { staffCategoryId = existing.id; console.log("ℹ️ Staff Only category already exists"); return; }
  const category = await guild.channels.create({
    name: "STAFF ONLY", type: ChannelType.GuildCategory,
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
  if (existing) { ticketsCategoryId = existing.id; console.log("ℹ️ Tickets category already exists"); return; }
  const category = await guild.channels.create({
    name: "TICKETS", type: ChannelType.GuildCategory,
    permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }]
  });
  ticketsCategoryId = category.id;
  console.log("✅ Tickets category created");
}

// ----------------------------
// SETUP SUPPORT CHANNEL
// ----------------------------
async function setupSupportChannel() {
  const channel = await client.channels.fetch(SUPPORT_CHANNEL_ID);
  const messages = await channel.messages.fetch({ limit: 5 });
  const botMsg = messages.find(m => m.author.id === client.user.id && m.embeds.length > 0);
  if (botMsg) { console.log("ℹ️ Support channel already exists"); return; }
  await postSupportMessage(channel);
}

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
  const existing = channels.find(c => c.parentId === staffCategoryId && c.name === "🔒mod-tickets");
  if (existing) { modTicketsChannelId = existing.id; console.log("ℹ️ Mod tickets channel already exists"); return; }
  const channel = await guild.channels.create({
    name: "🔒mod-tickets", type: ChannelType.GuildText, parent: staffCategoryId,
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
  const channel = await client.channels.fetch(PICK_ROLES_CHANNEL_ID);
  const messages = await channel.messages.fetch({ limit: 5 });
  const botMsg = messages.find(m => m.author.id === client.user.id && m.embeds.length > 0);
  if (botMsg) { console.log("ℹ️ Pick your roles channel already exists"); return; }
  await postPickRolesMessage(channel);
}

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
  const channel = await client.channels.fetch(NOTIFICATION_CHANNEL_ID);
  const messages = await channel.messages.fetch({ limit: 5 });
  const botMsg = messages.find(m => m.author.id === client.user.id && m.embeds.length > 0);
  if (botMsg) { console.log("ℹ️ Notification settings channel already exists"); return; }
  await postNotificationMessage(channel);
}

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
  const channel = await client.channels.fetch(BOT_INFO_CHANNEL_ID);
  const messages = await channel.messages.fetch({ limit: 10 });
  const botMsgs = messages.filter(m => m.author.id === client.user.id);
  for (const msg of botMsgs.values()) await msg.delete().catch(() => {});
  await postBotInfoMessage(channel);
}

async function postBotInfoMessage(channel) {
  const embed = new EmbedBuilder()
    .setTitle("🤖 DinoBot — Server Guide")
    .setDescription(
      "Hey there! I'm **DinoBot** 🦕 — the custom bot built specifically for **DinoGang**.\n" +
      "Here's everything I do and how to use me.\n\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
      "**⚙️ What DinoBot Does**\n\n" +
      "🔴 **Twitch Live Alerts** — automatically posts an alert whenever a DinoGang member goes live on Twitch\n\n" +
      "👋 **Member Onboarding** — when you join, DinoBot creates a private channel just for you to get set up with rules and roles\n\n" +
      "🎭 **Role Management** — self-assign interest, content, and notification roles at any time\n\n" +
      "🔔 **Notification Controls** — opt in or out of stream alerts and announcements pings whenever you want\n\n" +
      "🔒 **Channel Lockdown** — new members can only see #welcome and #rules until onboarding is complete\n\n" +
      "🎟️ **Ticket System** — submit private tickets to the mod team for reports, feedback, suggestions, and more\n\n" +
      "⚠️ **Account Age Filter** — accounts under 7 days old are flagged and reviewed by mods\n\n" +
      "🎂 **Birthday System** — register your birthday and get your own celebration channel for the day\n\n" +
      "📅 **Stream Schedules** — MrBeanTheDino's schedule and the full crew schedule, always up to date\n\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
      "**🗺️ Server Features**\n\n" +
      "📋 `#rules` — server rules, read-only\n" +
      "🎭 `#🎭pick-your-roles` — toggle your Gamers, Creative, Streamer, and Viewer roles\n" +
      "🔔 `#🔔notification-settings` — opt in or out of Stream Alerts and Announcements\n" +
      "🎟️ `#🎟️support` — open a private ticket with the mod team\n" +
      "🎂 `#🎂birthday-register` — register your birthday for a special celebration\n" +
      "📅 `#📅mrbean-schedule` — MrBeanTheDino's personal stream schedule\n" +
      "📅 `#📅crew-schedule` — full DinoGang crew stream schedule\n" +
      "🎮 **Gamers** — private space for gamers *(requires Gamers role)*\n" +
      "🎨 **Creative** — private space for creative types *(requires Creative role)*\n\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
      "**👋 How Onboarding Works**\n\n" +
      "When you first join DinoBot creates a private channel just for you:\n\n" +
      "**Step 1** ✅ — Read and accept the server rules\n" +
      "**Step 2** 🎭 — Pick an optional interest space *(Gamers, Creative, or skip)*\n" +
      "**Step 3** 🎙️ — Pick your content role *(Streamer or Viewer)*\n" +
      "**Step 4** 🔔 — Set your notification preferences *(or skip)*\n\n" +
      "Once complete your private channel self-destructs and you have full server access! 🎉\n\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
      "**🎟️ How the Ticket System Works**\n\n" +
      "Head to `#🎟️support` and click a button to open a ticket:\n\n" +
      "🚨 **Report a User** — report rule-breaking *(fully anonymous)*\n" +
      "💬 **General Feedback** — share feedback about the server\n" +
      "💡 **Server Suggestion** — suggest a new feature or change\n" +
      "❓ **Question for Mods** — ask the mod team something privately\n" +
      "⚖️ **Appeal a Ban** — appeal a ban or punishment\n\n" +
      "A pop-up form will appear for you to describe your issue before submitting.\n" +
      "⚠️ You can only have **one open ticket at a time**. Once resolved you can open another.\n" +
      "All tickets are **private** — only you and the mod team can see them.\n\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
      "**🎂 How the Birthday System Works**\n\n" +
      "Head to `#🎂birthday-register` and click **Set My Birthday**:\n\n" +
      "- Enter your birth month and day *(no year collected)*\n" +
      "- On your birthday DinoBot creates a special celebration channel just for you\n" +
      "- The whole server can come wish you happy birthday! 🎉\n" +
      "- Your birthday role and channel are removed at midnight\n\n" +
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
    if (channel.id === birthdayCategoryId) continue;
    if (channel.parentId === birthdayCategoryId) continue;
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
  if (botMessages.size >= 1) { console.log("ℹ️ Rules message already exists"); return; }
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
  await rulesChannel.send({ embeds: [rulesEmbed] });
  console.log("✅ Rules message posted");
}

// ----------------------------
// ACCOUNT AGE CHECK
// ----------------------------
async function checkAccountAge(member) {
  const accountAgeDays = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
  if (accountAgeDays >= MIN_ACCOUNT_AGE_DAYS) return;
  const ageDisplay = accountAgeDays < 1
    ? `${Math.floor(accountAgeDays * 24)} hours`
    : `${Math.floor(accountAgeDays)} days`;
  console.log(`⚠️ New account flagged: ${member.user.tag} (${ageDisplay} old)`);
  try {
    const modLogsChannel = await client.channels.fetch(MOD_LOGS_CHANNEL_ID);
    if (!modLogsChannel) return;
    const embed = new EmbedBuilder()
      .setTitle("⚠️ New Account Flagged")
      .setDescription(
        `A new member joined with a suspiciously new account.\n\n` +
        `**Member:** ${member} (${member.user.tag})\n` +
        `**Account Created:** <t:${Math.floor(member.user.createdTimestamp / 1000)}:F>\n` +
        `**Account Age:** ${ageDisplay}\n` +
        `**Minimum Required:** ${MIN_ACCOUNT_AGE_DAYS} days\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `*Use the buttons below to approve or kick this member.*`
      )
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .setColor(0xFFA500)
      .setTimestamp()
      .setFooter({ text: "DinoBot • Account Age Filter" });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`agecheck_approve_${member.id}`).setLabel("Approve").setEmoji("✅").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`agecheck_kick_${member.id}`).setLabel("Kick").setEmoji("🦵").setStyle(ButtonStyle.Danger)
    );
    await modLogsChannel.send({ content: `<@&${ROLE_IDS.mods}> ⚠️ New account flagged!`, embeds: [embed], components: [row] });
  } catch (err) {
    console.error("❌ Error sending account age alert:", err);
  }
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
    await checkAccountAge(member);
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
    if (existing) { console.log(`ℹ️ Onboarding channel already exists for ${member.user.tag}`); return; }
    const channel = await guild.channels.create({
      name: channelName, type: ChannelType.GuildText, parent: onboardingCategoryId,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        { id: ROLE_IDS.mods, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] },
        { id: ROLE_IDS.admin, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] },
        { id: ROLE_IDS.owner, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] }
      ]
    });
    console.log(`✅ Created onboarding channel for ${member.user.tag}`);

    setTimeout(async () => {
      try {
        const freshMember = await guild.members.fetch(member.id).catch(() => null);
        if (!freshMember) return;
        if (freshMember.roles.cache.has(ROLE_IDS.unverified)) {
          try {
            await freshMember.send({
              embeds: [new EmbedBuilder()
                .setTitle("👋 You were removed from DinoGang")
                .setDescription(
                  "Hey! You didn't complete onboarding in time.\n\n" +
                  "**You need to accept the rules to join the server.**\n\n" +
                  "You're always welcome to rejoin and finish onboarding — it only takes a minute! 🦕\n\n" +
                  "*If you have any issues joining, feel free to reach out.*"
                )
                .setColor(0xED4245)
                .setFooter({ text: "DinoGang • Onboarding Timeout" })]
            });
          } catch { /* DMs disabled */ }
          await freshMember.kick("Did not complete onboarding within 24 hours");
          console.log(`🦵 Kicked for incomplete onboarding: ${member.user.tag}`);
        }
        const staleChannel = await guild.channels.fetch(channel.id).catch(() => null);
        if (staleChannel) {
          await staleChannel.delete().catch(() => {});
          console.log(`🗑️ Deleted stale onboarding channel for ${member.user.tag}`);
        }
      } catch (err) {
        console.error("❌ Onboarding timeout error:", err);
      }
    }, 24 * 60 * 60 * 1000);

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
      new ButtonBuilder().setCustomId(`onboard_accept_rules_${member.id}`).setLabel("Accept Rules").setEmoji("✅").setStyle(ButtonStyle.Success)
    );
    await channel.send({ content: `${member}`, embeds: [rulesEmbed], components: [rulesRow] });
  } catch (err) {
    console.error("❌ Error creating onboarding channel:", err);
  }
}

// ----------------------------
// CREATE TICKET CHANNEL
// ----------------------------
async function createTicketChannel(guild, member, ticketType, anonymous, description = null, location = null, reportedUser = null) {
  const safeName = member.user.username.toLowerCase().replace(/[^a-z0-9]/g, "");
  const channelName = `ticket-${safeName}`;
  const channels = await guild.channels.fetch();
  const existing = channels.find(c => c.parentId === ticketsCategoryId && c.name === channelName);
  if (existing) return null;
  const permOverwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: ROLE_IDS.mods, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks] },
    { id: ROLE_IDS.admin, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks] },
    { id: ROLE_IDS.owner, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks] }
  ];
  if (!anonymous) {
    permOverwrites.push({ id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
  }
  const channel = await guild.channels.create({
    name: channelName, type: ChannelType.GuildText, parent: ticketsCategoryId,
    permissionOverwrites: permOverwrites
  });
  openTickets.set(member.id, channel.id);
  const typeLabels = {
    report: "🚨 Report a User", feedback: "💬 General Feedback",
    suggestion: "💡 Server Suggestion", question: "❓ Question for Mods", appeal: "⚖️ Appeal a Ban"
  };
  let descriptionText = anonymous
    ? "🔒 **This ticket is anonymous.** The mod team cannot see who submitted it.\n\n"
    : `👤 **Submitted by:** ${member}\n\n`;
  if (reportedUser) descriptionText += `**Reported User:** ${reportedUser}\n\n`;
  if (location) descriptionText += `**Where did this happen?** ${location}\n\n`;
  if (description) descriptionText += `**Description:**\n${description}\n\n`;
  descriptionText += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n*Use the buttons below to close this ticket when resolved.*";
  const embed = new EmbedBuilder()
    .setTitle(`🎟️ ${typeLabels[ticketType]}`)
    .setDescription(descriptionText)
    .setColor(0x9146FF)
    .setTimestamp()
    .setFooter({ text: `DinoBot • Ticket System • ${typeLabels[ticketType]}` });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticket_resolve_${member.id}`).setLabel("Resolve").setEmoji("✅").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`ticket_close_${member.id}`).setLabel("Close Without Resolving").setEmoji("🗑️").setStyle(ButtonStyle.Danger)
  );
  await channel.send({
    content: anonymous ? `<@&${ROLE_IDS.mods}> 🎟️ New anonymous report!` : `<@&${ROLE_IDS.mods}> 🎟️ New ticket from ${member}!`,
    embeds: [embed], components: [row]
  });
  console.log(`✅ Ticket created: ${channelName}`);
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

    if (customId.startsWith("agecheck_approve_")) {
      const targetUserId = customId.replace("agecheck_approve_", "");
      await interaction.update({
        embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(0x57F287).setTitle("✅ Member Approved").setFooter({ text: `Approved by ${interaction.user.tag} • DinoBot • Account Age Filter` })],
        components: []
      });
      console.log(`✅ Account age approved: ${targetUserId} by ${interaction.user.tag}`);
      return;
    }

    if (customId.startsWith("agecheck_kick_")) {
      const targetUserId = customId.replace("agecheck_kick_", "");
      try {
        const targetMember = await guild.members.fetch(targetUserId).catch(() => null);
        if (targetMember) {
          try {
            await targetMember.send({
              embeds: [new EmbedBuilder()
                .setTitle("👋 You were removed from DinoGang")
                .setDescription(`Your account is too new to join this server.\n\n**Minimum account age required:** ${MIN_ACCOUNT_AGE_DAYS} days\n\nThis is an automatic security measure to protect our community. Please try again once your account is older. 🦕`)
                .setColor(0xED4245).setFooter({ text: "DinoGang • Account Age Filter" })]
            });
          } catch { /* DMs disabled */ }
          await targetMember.kick("Account too new — under 7 days old");
          console.log(`🦵 Kicked new account: ${targetUserId}`);
        }
        await interaction.update({
          embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(0xED4245).setTitle("🦵 Member Kicked").setFooter({ text: `Kicked by ${interaction.user.tag} • DinoBot • Account Age Filter` })],
          components: []
        });
      } catch (err) {
        console.error("❌ Error kicking member:", err);
        await interaction.reply({ content: "❌ Failed to kick member. Do I have Kick Members permission?", flags: 64 });
      }
      return;
    }

    // ----------------------------
    // MRBEAN SCHEDULE UPDATE
    // ----------------------------
    if (customId === "mrbean_update_schedule") {
      if (user.id !== guild.ownerId && !member.roles.cache.has(ROLE_IDS.admin) && !member.roles.cache.has(ROLE_IDS.mods)) {
        await interaction.reply({ content: "❌ Only MrBeanTheDino and mods can update this schedule.", flags: 64 });
        return;
      }
      const modal = new ModalBuilder().setCustomId("mrbean_schedule_modal").setTitle("📅 Update Your Stream Schedule");
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("schedule_content").setLabel("Your Schedule").setStyle(TextInputStyle.Paragraph).setPlaceholder(
          "e.g.\nMonday / Tuesday / Wednesday — 2PM-6PM PST — Retro Games\nThursday / Friday — 2PM-6PM PST — Variety"
        ).setMinLength(10).setMaxLength(1000).setRequired(true))
      );
      await interaction.showModal(modal);
      return;
    }

    // ----------------------------
    // CREW SCHEDULE UPDATE
    // ----------------------------
    if (customId === "crew_update_schedule") {
      if (!member.roles.cache.has(ROLE_IDS.streamer) && !member.roles.cache.has(ROLE_IDS.mods) && !member.roles.cache.has(ROLE_IDS.admin) && !member.roles.cache.has(ROLE_IDS.owner)) {
        await interaction.reply({ content: "❌ Only streamers can update the crew schedule. Assign yourself the Streamer role in #🎭pick-your-roles first!", flags: 64 });
        return;
      }
      const modal = new ModalBuilder().setCustomId("crew_schedule_modal").setTitle("📅 Update Your Schedule");
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("sched_days").setLabel("Stream Days").setStyle(TextInputStyle.Short).setPlaceholder("e.g. Mon / Wed / Fri").setMaxLength(100).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("sched_time").setLabel("Stream Time").setStyle(TextInputStyle.Short).setPlaceholder("e.g. 8PM EST").setMaxLength(50).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("sched_game").setLabel("What do you play?").setStyle(TextInputStyle.Short).setPlaceholder("e.g. Variety / Fortnite / Horror Games").setMaxLength(100).setRequired(true))
      );
      await interaction.showModal(modal);
      return;
    }

    if (customId === "birthday_set") {
      const modal = new ModalBuilder().setCustomId("birthday_modal_set").setTitle("🎂 Set Your Birthday");
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("birthday_month").setLabel("Birth Month (1-12)").setStyle(TextInputStyle.Short).setPlaceholder("e.g. 3 for March, 12 for December").setMinLength(1).setMaxLength(2).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("birthday_day").setLabel("Birth Day (1-31)").setStyle(TextInputStyle.Short).setPlaceholder("e.g. 15").setMinLength(1).setMaxLength(2).setRequired(true))
      );
      await interaction.showModal(modal);
      return;
    }

    if (customId === "birthday_remove") {
      if (!birthdays[user.id]) { await interaction.reply({ content: "❌ You don't have a birthday registered!", flags: 64 }); return; }
      delete birthdays[user.id];
      saveBirthdays();
      await interaction.reply({ content: "🗑️ Your birthday has been removed.", flags: 64 });
      return;
    }

    const ticketTypes = ["report", "feedback", "suggestion", "question", "appeal"];
    const ticketMatch = ticketTypes.find(t => customId === `ticket_${t}`);
    if (ticketMatch) {
      if (openTickets.has(user.id)) {
        await interaction.reply({ content: `❌ You already have an open ticket! <#${openTickets.get(user.id)}>`, flags: 64 });
        return;
      }
      const modalTitles = { report: "🚨 Report a User", feedback: "💬 General Feedback", suggestion: "💡 Server Suggestion", question: "❓ Question for Mods", appeal: "⚖️ Appeal a Ban" };
      const modal = new ModalBuilder().setCustomId(`ticket_modal_${ticketMatch}_${user.id}`).setTitle(modalTitles[ticketMatch]);
      if (ticketMatch === "report") {
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("reported_user").setLabel("Who are you reporting?").setStyle(TextInputStyle.Short).setPlaceholder("Username of the person you're reporting").setMinLength(1).setMaxLength(100).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("ticket_location").setLabel("Where did this happen?").setStyle(TextInputStyle.Short).setPlaceholder("e.g. #general, voice chat, DMs").setMinLength(1).setMaxLength(100).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("ticket_description").setLabel("What happened?").setStyle(TextInputStyle.Paragraph).setPlaceholder("Describe what happened in as much detail as possible. Your identity will remain anonymous.").setMinLength(10).setMaxLength(1000).setRequired(true))
        );
      } else {
        const placeholders = { feedback: "Share your feedback about the server...", suggestion: "What would you like to suggest?", question: "What would you like to ask the mod team?", appeal: "Describe your situation and why you'd like to appeal..." };
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("ticket_description").setLabel("Description").setStyle(TextInputStyle.Paragraph).setPlaceholder(placeholders[ticketMatch]).setMinLength(10).setMaxLength(1000).setRequired(true)));
      }
      await interaction.showModal(modal);
      return;
    }

    if (customId.startsWith("ticket_resolve_")) {
      await logAndCloseTicket(guild, interaction.channel, customId.replace("ticket_resolve_", ""), "resolved", interaction.user);
      await interaction.update({ components: [] }).catch(() => {});
      return;
    }

    if (customId.startsWith("ticket_close_")) {
      await logAndCloseTicket(guild, interaction.channel, customId.replace("ticket_close_", ""), "closed", interaction.user);
      await interaction.update({ components: [] }).catch(() => {});
      return;
    }

    if (customId === "notif_stream_alerts") {
      if (member.roles.cache.has(ROLE_IDS.streamAlerts)) { await member.roles.remove(ROLE_IDS.streamAlerts); await interaction.reply({ content: "🔕 **Stream Alerts** disabled.", flags: 64 }); }
      else { await member.roles.add(ROLE_IDS.streamAlerts); await interaction.reply({ content: "🔔 **Stream Alerts** enabled!", flags: 64 }); }
      return;
    }

    if (customId === "notif_announcements") {
      if (member.roles.cache.has(ROLE_IDS.announcements)) { await member.roles.remove(ROLE_IDS.announcements); await interaction.reply({ content: "🔕 **Announcements** disabled.", flags: 64 }); }
      else { await member.roles.add(ROLE_IDS.announcements); await interaction.reply({ content: "🔔 **Announcements** enabled!", flags: 64 }); }
      return;
    }

    if (customId === "roles_gamers") {
      if (member.roles.cache.has(ROLE_IDS.gamers)) { await member.roles.remove(ROLE_IDS.gamers); await interaction.reply({ content: "✅ **Gamers** 🎮 role removed!", flags: 64 }); }
      else { await member.roles.add(ROLE_IDS.gamers); await interaction.reply({ content: "✅ **Gamers** 🎮 role assigned!", flags: 64 }); }
      return;
    }

    if (customId === "roles_creative") {
      if (member.roles.cache.has(ROLE_IDS.creative)) { await member.roles.remove(ROLE_IDS.creative); await interaction.reply({ content: "✅ **Creative** 🎨 role removed!", flags: 64 }); }
      else { await member.roles.add(ROLE_IDS.creative); await interaction.reply({ content: "✅ **Creative** 🎨 role assigned!", flags: 64 }); }
      return;
    }

    if (customId === "roles_streamer") {
      if (member.roles.cache.has(ROLE_IDS.streamer)) { await member.roles.remove(ROLE_IDS.streamer); await interaction.reply({ content: "✅ **Streamer** 🎙️ role removed!", flags: 64 }); }
      else { await member.roles.add(ROLE_IDS.streamer); await interaction.reply({ content: "✅ **Streamer** 🎙️ role assigned!", flags: 64 }); }
      return;
    }

    if (customId === "roles_viewer") {
      if (member.roles.cache.has(ROLE_IDS.viewer)) { await member.roles.remove(ROLE_IDS.viewer); await interaction.reply({ content: "✅ **Viewer** 👀 role removed!", flags: 64 }); }
      else { await member.roles.add(ROLE_IDS.viewer); await interaction.reply({ content: "✅ **Viewer** 👀 role assigned!", flags: 64 }); }
      return;
    }

    const parts = customId.split("_");
    const memberId = parts[parts.length - 1];
    if (memberId !== user.id) { await interaction.reply({ content: "❌ These buttons are not for you!", flags: 64 }); return; }

    if (customId.startsWith("onboard_accept_rules_")) {
      await member.roles.remove(ROLE_IDS.unverified);
      await member.roles.add(ROLE_IDS.goofyGoobers);
      await interaction.update({ embeds: [new EmbedBuilder().setTitle("✅ Rules Accepted!").setDescription("You're verified! Now let's get your roles set up.").setColor(0x57F287).setFooter({ text: "Step 1 of 4 — Complete ✅" })], components: [] });
      await sendInterestRoleSelection(interaction.channel, member);
      return;
    }

    if (customId.startsWith("onboard_gamers_")) {
      await member.roles.add(ROLE_IDS.gamers);
      await interaction.update({ embeds: [new EmbedBuilder().setTitle("🎮 Gamers role assigned!").setDescription("Nice! Keep going...").setColor(0x9146FF).setFooter({ text: "Step 2 of 4 — Complete ✅" })], components: [] });
      await sendContentRoleSelection(interaction.channel, member);
      return;
    }

    if (customId.startsWith("onboard_creative_")) {
      await member.roles.add(ROLE_IDS.creative);
      await interaction.update({ embeds: [new EmbedBuilder().setTitle("🎨 Creative role assigned!").setDescription("Nice! Keep going...").setColor(0x9146FF).setFooter({ text: "Step 2 of 4 — Complete ✅" })], components: [] });
      await sendContentRoleSelection(interaction.channel, member);
      return;
    }

    if (customId.startsWith("onboard_skip_interest_")) {
      await interaction.update({ embeds: [new EmbedBuilder().setTitle("⏭️ Skipped!").setDescription("No worries! Keep going...").setColor(0x9146FF).setFooter({ text: "Step 2 of 4 — Complete ✅" })], components: [] });
      await sendContentRoleSelection(interaction.channel, member);
      return;
    }

    if (customId.startsWith("onboard_streamer_")) {
      await member.roles.add(ROLE_IDS.streamer);
      await interaction.update({ embeds: [new EmbedBuilder().setTitle("🎙️ Streamer role assigned!").setDescription("Almost done!").setColor(0x57F287).setFooter({ text: "Step 3 of 4 — Complete ✅" })], components: [] });
      await sendNotificationSelection(interaction.channel, member);
      return;
    }

    if (customId.startsWith("onboard_viewer_")) {
      await member.roles.add(ROLE_IDS.viewer);
      await interaction.update({ embeds: [new EmbedBuilder().setTitle("👀 Viewer role assigned!").setDescription("Almost done!").setColor(0x57F287).setFooter({ text: "Step 3 of 4 — Complete ✅" })], components: [] });
      await sendNotificationSelection(interaction.channel, member);
      return;
    }

    if (customId.startsWith("onboard_notif_")) {
      const stripped = customId.replace("onboard_notif_", "").replace(`_${memberId}`, "");
      if (stripped.includes("stream")) await member.roles.add(ROLE_IDS.streamAlerts);
      if (stripped.includes("announcements")) await member.roles.add(ROLE_IDS.announcements);
      const selected = [];
      if (stripped.includes("stream")) selected.push("🔴 Stream Alerts");
      if (stripped.includes("announcements")) selected.push("📢 Announcements");
      await interaction.update({
        embeds: [new EmbedBuilder().setTitle("🔔 Notifications set!").setDescription(selected.length ? `You selected: **${selected.join(", ")}**\n\nYou can change this anytime in #🔔notification-settings.` : "No notifications selected. You can opt in anytime in #🔔notification-settings.").setColor(0x57F287).setFooter({ text: "Step 4 of 4 — Complete ✅" })],
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
// MODAL SUBMIT HANDLER
// ----------------------------
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isModalSubmit()) return;
  const { customId, user, guild } = interaction;
  const member = await guild.members.fetch(user.id);

  if (customId === "mrbean_schedule_modal") {
    const content = interaction.fields.getTextInputValue("schedule_content").trim();
    const embed = new EmbedBuilder()
      .setTitle("📅 MrBeanTheDino — Stream Schedule")
      .setDescription(
        "Here's when MrBeanTheDino is live!\n\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
        content + "\n\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
        "*Schedule subject to change. Follow on Twitch for live notifications!*"
      )
      .setColor(0x9146FF)
      .setFooter({ text: "DinoBot • Stream Schedule • Last updated" })
      .setTimestamp();
    try {
      const channel = await client.channels.fetch(mrbeanScheduleChannelId);
      const msg = await channel.messages.fetch(mrbeanScheduleMessageId);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("mrbean_update_schedule").setLabel("Update My Schedule").setEmoji("📅").setStyle(ButtonStyle.Primary)
      );
      await msg.edit({ embeds: [embed], components: [row] });
      await interaction.reply({ content: "✅ Your schedule has been updated!", flags: 64 });
      console.log(`✅ MrBean schedule updated by ${user.tag}`);
    } catch (err) {
      console.error("❌ Error updating MrBean schedule:", err);
      await interaction.reply({ content: "❌ Failed to update schedule. Please try again.", flags: 64 });
    }
    return;
  }

  if (customId === "crew_schedule_modal") {
    const days = interaction.fields.getTextInputValue("sched_days").trim();
    const time = interaction.fields.getTextInputValue("sched_time").trim();
    const game = interaction.fields.getTextInputValue("sched_game").trim();
    schedules[user.id] = { username: member.displayName, days, time, game };
    saveSchedules();
    await updateCrewScheduleEmbed();
    await interaction.reply({ content: `✅ Your schedule has been updated!\n\n📆 **${days}** • 🕐 **${time}** • 🎮 **${game}**`, flags: 64 });
    console.log(`✅ Crew schedule updated by ${user.tag}`);
    return;
  }

  if (customId === "birthday_modal_set") {
    const month = parseInt(interaction.fields.getTextInputValue("birthday_month").trim());
    const day = parseInt(interaction.fields.getTextInputValue("birthday_day").trim());
    if (isNaN(month) || month < 1 || month > 12) { await interaction.reply({ content: "❌ Invalid month! Please enter a number between 1 and 12.", flags: 64 }); return; }
    if (isNaN(day) || day < 1 || day > 31) { await interaction.reply({ content: "❌ Invalid day! Please enter a number between 1 and 31.", flags: 64 }); return; }
    birthdays[user.id] = { month, day };
    saveBirthdays();
    const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    await interaction.reply({ content: `🎂 Your birthday has been set to **${monthNames[month - 1]} ${day}**! DinoBot will celebrate with you on your special day! 🦕🎉`, flags: 64 });
    console.log(`🎂 Birthday set for ${user.tag}: ${month}/${day}`);
    return;
  }

  if (!customId.startsWith("ticket_modal_")) return;
  const ticketType = customId.replace("ticket_modal_", "").split("_")[0];
  const anonymous = ticketType === "report";
  const description = interaction.fields.getTextInputValue("ticket_description");
  const location = ticketType === "report" ? interaction.fields.getTextInputValue("ticket_location") : null;
  const reportedUser = ticketType === "report" ? interaction.fields.getTextInputValue("reported_user") : null;

  try {
    if (openTickets.has(user.id)) { await interaction.reply({ content: `❌ You already have an open ticket! <#${openTickets.get(user.id)}>`, flags: 64 }); return; }
    const ticketChannel = await createTicketChannel(guild, member, ticketType, anonymous, description, location, reportedUser);
    if (!ticketChannel) { await interaction.reply({ content: "❌ You already have an open ticket!", flags: 64 }); return; }
    if (anonymous) { await interaction.reply({ content: "🔒 Your anonymous report has been submitted. The mod team will handle it shortly.", flags: 64 }); }
    else { await interaction.reply({ content: `✅ Your ticket has been created! <#${ticketChannel.id}>`, flags: 64 }); }
  } catch (err) {
    console.error("❌ Modal submit error:", err);
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
        await logChannel.send({
          embeds: [new EmbedBuilder()
            .setTitle(`🎟️ Ticket ${status === "resolved" ? "Resolved ✅" : "Closed 🗑️"}`)
            .setDescription(`**Type:** ${ticketType}\n**Status:** ${status === "resolved" ? "✅ Resolved" : "🗑️ Closed without resolving"}\n**Closed by:** ${closedBy}\n**Channel:** ${channel.name}`)
            .setColor(status === "resolved" ? 0x57F287 : 0xED4245)
            .setTimestamp()
            .setFooter({ text: "DinoBot • Ticket Log" })]
        });
      }
    }
    setTimeout(async () => { await channel.delete().catch(() => {}); }, 5000);
  } catch (err) {
    console.error("❌ Error closing ticket:", err);
  }
}

// ----------------------------
// ONBOARDING STEPS
// ----------------------------
async function sendInterestRoleSelection(channel, member) {
  const embed = new EmbedBuilder()
    .setTitle("🎭 Optional Role")
    .setDescription("Want access to a private interest space?\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🎮 **Gamers** — private hangout for gamers\n🎨 **Creative** — private hangout for creative types\n⏭️ **Skip** — no role assigned, no questions asked\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n⚠️ **This role is completely optional.**\n\n*This selection is completely private. Nobody else can see what you choose.*")
    .setColor(0x9146FF).setFooter({ text: "Step 2 of 4 — Pick a role or skip" });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`onboard_gamers_${member.id}`).setLabel("Gamers").setEmoji("🎮").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`onboard_creative_${member.id}`).setLabel("Creative").setEmoji("🎨").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`onboard_skip_interest_${member.id}`).setLabel("Skip").setEmoji("⏭️").setStyle(ButtonStyle.Secondary)
  );
  await channel.send({ embeds: [embed], components: [row] });
}

async function sendContentRoleSelection(channel, member) {
  const embed = new EmbedBuilder()
    .setTitle("🎮 Content Role")
    .setDescription("Are you a streamer or a viewer?\n\n🎙️ **Streamer** — You stream on Twitch\n👀 **Viewer** — You watch streams")
    .setColor(0x9146FF).setFooter({ text: "Step 3 of 4 — Pick your content role" });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`onboard_streamer_${member.id}`).setLabel("Streamer").setEmoji("🎙️").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`onboard_viewer_${member.id}`).setLabel("Viewer").setEmoji("👀").setStyle(ButtonStyle.Secondary)
  );
  await channel.send({ embeds: [embed], components: [row] });
}

async function sendNotificationSelection(channel, member) {
  const embed = new EmbedBuilder()
    .setTitle("🔔 Notification Preferences")
    .setDescription("Last step! Choose which notifications you want to receive.\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n🔴 **Stream Alerts** — get pinged when a DinoGang member goes live\n\n📢 **Announcements** — get pinged for important server announcements\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n*You can change this anytime in #🔔notification-settings.*")
    .setColor(0x9146FF).setFooter({ text: "Step 4 of 4 — Notification preferences" });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`onboard_notif_stream_${member.id}`).setLabel("Stream Alerts").setEmoji("🔴").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`onboard_notif_announcements_${member.id}`).setLabel("Announcements").setEmoji("📢").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`onboard_notif_stream_and_announcements_${member.id}`).setLabel("Both").setEmoji("🔔").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`onboard_notif_skip_${member.id}`).setLabel("Skip").setEmoji("⏭️").setStyle(ButtonStyle.Secondary)
  );
  await channel.send({ embeds: [embed], components: [row] });
}

async function finishOnboarding(channel, member) {
  await channel.send({
    embeds: [new EmbedBuilder().setTitle("🦕 You're all set!").setDescription("Welcome to the crew! You now have full access to the server. 🎉\n\nThis channel will self-destruct in 30 seconds. See you in there!").setColor(0x57F287).setFooter({ text: "Onboarding complete — channel deleting in 30 seconds" })]
  });
  console.log(`✅ Onboarding complete for ${member.user.tag}`);
  setTimeout(async () => { await channel.delete().catch(() => {}); }, 30000);
}

// ----------------------------
// HEALTH CHECK
// ----------------------------
app.get("/", (req, res) => res.send("DinoBot running"));

// ----------------------------
// TWITCH
// ----------------------------
async function getTwitchToken() {
  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.TWITCH_CLIENT_ID, client_secret: process.env.TWITCH_CLIENT_SECRET, grant_type: "client_credentials" })
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Twitch OAuth failure: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function getTwitchUserIds(token, logins) {
  const params = logins.map(l => `login=${encodeURIComponent(l)}`).join("&");
  const res = await fetch(`https://api.twitch.tv/helix/users?${params}`, { headers: { "Client-ID": process.env.TWITCH_CLIENT_ID, "Authorization": `Bearer ${token}` } });
  const data = await res.json();
  if (!res.ok) throw new Error(`Failed to get Twitch users: ${JSON.stringify(data)}`);
  return data.data || [];
}

async function createEventSubSubscription(token, userId) {
  const res = await fetch("https://api.twitch.tv/helix/eventsub/subscriptions", {
    method: "POST",
    headers: { "Client-ID": process.env.TWITCH_CLIENT_ID, "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "stream.online", version: "1", condition: { broadcaster_user_id: userId }, transport: { method: "webhook", callback: process.env.TWITCH_CALLBACK_URL, secret: process.env.TWITCH_WEBHOOK_SECRET } })
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

async function getStreamInfo(token, userId) {
  const res = await fetch(`https://api.twitch.tv/helix/streams?user_id=${encodeURIComponent(userId)}`, { headers: { "Client-ID": process.env.TWITCH_CLIENT_ID, "Authorization": `Bearer ${token}` } });
  const data = await res.json();
  if (!res.ok) throw new Error(`Failed to get stream info: ${JSON.stringify(data)}`);
  return data.data[0] || null;
}

async function subscribeToTwitchUsers() {
  const logins = process.env.TWITCH_USER_LOGINS.split(",").map(l => l.trim().toLowerCase()).filter(Boolean);
  console.log("Monitoring:", logins.join(", "));
  const token = await getTwitchToken();
  const users = await getTwitchUserIds(token, logins);
  if (!users.length) { console.warn("⚠️ No Twitch users found"); return; }
  for (const user of users) {
    const result = await createEventSubSubscription(token, user.id);
    if (!result.ok && result.status !== 409) { console.error(`❌ Failed to subscribe to ${user.login}:`, result.data); }
    else if (result.status === 409) { console.log(`ℹ️ Already subscribed: ${user.login}`); }
    else { console.log(`✅ Subscribed: ${user.login}`); }
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
    const valid = expectedSignature.length === signature.length && crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature));
    if (!valid) return res.status(403).send("Forbidden");
    if (processedMessageIds.has(messageId)) return res.status(200).send("Duplicate ignored");
    processedMessageIds.add(messageId);
    if (processedMessageIds.size > 1000) processedMessageIds.delete(processedMessageIds.values().next().value);
    if (messageType === "webhook_callback_verification") return res.status(200).type("text/plain").send(req.body.challenge);
    if (messageType === "notification" && req.body.subscription?.type === "stream.online") {
      const { broadcaster_user_id, broadcaster_user_login, broadcaster_user_name } = req.body.event;
      console.log(`📡 ${broadcaster_user_name} went live`);
      const token = await getTwitchToken();
      const stream = await getStreamInfo(token, broadcaster_user_id);
      if (!stream) return res.status(200).send("Missing data");
      const thumbnailUrl = stream.thumbnail_url.replace("{width}", "1280").replace("{height}", "720");
      const isMrBean = broadcaster_user_login.toLowerCase() === MRBEAN_TWITCH_LOGIN.toLowerCase();
      const targetChannelId = isMrBean ? MRBEAN_ANNOUNCEMENTS_CHANNEL_ID : process.env.DISCORD_CHANNEL_ID;
      const pingContent = isMrBean
        ? `<@&${ROLE_IDS.announcements}> <@&${ROLE_IDS.streamAlerts}> 🔴 MrBeanTheDino is LIVE!`
        : `<@&${ROLE_IDS.streamAlerts}> 🔴 A friend just went live!`;
      const channel = await client.channels.fetch(targetChannelId);
      if (!channel) return res.status(200).send("Missing channel");
      const embed = new EmbedBuilder()
        .setTitle(`🦕 ${broadcaster_user_name} is now LIVE on Twitch!`)
        .setURL(`https://twitch.tv/${broadcaster_user_login}`)
        .setDescription(`**${stream.title}**\n\n🎮 Playing: ${stream.game_name}`)
        .setImage(thumbnailUrl).setColor(0x9146FF)
        .setFooter({ text: "Twitch Live Alert • DinoBot" }).setTimestamp();
      await channel.send({ content: pingContent, embeds: [embed] });
      console.log(`✅ Alert sent for ${broadcaster_user_name}`);
      return res.status(200).send("Notification processed");
    }
    if (messageType === "revocation") { console.warn("⚠️ Subscription revoked:", req.body.subscription?.type); return res.status(200).send("Revocation received"); }
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