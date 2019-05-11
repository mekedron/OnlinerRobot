const Telegraf = require('telegraf')
const https = require('https')
const { MongoClient } = require('mongodb')

class Sender {
  constructor (
    botToken,
    mongoUri = 'mongodb://localhost:27017',
    sessionsCollectionName = 'session',
    apartmentsCollectionName = 'apartment',
    schedule = null,
    mongoOptions = {
      useNewUrlParser: true
    }
  ) {
    this.botToken = botToken
    this.mongoUri = mongoUri
    this.sessionsCollectionName = sessionsCollectionName
    this.apartmentsCollectionName = apartmentsCollectionName
    this.schedule = schedule
    this.mongoOptions = mongoOptions

    this.inited = false;
  }

  async init () {
    if (this.inited) {
      return;
    }

    this.client = await MongoClient.connect(this.mongoUri, this.mongoOptions)
    this.db = this.client.db()
    this.sessions = this.db.collection(this.sessionsCollectionName)
    this.apartments = this.db.collection(this.apartmentsCollectionName)

    await this.apartments.createIndex({'onliner_id': 1})

    this.bot = new Telegraf(this.botToken)

    if (this.schedule) {
      const cron = require('node-cron');
      cron.schedule(this.schedule, this.exec.bind(this))
    }

    this.inited = true;

    return this.exec()
  }

  async exec () {
    let users = await this.sessions.find().toArray()

    // @todo batch
    for (var i = 0; i < users.length; i++) {
      await this.processUser(users[i])
    }
  }

  async processUser (user) {
    if (!user.data || !user.data.url) {
      return
    }

    let chatId = user.key.split(':')[0]
    let apartments = await this.fetchApartments(user.data.url)

    if (!apartments.length) {
      return
    }

    for (var i = 0; i < apartments.length; i++) {
      let apartment = apartments[i]
      apartment.onliner_id = apartment.id;
      delete apartment.id;

      let existingApartment = await this.apartments.findOne({
        onliner_id: apartment.onliner_id
      })

      apartment.has_sent_to = existingApartment
        ? existingApartment.has_sent_to
        : {}

      if (apartment.has_sent_to[chatId]) {
        continue
      } else {
        apartment.has_sent_to[chatId] = 1
      }

      try {
        await this.sendApartment(chatId, apartment)
        await this.apartments.findOneAndUpdate({
          onliner_id: apartment.onliner_id
        }, { $set: apartment }, { upsert: true })
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

  async sendApartment (chatId, apartment) {
    let createdAt = new Date(apartment.created_at).toLocaleString('en-US')
    let updatedAt = new Date(apartment.last_time_up).toLocaleString('en-US')

    let message = ''

    message += `💵 $${apartment.price.converted.USD.amount}\n`
    message += `📍 ${apartment.location.address}\n`
    message += `🌟 ${createdAt}\n`

    if (updatedAt !== createdAt) {
      message += `♻️ ${updatedAt}\n`
    }

    return this.bot.telegram.sendPhoto(chatId, apartment.photo, {
      caption: message,
      reply_markup: JSON.stringify({
        inline_keyboard: [
          [{ text: 'View', url: apartment.url }],
        ],
      }),
    })
  }

  async fetchApartments (url) {
    let params = url.slice(url.indexOf('?')).replace('#', '&')

    if (!params) {
      return []
    }

    try {
      // @todo support pagination
      let result = await this.callAPI(
        'https://ak.api.onliner.by/search/apartments' + params, {
          referer: url,
        })

      return result.apartments || []

    } catch (e) {
      console.error('Can\'t get the apartments by the url = ' + url, e)

      return []
    }
  }

  async callAPI (url, options) {
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
            'Status code is not 200, response is: ' +
            JSON.stringify(res.rawHeaders),
          ))
        }

        let data = ''
        res.on('data', chunk => data += chunk)
        res.on('end', () => resolve(JSON.parse(data)))
      }).on('error', err => reject(new Error(err))),
    )
  }
}

const sender = new Sender(
  process.env.BOT_TOKEN,
  process.env.MONGO_URI,
  process.env.SESSIONS_COLLECTION,
  process.env.APARTMENTS_COLLECTION,
  process.env.SCHEDULE
);

sender.init().catch(console.error);
