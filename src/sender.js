const Telegraf = require('telegraf')
const https = require('https')
const low = require('lowdb')
const FileSync = require('lowdb/adapters/FileSync')
const lodashId = require('lodash-id')
const cron = require('node-cron');

const bot = new Telegraf(process.env.BOT_TOKEN)

const sessionAdapter = new FileSync(process.env.SESSIONS_DB)
const apartmentsAdapter = new FileSync(process.env.APARTMENTS_DB)

const sessionDB = low(sessionAdapter)
const apartmentsDB = low(apartmentsAdapter)

apartmentsDB.defaults({ apartments: [] }).write()
apartmentsDB._.mixin(lodashId)

let callAPI = function (url, options) {
  let requestOptions = Object.assign({
    headers: {
      'Accept': 'application/json, text/plain, */*',
    },
  }, options)

  return new Promise((resolve, reject) => https.get(
    url,
    requestOptions,
    (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(
          'Status code is not 200, response is: ' + JSON.stringify(res.rawHeaders),
        ))
      }

      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => resolve(JSON.parse(data)))
    }).on('error', err => reject(new Error(err))),
  )
}

let getUsers = async function () {
  return sessionDB.read().get('sessions').value()
}

let sendApartment = function (chatId, apartment) {
  let createdAt = new Date(apartment.created_at).toLocaleString('en-US')
  let updatedAt = new Date(apartment.last_time_up).toLocaleString('en-US')

  let message = ''

  message += `💵 $${apartment.price.converted.USD.amount}\n`
  message += `📍 ${apartment.location.address}\n`
  message += `🌟 ${createdAt}\n`

  if (updatedAt !== createdAt) {
    message += `♻️ ${updatedAt}\n`
  }

  return bot.telegram.sendPhoto(chatId, apartment.photo, {
    caption: message,
    reply_markup: JSON.stringify({
      inline_keyboard: [
        [{ text: 'View', url: apartment.url }],
      ],
    }),
  })
}

let start = async function () {
  let users = await getUsers()

  // @todo batch
  for (var i = 0; i < users.length; i++) {
    await processUser(users[i])
  }
}

let processUser = async function (user) {
  if (!user.data || !user.data.url) {
    return
  }

  let chatId = user.id.split(':')[0]
  let apartments = await fetchApartments(user.data.url)

  apartmentsDB.read()
  let collection = apartmentsDB.get('apartments')

  if (!apartments.length) {
    return
  }

  for (var i = 0; i < apartments.length; i++) {
    let apartment = apartments[i]
    let existingApartment = await collection.getById(apartment.id).value()

    apartment.has_sent_to = existingApartment
      ? existingApartment.has_sent_to
      : {}

    if (apartment.has_sent_to[chatId]) {
      continue
    } else {
      apartment.has_sent_to[chatId] = 1
    }

    try {
      await sendApartment(chatId, apartment)
      await collection.upsert(apartment).write()
    } catch (e) {
      console.error(
        'Can\'t send the apartment to the user = ' +
        user.id + ', apartment = ' +
        JSON.stringify(apartment),
        e,
      )
    }
  }
}

let fetchApartments = async function (url) {
  let params = url.slice(url.indexOf('?')).replace('#', '&')

  if (!params) {
    return []
  }

  try {
    // @todo support pagination
    let result = await callAPI(
      'https://ak.api.onliner.by/search/apartments' + params, {
        referer: url,
      })

    return result.apartments || []

  } catch (e) {
    console.error('Can\'t get the apartments by the url = ' + url, e)

    return []
  }
}

cron.schedule(process.env.SCHEDULE, start);
