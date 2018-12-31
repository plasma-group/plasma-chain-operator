const cp = require('child_process')
const constants = require('./constants.js')
const defer = require('./utils.js').defer
const express = require('express')
const bodyParser = require('body-parser')
const log = require('debug')('info:api-app')

// Set up express
const app = express()
const port = 3000
// Set up child processes
const stateManager = cp.fork(`${__dirname}/state-manager/app.js`)
const historyManager = cp.fork(`${__dirname}/history-manager/app.js`)

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

function sendMessage (message) {
  const deferred = defer()
  stateManager.send({
    id: messageCounter,
    message
  })
  messageQueue[messageCounter] = { resolve: deferred.resolve }
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
  if (req.body.method === constants.DEPOSIT_METHOD) {
    sendMessage(req.body).then((response) => {
      res.send('POST request success')
    })
  }
})

async function startup () {
  // Begin listening for connections
  app.listen(port, () => console.log(`Operator listening on port ${port}!`))
}
startup()

module.exports = app
