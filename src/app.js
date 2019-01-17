const fs = require('fs')
const cp = require('child_process')
const constants = require('./constants.js')
const defer = require('./utils.js').defer
const jsonrpc = require('./utils.js').jsonrpc
const express = require('express')
const bodyParser = require('body-parser')
const log = require('debug')('info:api-app')
const EthService = require('./eth-service.js')

// Set up express
const app = express()
// Set up child processes
let stateManager
let blockManager

// /////////////// CONFIG ///////////////// //
const configFile = (process.env.CONFIG) ? process.env.CONFIG : './config.json'
const config = JSON.parse(fs.readFileSync(configFile, 'utf8'))
const port = 3000
// Set db dir to a new db if test mode is enabled
config.dbDir = (process.env.NODE_ENV === 'test') ? config.dbDir + +new Date() : config.dbDir
const txLogDir = config.dbDir + '/tx-log/'
const stateDBDir = config.dbDir + '/state-db/'
const blockDBDir = config.dbDir + '/block-db/'
// /////////////// CONFIG ///////////////// //

app.use(bodyParser.json())

// Setup simple message queue
const messageQueue = {}
let messageCounter = 0

function sendMessage (process, message) {
  const deferred = defer()
  process.send({
    ipcID: messageCounter,
    message
  })
  messageQueue[messageCounter] = { resolve: deferred.resolve }
  messageCounter++
  return deferred.promise
}

function resolveMessage (m) {
  log('Resolving message with ipcID', m.ipcID)
  messageQueue[m.ipcID].resolve(m)
  delete messageQueue[m.ipcID]
}

// Handle incoming transactions
app.post('/api', function (req, res) {
  log('INCOMING RPC request with method:', req.body.method, 'and rpcID:', req.body.id)
  if (req.body.method === constants.DEPOSIT_METHOD ||
      req.body.method === constants.ADD_TX_METHOD ||
      req.body.method === constants.NEW_BLOCK_METHOD) {
    sendMessage(stateManager, req.body).then((response) => {
      log('OUTGOING response to RPC request with method:', req.body.method, 'and rpcID:', req.body.id)
      res.send(response.message)
    })
  } else if (req.body.method === 'NOT YET IMPLEMENTED') {
    sendMessage(blockManager, req.body).then((response) => {
      res.send('POST request success from block manager')
    })
  }
})

async function startup () {
  // Begin listening for connections
  // Make a new db directory if it doesn't exist.
  if (!fs.existsSync(config.dbDir)) {
    log('Creating a new db directory because it does not exist')
    fs.mkdirSync(config.dbDir)
  }
  try {
    // Setup web3
    await EthService.startup(config)
    // Setup our child processes -- stateManager & blockManager
    stateManager = cp.fork(`${__dirname}/state-manager/app.js`)
    blockManager = cp.fork(`${__dirname}/block-manager/app.js`)
    stateManager.on('message', resolveMessage)
    blockManager.on('message', resolveMessage)
    // Now send a message
    await sendMessage(stateManager, jsonrpc(constants.INIT_METHOD, {
      dbDir: stateDBDir,
      txLogDir
    }))
    await sendMessage(blockManager, jsonrpc(constants.INIT_METHOD, {
      dbDir: blockDBDir,
      txLogDir
    }))
  } catch (err) {
    throw err
  }
  log('Finished sub process startup')
  app.listen(port, () => {
    console.log('\x1b[36m%s\x1b[0m', `Operator listening on port ${port}!`)
  })
}
startup()

module.exports = app
