const path = require('path')
const fs = require('fs')
const cp = require('child_process')
const constants = require('./constants.js')
const defer = require('./utils.js').defer
const jsonrpc = require('./utils.js').jsonrpc
const express = require('express')
const cors = require('cors')
const bodyParser = require('body-parser')
const log = require('debug')('info:api-app')
const EthService = require('./eth-service.js')
const BN = require('web3').utils.BN
const models = require('plasma-utils').serialization.models
const SignedTransaction = models.SignedTransaction
const debug = require('debug')

if (process.env.DEBUG === undefined) {
  // If no logging is enabled, set these as defaults
  debug.enable('info:state,info:block-store,info:leveldb-sum-tree')
}

class Server {
  constructor () {
    // Setup simple message queue
    this.messageQueue = {}
    this.messageCount = 0

    // Set up child processes
    this.stateManager = {}
    this.blockManager = {}
    this.started = false
    this.alreadyStartedError = new Error('Operator already started!')
  }

  sendMessage (process, message) {
    const deferred = defer()
    process.send({
      ipcID: this.messageCount,
      message
    })
    this.messageQueue[this.messageCount] = { resolve: deferred.resolve }
    this.messageCount++
    return deferred.promise
  }

  resolveMessage (m) {
    log('Resolving message with ipcID', m.ipcID)
    if (m.ipcID === -1) {
      // If this is a message directly from a child, it must be the root hash from the block-store
      log('Got new block root:', m.message.rootHash, '- submitting to Ethereum')
      EthService.submitRootHash(m.message.rootHash)
      return
    }
    this.messageQueue[m.ipcID].resolve(m)
    delete this.messageQueue[m.ipcID]
  }

  async startup (config) {
    // Set up express
    this.app = express()
    this.app.use(bodyParser.json())
    this.app.use(cors())
    if (this.started) {
      throw this.alreadyStartedError
    }
    // Make a new db directory if it doesn't exist.
    if (!fs.existsSync(config.dbDir)) {
      log('Creating a new db directory because it does not exist')
      fs.mkdirSync(config.dbDir, { recursive: true })
      fs.mkdirSync(config.ethDBDir)
    }
    try {
      // Setup web3
      await EthService.startup(config)
      // Setup our child processes -- stateManager & blockManager
      this.stateManager = cp.fork(path.join(__dirname, '/state-manager/app.js'))
      this.blockManager = cp.fork(path.join(__dirname, '/block-manager/app.js'))
      // Child processes need to have the context of 'this' passed in with bind
      this.stateManager.on('message', this.resolveMessage.bind(this))
      this.blockManager.on('message', this.resolveMessage.bind(this))
      // Now send an init message
      await this.sendMessage(this.stateManager, jsonrpc(constants.INIT_METHOD, {
        stateDBDir: config.stateDBDir,
        txLogDir: config.txLogDir
      }))
      await this.sendMessage(this.blockManager, jsonrpc(constants.INIT_METHOD, {
        blockDBDir: config.blockDBDir,
        txLogDir: config.txLogDir
      }))
      // Set up the eth event watchers
      log('Registering Ethereum event watcher for `DepositEvent`')
      EthService.eventWatchers['DepositEvent'].subscribe(this.submitDeposits)
      // Set up auto new block creator
      if (config.blockTimeInSeconds !== undefined) {
        const blockTimeInMiliseconds = parseInt(config.blockTimeInSeconds) * 1000
        setTimeout(() => this.newBlockTrigger(blockTimeInMiliseconds), blockTimeInMiliseconds)
      }
    } catch (err) {
      throw err
    }
    log('Finished sub process startup')
    this.app.post('/api', this.handleTx.bind(this))
    this.app.listen(config.port, '0.0.0.0', () => {
      console.log('\x1b[36m%s\x1b[0m', `Operator listening on port ${config.port}!`)
    })
    this.started = true
  }

  async safeStartup (config) {
    try {
      await this.startup(config)
    } catch (err) {
      if (err !== this.alreadyStartedError) {
        // If this error is anything other than an already started error, throw it
        throw err
      }
      log('Startup has already been run... skipping...')
    }
  }

  async submitDeposits (err, depositEvents) {
    if (err) {
      throw err
    }
    for (const e of depositEvents) {
      // Decode the event...
      const depositEvent = e.returnValues
      log('Detected deposit event with start:', depositEvent.untypedStart, '- & end:', depositEvent.untypedEnd, 'and id:', e.id)
      const recipient = depositEvent.depositer
      const token = new BN(depositEvent.tokenType, 10).toString('hex')
      const start = new BN(depositEvent.untypedStart, 10).toString('hex')
      const end = new BN(depositEvent.untypedEnd, 10).toString('hex')
      // Send the deposit to the state manager
      await this.sendMessage(this.stateManager, jsonrpc(constants.DEPOSIT_METHOD, {
        id: e.id,
        recipient,
        token,
        start,
        end
      }))
      // Send the deposit to the block manager
      await this.sendMessage(this.blockManager, jsonrpc(constants.DEPOSIT_METHOD, {
        id: e.id,
        recipient,
        token,
        start,
        end
      }))
    }
  }

  async newBlockTrigger (blockTime) {
    const newBlockReq = {
      method: constants.NEW_BLOCK_METHOD
    }
    const response = await this.sendMessage(this.stateManager, newBlockReq)
    if (response.error === undefined) {
      log('New block created with blockNumber:', response.message.newBlockNumber)
    } else {
      log('Block is empty--skipping new block')
    }
    setTimeout(() => this.newBlockTrigger(blockTime), blockTime)
  }

  handleTx (req, res) {
    log('INCOMING RPC request with method:', req.body.method, 'and rpcID:', req.body.id)
    if (constants.STATE_METHODS.includes(req.body.method)) {
      if (req.body.method === constants.ADD_TX_METHOD) {
        // For performance, check sigs here
        try {
          const tx = new SignedTransaction(req.body.params[0])
          if (tx.checkSigs() === false) {
            throw new Error('Invalid signature on tx!')
          }
        } catch (err) {
          throw new Error(err)
        }
      }
      this.sendMessage(this.stateManager, req.body).then((response) => {
        log('OUTGOING response to RPC request with method:', req.body.method, 'and rpcID:', req.body.id)
        res.send(response.message)
      })
    } else if (constants.BLOCK_METHODS.includes(req.body.method)) {
      this.sendMessage(this.blockManager, req.body).then((response) => {
        log('OUTGOING response to RPC request with method:', req.body.method, 'and rpcID:', req.body.id)
        res.send(response.message)
      })
    } else if (req.body.method === constants.GET_ETH_INFO_METHOD) {
      res.send({ result: {
        operatorAddress: EthService.operatorAddress,
        plasmaRegistryAddress: EthService.ethDB.plasmaRegistryAddress,
        plasmaChainAddress: EthService.ethDB.plasmaChainAddress
      } })
    }
  }
}

module.exports = {
  Server
}
