const Telegraf = require('telegraf')
const LocalSession = require('telegraf-session-local')

const bot = new Telegraf(process.env.BOT_TOKEN)
const localSession = new LocalSession({
  database: process.env.SESSIONS_DB,
  state: {
    sessions: [],
    apartments: [],
  },
})

bot.use(localSession.middleware())

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
    'Sorry if you were insulted by this bot, I\'ve just tried to make the world better.')
})
// bot.command('refresh', ctx => {
//   return ctx.reply('Apartments cache has been cleared successfully! ⭐️')
// })
bot.hears(/https:\/\/r.onliner.by\/ak\//ig, (ctx) => {
  ctx.session.url = ctx.message.text

  return ctx.reply('Thanks, the link has been updated.')
})

bot.launch()
