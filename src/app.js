const fs = require('fs')
const cp = require('child_process')
const constants = require('./constants.js')
const defer = require('./utils.js').defer
const jsonrpc = require('./utils.js').jsonrpc
const express = require('express')
const bodyParser = require('body-parser')
const log = require('debug')('info:api-app')

// Set up express
const app = express()
// Set up child processes
const stateManager = cp.fork(`${__dirname}/state-manager/app.js`)
const historyManager = cp.fork(`${__dirname}/history-manager/app.js`)

// /////////////// CONFIG ///////////////// //
const port = 3000
const dbDir = './db'
const txLogDir = dbDir + '/tx-log/'
const stateDBDir = dbDir + '/state-db/'
const historyDBDir = dbDir + '/history-db/'
// /////////////// CONFIG ///////////////// //

// Set up listeners to print messages
const logMsg = (m) => {
  log('PARENT got message:', m)
}
stateManager.on('message', logMsg)
historyManager.on('message', logMsg)

app.use(bodyParser.json())

// Setup simple message queue
const messageQueue = {}
let messageCounter = 0

function sendMessage (process, message) {
  const deferred = defer()
  process.send({
    id: messageCounter,
    message
  })
  messageQueue[messageCounter] = { resolve: deferred.resolve }
  messageCounter++
  return deferred.promise
}

function resolveMessage (m) {
  log('Resolving message with ID', m.id)
  messageQueue[m.id].resolve(m)
}

stateManager.on('message', resolveMessage)
historyManager.on('message', resolveMessage)

// Handle incoming transactions
app.post('/api', function (req, res) {
  if (req.body.method === constants.DEPOSIT_METHOD || req.body.method === constants.ADD_TX_METHOD) {
    sendMessage(stateManager, req.body).then((response) => {
      res.send('POST request success from state manager')
    })
  } else if (req.body.method === constants.NEW_BLOCK_METHOD) {
    sendMessage(historyManager, req.body).then((response) => {
      res.send('POST request success from history manager')
    })
  }
})

async function startup () {
  // Begin listening for connections
  // Make a new db directory if it doesn't exist.
  if (!fs.existsSync(dbDir)) {
    log('Creating a new db directory because it does not exist')
    fs.mkdirSync(dbDir)
  }
  await sendMessage(stateManager, jsonrpc(constants.INIT_METHOD, {
    dbDir: stateDBDir,
    txLogDir
  }))
  await sendMessage(historyManager, jsonrpc(constants.INIT_METHOD, {
    dbDir: historyDBDir,
    txLogDir
  }))
  app.listen(port, () => console.log('\x1b[36m%s\x1b[0m', `Operator listening on port ${port}!`))
}
startup()

module.exports = app
