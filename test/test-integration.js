/* eslint-env mocha */

const chai = require('chai')
const chaiHttp = require('chai-http')
const server = require('../src/server')
const constants = require('../src/constants.js')
const accounts = require('./mock-accounts.js').accounts
const BN = require('web3').utils.BN
const log = require('debug')('test:info:test-integration')
const MockNode = require('../src/mock-node.js')
const EthService = require('../src/eth-service.js')
const appRoot = require('app-root-path')
const readConfigFile = require('../src/utils.js').readConfigFile
const path = require('path')

chai.use(chaiHttp)

let idCounter = 0

// Operator object wrapper to query api
const operator = {
  addTransaction: (tx) => {
    const encodedTx = tx.encode()
    return new Promise((resolve, reject) => {
      chai.request(server.app)
        .post('/api')
        .send({
          method: constants.ADD_TX_METHOD,
          jsonrpc: '2.0',
          id: idCounter++,
          params: {
            encodedTx
          }
        })
        .end((err, res) => {
          if (err) {
            throw err
          }
          log('Resolve add tx')
          // Parse the response to return what the mock node expects
          const txResponse = res.body
          // Return the deposit
          resolve(txResponse)
        })
    })
  },
  addDeposit: async (recipient, type, amount) => {
    // Construct deposit transaction
    const reciept = await EthService.plasmaChain.methods.submitDeposit().send({
      from: EthService.web3.utils.bytesToHex(recipient),
      value: '1000000000000000000', // send 1 eth
      gas: 3500000,
      gasPrice: '300000'
    })
    log(reciept.events.NewDeposit.returnValues)
    // recipient: Buffer.from(Web3.utils.hexToBytes(m.message.params.recipient)),
    // type: new BN(m.message.params.type, 16),
    // amount: new BN(m.message.params.amount, 16)
  },
  startNewBlock: () => {
    return new Promise((resolve, reject) => {
      chai.request(server.app)
        .post('/api')
        .send({
          method: constants.NEW_BLOCK_METHOD,
          jsonrpc: '2.0',
          id: idCounter++,
          params: {}
        })
        .end((err, res) => {
          if (err) {
            throw err
          }
          log('Resolve new block')
          resolve(res.body)
        })
    })
  }
}

describe('Server', function () {
  before(async () => {
    // Startup with test config file
    const configFile = path.join(appRoot.toString(), 'test', 'config-test.json')
    const config = readConfigFile(configFile, 'test')
    await server.safeStartup(config)
  })
  it.skip('Nodes are able to deposit and send transactions', (done) => {
    const depositType = new BN(0)
    const depositAmount = new BN(10000)
    const nodes = []
    for (const acct of accounts) {
      nodes.push(new MockNode(operator, acct, nodes))
    }
    const depositPromises = []
    // Add deposits from 100 different accounts
    for (const node of nodes) {
      depositPromises.push(node.deposit(depositType, depositAmount))
    }
    Promise.all(depositPromises).then((res) => {
      done()
      // Send txs!
      mineAndLoopSendRandomTxs(5, operator, nodes).then(() => {
        done()
      })
    })
  })
})

async function mineAndLoopSendRandomTxs (numTimes, operator, nodes) {
  await operator.startNewBlock()
  for (let i = 0; i < numTimes; i++) {
    log('Starting new block...')
    const blockNumberResponse = await operator.startNewBlock()
    const blockNumber = new BN(blockNumberResponse.newBlockNumber)
    log('Sending new txs for block number:', blockNumber.toString())
    for (const node of nodes) {
      node.processPendingRanges()
    }
    await sendRandomTransactions(operator, nodes, blockNumber)
  }
}

let randomTxPromises
let promisesAndTestIds = []

function sendRandomTransactions (operator, nodes, blockNumber, rounds, maxSize) {
  if (rounds === undefined) rounds = 1
  randomTxPromises = []
  for (let i = 0; i < rounds; i++) {
    for (const node of nodes) {
      randomTxPromises.push(node.sendRandomTransaction(blockNumber, maxSize))
      promisesAndTestIds.push({
        promise: randomTxPromises[randomTxPromises.length - 1],
        id: idCounter
      })
    }
  }
  Promise.all(randomTxPromises).then(() => { promisesAndTestIds = [] })
  return Promise.all(randomTxPromises)
}
