const Telegraf = require('telegraf')
const { TelegrafMongoSession } = require('telegraf-session-mongodb');

const bot = new Telegraf(process.env.BOT_TOKEN)

TelegrafMongoSession.setup(bot, process.env.MONGO_URI, {
  collectionName: process.env.SESSIONS_COLLECTION,
});

bot.start((ctx) => {
  return ctx.reply(
    (!ctx.session.url)
      ? ('Please, send a link from the Onliner with preselected filters.')
      : ('Current link is:\n\n' + ctx.session.url),
    {
      disable_web_page_preview: true,
    },
  )
})
bot.command('stop', (ctx) => {
  ctx.session.url = null

  return ctx.reply(
    'Sorry if you were insulted by this bot, I\'ve just tried to make this world a bit better.')
})
bot.hears(/https:\/\/r.onliner.by\/ak\//ig, (ctx) => {
  ctx.session.url = ctx.message.text

  return ctx.reply('Thanks, the link has been updated.')
})

bot.startPolling()
