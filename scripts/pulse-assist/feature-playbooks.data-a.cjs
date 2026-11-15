#!/usr/bin/env node
/** Pulse Assist playbooks (part A). */
const { pb } = require("./feature-playbooks.pb.cjs");

const FEATURE_PLAYBOOKS = [
  pb(
    "dashboard/properties/add-property",
    "dashboard/properties",
    "Add property",
    "How do I add a property?",
    "pulse:nav/dashboard/properties",
    [
      "Open [Dashboard → Properties](pulse:nav/dashboard/properties).",
      "Click **Add property** (or connect a new WordPress site).",
      "Enter site URL, credentials, and save.",
    ],
    ["add property", "connect site", "new client"],
  ),
  pb(
    "dashboard/properties/enable-site",
    "dashboard/properties",
    "Enable site",
    "How do I enable a property?",
    "pulse:nav/dashboard/properties",
    [
      "Open [Dashboard → Properties](pulse:nav/dashboard/properties).",
      "Find the property in the roster.",
      "Toggle the enable switch next to the property name (green = enabled).",
    ],
    ["enable property", "enable site", "how to enable a property"],
  ),
  pb(
    "dashboard/properties/site-credentials",
    "dashboard/properties",
    "Site credentials",
    "How do I edit site credentials?",
    "pulse:nav/dashboard/properties",
    [
      "Open [Dashboard → Properties](pulse:nav/dashboard/properties).",
      "Select the property tile.",
      "Update username, app password, or site URL in the property panel and save.",
    ],
    ["credentials", "app password", "wordpress credentials"],
  ),
  pb(
    "dashboard/properties/multi-site",
    "dashboard/properties",
    "Multi-site roster",
    "How do I manage multiple properties?",
    "pulse:nav/dashboard/properties",
    [
      "Open [Dashboard → Properties](pulse:nav/dashboard/properties).",
      "Each connected WordPress site appears as a property tile.",
      "Use the header property picker to switch the active workspace property.",
    ],
    ["multi-site", "multiple clients", "property roster"],
  ),

  // dashboard/api-keys
  pb(
    "dashboard/api-keys/openrouter-key",
    "dashboard/api-keys",
    "OpenRouter key",
    "How do I add my OpenRouter API key?",
    "pulse:nav/dashboard/api-keys",
    [
      "Open [Dashboard → API Keys](pulse:nav/dashboard/api-keys).",
      "Paste your OpenRouter API key in the **OpenRouter** field.",
      "Click **Test and save**.",
    ],
    ["openrouter", "openrouter key", "api key openrouter"],
  ),
  pb(
    "dashboard/api-keys/dataforseo-key",
    "dashboard/api-keys",
    "DataForSEO key",
    "How do I add my DataForSEO API key?",
    "pulse:nav/dashboard/api-keys",
    [
      "Open [Dashboard → API Keys](pulse:nav/dashboard/api-keys).",
      "Enter DataForSEO login and password.",
      "Click **Test and save**.",
    ],
    ["dataforseo", "dataforseo key"],
  ),

  // dashboard/master-rules
  pb(
    "dashboard/master-rules/per-site-rules",
    "dashboard/master-rules",
    "Per-site rules",
    "How do I edit master rules for a site?",
    "pulse:nav/dashboard/master-rules",
    [
      "Open [Dashboard → Master Rules](pulse:nav/dashboard/master-rules).",
      "Select the property from the roster.",
      "Edit client instructions in the **Master Rules** editor and save.",
    ],
    ["master rules", "client rules", "instructions"],
  ),
  pb(
    "dashboard/master-rules/workspace-storage",
    "dashboard/master-rules",
    "Workspace storage",
    "Where are master rules stored?",
    "pulse:nav/dashboard/master-rules",
    [
      "Open [Dashboard → Master Rules](pulse:nav/dashboard/master-rules).",
      "Saved rules are stored in browser localStorage per property. Use Dashboard workspace backup to persist settings on the server.",
    ],
    ["workspace storage", "master rules storage"],
  ),

  // dashboard/ai-generation
  pb(
    "dashboard/ai-generation/default-model",
    "dashboard/ai-generation",
    "Default model",
    "How do I change the default AI model?",
    "pulse:nav/dashboard/ai-generation",
    [
      "Open [Dashboard → AI & Models](pulse:nav/dashboard/ai-generation).",
      "Pick the default OpenRouter model from the model selector.",
      "Save settings.",
    ],
    ["default model", "change model", "ai model"],
  ),
  pb(
    "dashboard/ai-generation/temperature",
    "dashboard/ai-generation",
    "Temperature",
    "How do I adjust AI temperature?",
    "pulse:nav/dashboard/ai-generation",
    [
      "Open [Dashboard → AI & Models](pulse:nav/dashboard/ai-generation).",
      "Adjust the **Temperature** slider.",
      "Save settings.",
    ],
    ["temperature", "generation temperature"],
  ),
  pb(
    "dashboard/ai-generation/max-tokens",
    "dashboard/ai-generation",
    "Max tokens",
    "How do I change max tokens?",
    "pulse:nav/dashboard/ai-generation",
    [
      "Open [Dashboard → AI & Models](pulse:nav/dashboard/ai-generation).",
      "Set **Max tokens** for generation output.",
      "Save settings.",
    ],
    ["max tokens", "token limit"],
  ),

  // dashboard/google
  pb(
    "dashboard/google/gsc",
    "dashboard/google",
    "GSC connection",
    "How do I connect Google Search Console?",
    "pulse:nav/dashboard/google",
    [
      "Open [Dashboard → Google Services](pulse:nav/dashboard/google).",
      "Configure **Google Search Console** credentials for the property.",
      "Test connection and save.",
    ],
    ["gsc", "search console", "connect gsc"],
  ),
  pb(
    "dashboard/google/ga4",
    "dashboard/google",
    "GA4 connection",
    "How do I connect Google Analytics?",
    "pulse:nav/dashboard/google",
    [
      "Open [Dashboard → Google Services](pulse:nav/dashboard/google).",
      "Configure **Google Analytics 4** credentials.",
      "Test connection and save.",
    ],
    ["ga4", "analytics", "google analytics"],
  ),
  pb(
    "dashboard/google/gbp-credentials",
    "dashboard/google",
    "GBP credentials",
    "How do I connect Google Business Profile?",
    "pulse:nav/dashboard/google",
    [
      "Open [Dashboard → Google Services](pulse:nav/dashboard/google).",
      "Configure **Google Business Profile** OAuth and location settings.",
      "Save credentials.",
    ],
    ["gbp", "business profile", "google business profile settings"],
  ),

  // users
  pb(
    "users/invite-user",
    "users",
    "Invite user",
    "How do I invite a team member?",
    "pulse:nav/users",
    [
      "Open [Teams → Users](pulse:nav/users).",
      "In **Add member**, enter **Email**, **Display name**, and **Password**.",
      "Choose **Access role** and **Job title**.",
      "Click **Add member**.",
    ],
    ["invite user", "add member", "invite someone", "add team member"],
  ),
  pb(
    "users/roles",
    "users",
    "Access roles",
    "How do user roles work?",
    "pulse:nav/users",
    [
      "Open [Teams → Users](pulse:nav/users).",
      "When adding a member, set **Access role** (owner, admin, member, etc.).",
      "Roles control Teams module write access.",
    ],
    ["roles", "access role", "permissions"],
  ),
  pb(
    "users/member-profiles",
    "users",
    "Member profiles",
    "How do I view team member profiles?",
    "pulse:nav/users",
    [
      "Open [Teams → Users](pulse:nav/users).",
      "Browse the member roster for display names, emails, and job titles.",
    ],
    ["member profiles", "team members", "user list"],
  ),

  // chat
  pb(
    "chat/create-channel",
    "chat",
    "Create a channel",
    "How do I create a channel?",
    "pulse:nav/chat",
    [
      "Open [Teams → Chat](pulse:nav/chat).",
      "Under **Channels**, click **New channel** (+).",
      "Enter **Name**, choose **Visibility** (Public or Private).",
      "For private channels, select **Members**.",
      "Click **Create**.",
    ],
    ["create channel", "new channel", "add channel"],
  ),
  pb(
    "chat/send-dm",
    "chat",
    "Send a direct message",
    "How do I send a direct message?",
    "pulse:nav/chat",
    [
      "Open [Teams → Chat](pulse:nav/chat).",
      "Under **DMs**, click **New direct message** (+).",
      "Select a team member and start typing in the composer.",
    ],
    ["direct message", "dm", "new direct message", "private message"],
  ),
  pb(
    "chat/use-threads",
    "chat",
    "Threads",
    "How do threads work in Chat?",
    "pulse:nav/chat",
    [
      "Open [Teams → Chat](pulse:nav/chat).",
      "Open a channel or DM.",
      "Click **Reply in thread** on a message to open the thread panel.",
      "Send replies in the thread composer.",
    ],
    ["threads", "reply in thread", "thread reply"],
  ),
  pb(
    "chat/upload-file",
    "chat",
    "Upload a file",
    "How do I upload a file in Chat?",
    "pulse:nav/chat",
    [
      "Open [Teams → Chat](pulse:nav/chat).",
      "Open a channel or DM.",
      "Use the attachment control in the message composer to upload a file.",
    ],
    ["file uploads", "upload file", "attach file", "attachment"],
  ),
  pb(
    "chat/mentions",
    "chat",
    "Mentions",
    "How do mentions work in Chat?",
    "pulse:nav/chat",
    [
      "Open [Teams → Chat](pulse:nav/chat).",
      "In the composer, type **@** followed by a team member name to mention them.",
      "Check **Mentions** in the sidebar for messages where you were mentioned.",
    ],
    ["mentions", "@mention", "notify user"],
  ),

  // tasks
  pb(
    "tasks/projects",
    "tasks",
    "Projects",
    "How do I create a project in Tasks?",
    "pulse:nav/tasks",
    [
      "Open [Teams → Tasks](pulse:nav/tasks).",
      "Click **New project** in the projects sidebar.",
      "Name the project and start adding sections and tasks.",
    ],
    ["projects", "new project", "create project"],
  ),
  pb(
    "tasks/tasks",
    "tasks",
    "Tasks",
    "How do I add a task?",
    "pulse:nav/tasks",
    [
      "Open [Teams → Tasks](pulse:nav/tasks).",
      "Select a project and section.",
      "Click **Add task** and enter the task title.",
    ],
    ["tasks", "add task", "create task"],
  ),
  pb(
    "tasks/sections",
    "tasks",
    "Sections",
    "How do I organize task sections?",
    "pulse:nav/tasks",
    [
      "Open [Teams → Tasks](pulse:nav/tasks).",
      "Inside a project, add or rename **Sections** to group tasks.",
    ],
    ["sections", "task sections", "kanban columns"],
  ),

];

module.exports = { FEATURE_PLAYBOOKS_PART_A: FEATURE_PLAYBOOKS };