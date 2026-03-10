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
const INFO_CATEGORY_ID = "1480080173469532193";

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
let onboardingCategoryId = null;
let pickRolesChannelId = null;

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
    await setupPickRolesChannel();
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
// SETUP PICK YOUR ROLES CHANNEL
// ----------------------------
async function setupPickRolesChannel() {
  const guild = await client.guilds.fetch(GUILD_ID);
  const channels = await guild.channels.fetch();

  const existing = channels.find(
    c => c.parentId === INFO_CATEGORY_ID && c.name === "pick-your-roles"
  );

  if (existing) {
    pickRolesChannelId = existing.id;
    console.log("ℹ️ Pick your roles channel already exists");

    // Check if bot message already exists
    const messages = await existing.messages.fetch({ limit: 5 });
    const botMsg = messages.find(m => m.author.id === client.user.id && m.embeds.length > 0);
    if (botMsg) return;

    await postPickRolesMessage(existing);
    return;
  }

  const channel = await guild.channels.create({
    name: "pick-your-roles",
    type: ChannelType.GuildText,
    parent: INFO_CATEGORY_ID,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel]
      },
      {
        id: ROLE_IDS.unverified,
        deny: [PermissionFlagsBits.ViewChannel]
      },
      {
        id: ROLE_IDS.goofyGoobers,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ReadMessageHistory
        ],
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
      "**Optional — Gender Space**\n\n" +
      "😎 **BROS** — private hangout space for the guys\n" +
      "💅 **Gurls** — private hangout space for the girls\n\n" +
      "⚠️ These roles are completely optional and exist in good faith for members who enjoy hanging out in a more relaxed same-gender space. " +
      "These unlock private hidden channels. You are under no obligation to pick one.\n\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
      "**Content Role**\n\n" +
      "🎮 **Streamer** — You stream on Twitch\n" +
      "👀 **Viewer** — You watch streams\n\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
      "*Clicking a role button will toggle it on or off.*"
    )
    .setColor(0x9146FF)
    .setFooter({ text: "DinoBot • Role Selection" });

  const genderRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("roles_bros")
      .setLabel("BROS")
      .setEmoji("😎")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("roles_gurls")
      .setLabel("Gurls")
      .setEmoji("💅")
      .setStyle(ButtonStyle.Primary)
  );

  const contentRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("roles_streamer")
      .setLabel("Streamer")
      .setEmoji("🎮")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("roles_viewer")
      .setLabel("Viewer")
      .setEmoji("👀")
      .setStyle(ButtonStyle.Secondary)
  );

  await channel.send({ embeds: [embed], components: [genderRow, contentRow] });
  console.log("✅ Pick your roles message posted");
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

    if (channel.id === WELCOME_CHANNEL_ID || channel.id === RULES_CHANNEL_ID) {
      await channel.permissionOverwrites.edit(ROLE_IDS.unverified, {
        ViewChannel: true,
        SendMessages: false,
        AddReactions: false,
        ReadMessageHistory: true
      }).catch(() => {});
      continue;
    }

    if (
      channel.type === ChannelType.GuildCategory ||
      channel.type === ChannelType.GuildText ||
      channel.type === ChannelType.GuildVoice ||
      channel.type === ChannelType.GuildAnnouncement
    ) {
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

  if (botMessages.size >= 1) {
    const sorted = botMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    rulesMessageId = sorted.first().id;
    console.log("ℹ️ Rules message already exists");
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
    console.log(`✅ Assigned Unverified role to ${member.user.tag}`);

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
    const existing = channels.find(
      c => c.parentId === onboardingCategoryId && c.name === channelName
    );

    if (existing) {
      console.log(`ℹ️ Onboarding channel already exists for ${member.user.tag}`);
      return;
    }

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
      .setFooter({ text: "Step 1 of 3 — Accept Rules" });

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
// BUTTON INTERACTION HANDLER
// ----------------------------
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  const { customId, user, guild } = interaction;
  const member = await guild.members.fetch(user.id);

  try {

    // ----------------------------
    // PICK YOUR ROLES BUTTONS
    // (toggle on/off for existing members)
    // ----------------------------
    if (customId === "roles_bros") {
      if (member.roles.cache.has(ROLE_IDS.bros)) {
        await member.roles.remove(ROLE_IDS.bros);
        await interaction.reply({ content: "✅ **BROS** 😎 role removed!", ephemeral: true });
      } else {
        await member.roles.add(ROLE_IDS.bros);
        await interaction.reply({ content: "✅ **BROS** 😎 role assigned!", ephemeral: true });
      }
      return;
    }

    if (customId === "roles_gurls") {
      if (member.roles.cache.has(ROLE_IDS.gurls)) {
        await member.roles.remove(ROLE_IDS.gurls);
        await interaction.reply({ content: "✅ **Gurls** 💅 role removed!", ephemeral: true });
      } else {
        await member.roles.add(ROLE_IDS.gurls);
        await interaction.reply({ content: "✅ **Gurls** 💅 role assigned!", ephemeral: true });
      }
      return;
    }

    if (customId === "roles_streamer") {
      if (member.roles.cache.has(ROLE_IDS.streamer)) {
        await member.roles.remove(ROLE_IDS.streamer);
        await interaction.reply({ content: "✅ **Streamer** 🎮 role removed!", ephemeral: true });
      } else {
        await member.roles.add(ROLE_IDS.streamer);
        await interaction.reply({ content: "✅ **Streamer** 🎮 role assigned!", ephemeral: true });
      }
      return;
    }

    if (customId === "roles_viewer") {
      if (member.roles.cache.has(ROLE_IDS.viewer)) {
        await member.roles.remove(ROLE_IDS.viewer);
        await interaction.reply({ content: "✅ **Viewer** 👀 role removed!", ephemeral: true });
      } else {
        await member.roles.add(ROLE_IDS.viewer);
        await interaction.reply({ content: "✅ **Viewer** 👀 role assigned!", ephemeral: true });
      }
      return;
    }

    // ----------------------------
    // ONBOARDING BUTTONS
    // ----------------------------
    const parts = customId.split("_");
    const memberId = parts[parts.length - 1];

    if (memberId !== user.id) {
      await interaction.reply({ content: "❌ These buttons are not for you!", ephemeral: true });
      return;
    }

    // Step 1 — Accept rules
    if (customId.startsWith("onboard_accept_rules_")) {
      await member.roles.remove(ROLE_IDS.unverified);
      await member.roles.add(ROLE_IDS.goofyGoobers);
      console.log(`✅ Rules accepted: ${user.tag}`);

      await interaction.update({
        embeds: [
          new EmbedBuilder()
            .setTitle("✅ Rules Accepted!")
            .setDescription("You're verified and have full access to the server! Now let's pick your roles.")
            .setColor(0x57F287)
            .setFooter({ text: "Step 1 of 3 — Complete ✅" })
        ],
        components: []
      });

      await sendGenderRoleSelection(interaction.channel, member);
      return;
    }

    // Step 2 — Gender role
    if (customId.startsWith("onboard_bros_")) {
      await member.roles.add(ROLE_IDS.bros);
      await interaction.update({
        embeds: [
          new EmbedBuilder()
            .setTitle("😎 BROS role assigned!")
            .setDescription("Nice! One more selection...")
            .setColor(0x9146FF)
            .setFooter({ text: "Step 2 of 3 — Complete ✅" })
        ],
        components: []
      });
      await sendContentRoleSelection(interaction.channel, member);
      return;
    }

    if (customId.startsWith("onboard_gurls_")) {
      await member.roles.add(ROLE_IDS.gurls);
      await interaction.update({
        embeds: [
          new EmbedBuilder()
            .setTitle("💅 Gurls role assigned!")
            .setDescription("Nice! One more selection...")
            .setColor(0x9146FF)
            .setFooter({ text: "Step 2 of 3 — Complete ✅" })
        ],
        components: []
      });
      await sendContentRoleSelection(interaction.channel, member);
      return;
    }

    if (customId.startsWith("onboard_skip_gender_")) {
      await interaction.update({
        embeds: [
          new EmbedBuilder()
            .setTitle("⏭️ Skipped!")
            .setDescription("No worries! One more selection...")
            .setColor(0x9146FF)
            .setFooter({ text: "Step 2 of 3 — Complete ✅" })
        ],
        components: []
      });
      await sendContentRoleSelection(interaction.channel, member);
      return;
    }

    // Step 3 — Content role
    if (customId.startsWith("onboard_streamer_")) {
      await member.roles.add(ROLE_IDS.streamer);
      await interaction.update({
        embeds: [
          new EmbedBuilder()
            .setTitle("🎮 Streamer role assigned!")
            .setDescription("All done!")
            .setColor(0x57F287)
            .setFooter({ text: "Step 3 of 3 — Complete ✅" })
        ],
        components: []
      });
      await finishOnboarding(interaction.channel, member);
      return;
    }

    if (customId.startsWith("onboard_viewer_")) {
      await member.roles.add(ROLE_IDS.viewer);
      await interaction.update({
        embeds: [
          new EmbedBuilder()
            .setTitle("👀 Viewer role assigned!")
            .setDescription("All done!")
            .setColor(0x57F287)
            .setFooter({ text: "Step 3 of 3 — Complete ✅" })
        ],
        components: []
      });
      await finishOnboarding(interaction.channel, member);
      return;
    }

  } catch (err) {
    console.error("❌ Button interaction error:", err);
    await interaction.reply({ content: "❌ Something went wrong. Please contact a mod.", ephemeral: true }).catch(() => {});
  }
});

// ----------------------------
// STEP 2 — GENDER ROLE SELECTION
// ----------------------------
async function sendGenderRoleSelection(channel, member) {
  const embed = new EmbedBuilder()
    .setTitle("🎭 Optional Role")
    .setDescription(
      "This next role is completely optional:\n\n" +
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
    .setColor(0x9146FF)
    .setFooter({ text: "Step 2 of 3 — Pick a role or skip" });

  const row = new ActionRowBuilder().addComponents(
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

  await channel.send({ embeds: [embed], components: [row] });
}

// ----------------------------
// STEP 3 — CONTENT ROLE SELECTION
// ----------------------------
async function sendContentRoleSelection(channel, member) {
  const embed = new EmbedBuilder()
    .setTitle("🎮 Content Role")
    .setDescription(
      "Last one! Are you a streamer or a viewer?\n\n" +
      "🎮 **Streamer** — You stream on Twitch\n" +
      "👀 **Viewer** — You watch streams"
    )
    .setColor(0x9146FF)
    .setFooter({ text: "Step 3 of 3 — Pick your content role" });

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