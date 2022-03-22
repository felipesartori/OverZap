require('dotenv').config()

import makeWASocket, { useSingleFileAuthState, AnyMessageContent, delay } from '@adiwajshing/baileys-md'
const { DisconnectReason } = require("@adiwajshing/baileys-md")
const express = require('express');
const app = express();
const fs = require('fs');
import { Boom } from '@hapi/boom'
const cors = require("cors");
const browser_client = process.env.BROWSER_CLIENT || "chatbot";
const browser_name = process.env.BROWSER_NAME || "Chrome";
const googleTTS = require("google-tts-api");
const axios = require('axios');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.json({
  limit: '50mb'
}));

const { state, saveState } = useSingleFileAuthState(`./${browser_client}_auth_info_multi.json`)

const startSock = () => {

  const sock = makeWASocket({
    version: [2, 2204, 13],
    printQRInTerminal: true,
    browser: [browser_client, browser_name, "10.0"],
    auth: state,
    getMessage: async key => {
      return {
        conversation: 'hello'
      }
    }
  })

  // send Message
  const sendMessage = async (msg: AnyMessageContent, jid: string, delaySecond: number) => {
    await sock.presenceSubscribe(jid)
    await delay(500)

    await sock.sendPresenceUpdate('composing', jid)
    await delay(delaySecond)

    await sock.sendPresenceUpdate('paused', jid)
    const msgSend = await sock.sendMessage(jid, msg)

    return msgSend;
  }

  // send Location
  const sendLocation = async (msg: AnyMessageContent, jid: string, delaySecond: number) => {
    await sock.presenceSubscribe(jid)
    await delay(500)

    await sock.sendPresenceUpdate('composing', jid)
    await delay(delaySecond)

    await sock.sendPresenceUpdate('paused', jid)

    await sock.sendMessage(jid, msg)
  }

  // send Image
  const sendImage = async (msg: AnyMessageContent, jid: string, delaySecond: number) => {
    await sock.presenceSubscribe(jid)
    await delay(500)

    await sock.sendPresenceUpdate('composing', jid)
    await delay(delaySecond)

    await sock.sendPresenceUpdate('paused', jid)
    const msgSend = await sock.sendMessage(jid, msg)

    return msgSend;
  }

  // send Audio
  const sendAudio = async (msg: AnyMessageContent, jid: string, delaySecond: number) => {
    await sock.presenceSubscribe(jid)
    await delay(500)

    await sock.sendPresenceUpdate('recording', jid)
    await delay(delaySecond)

    await sock.sendPresenceUpdate('paused', jid)
    const msgSend = await sock.sendMessage(jid, msg)

    return msgSend;
  }

  // get a phrase 
  function getWord() {
    let choices = [];
    choices = fs.readFileSync('phrase.txt').toString().split('\n');
    return choices[~~(choices.length * Math.random())]
  }

  // get a delay
  function halfWord(value) {
    var cont = (value.split(' ').length / 2 * 1000)
    if (cont >= 1 || cont === 0) {
      return cont
    } else {
      return cont
    }
  }

  // transform text to audio and save in local ./Media/audio.mp3
  async function textToAudio(text) {
    try {
      await googleTTS
        .getAudioBase64(text, {
          lang: "pt",
          slow: false,
          host: "https://translate.google.com",
          timeout: 10000,
          splitPunct: ",.?",
        })
        .then(async (base64) => {
          const buffer = Buffer.from(base64, 'base64');
          await fs.writeFileSync('./Media/audio.mp3', buffer, { encoding: 'base64' })
        })
        .catch()
    } catch (error) {
      console.log(error)
    }
  }

  // get a random image and save in local ./Media/image.png
  async function getImage() {
    const url = 'http://source.unsplash.com/random'
    const path = './Media/image.png'

    await axios({
      url,
      responseType: 'stream',
    }).then(
      response =>
        new Promise<void>((resolve, reject) => {
          response.data
            .pipe(fs.createWriteStream(path))
            .on('finish', () => resolve())
            .on('error', e => reject(e));
        }),
    )
  }

  // generate a random number 0-3
  function getRandom() {
    return Math.floor(Math.random() * 4)
  }

  // generate a random coordenaties (latitude and longitude)
  function getRandomInRange(from, to, fixed) {
    return (Math.random() * (to - from) + from).toFixed(fixed) * 1;
  }

  // socket received message
  sock.ev.on('messages.upsert', async m => {

    const msg = m.messages[0]
    const remoteJid = msg?.key?.remoteJid as string
    const fromMe = msg?.key?.fromMe
    const type = m.type

    // get phrase to set word/delay
    const word = getWord()

    // get a delay message
    const halfWordCount = halfWord(word)

    if (!fromMe && type === 'notify') {

      // get a random 0-3
      const random = getRandom()

      // mark as read message on whatsapp      
      await sock.chatModify({ markRead: true, lastMessages: [msg] }, remoteJid)

      if (random === 0) { // text
        await sendMessage({ text: word }, remoteJid, halfWordCount)
      } else if (random === 1) { // audio
        await textToAudio(word)
        await sendAudio({ audio: { url: './Media/audio.mp3' }, mimetype: 'audio/mp4', ptt: true }, remoteJid, halfWordCount)
      } else if (random === 2) { // image
        await getImage()
        await sendImage({ image: { url: './Media/image.png' } }, remoteJid, halfWordCount)
      } else if (random === 3) { // location
        const longi = getRandomInRange(-180, 180, 3) // get longitute
        const latit = getRandomInRange(-180, 180, 3) // get latitude
        await sendLocation({ location: { degreesLatitude: latit, degreesLongitude: longi } }, remoteJid, halfWordCount)
      }
    }
  })

  // socket connection
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update
    if (connection === 'close') {
      if ((lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut) {
        startSock()
      } else {
        // console.log('connection closed')
      }
    }
    // console.log('connection update', update)
  })

  sock.ev.on('creds.update', saveState)

  return sock
}

startSock()
