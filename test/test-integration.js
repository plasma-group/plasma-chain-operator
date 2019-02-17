/* eslint-env mocha */

const chai = require('chai')
const chaiHttp = require('chai-http')
const Server = require('../src/server').Server
const constants = require('../src/constants.js')
const accounts = require('./mock-accounts.js').accounts
const BN = require('web3').utils.BN
const log = require('debug')('test:info:test-integration')
const MockNode = require('../src/mock-node.js')
const EthService = require('../src/eth-service.js')
const readConfigFile = require('../src/utils.js').readConfigFile
const path = require('path')
const UnsignedTransaction = require('plasma-utils').serialization.models.UnsignedTransaction
const DEPOSIT_SENDER = '0x0000000000000000000000000000000000000000'

const server = new Server()
const timeout = ms => new Promise(resolve => setTimeout(resolve, ms))

chai.use(chaiHttp)

let idCounter = 0

// Operator object wrapper to query api
const operator = {
  addTransaction: (tx) => {
    const encodedTx = tx.encoded
    return new Promise((resolve, reject) => {
      chai.request(server.app)
        .post('/api')
        .send({
          method: constants.ADD_TX_METHOD,
          jsonrpc: '2.0',
          id: idCounter++,
          params: [
            encodedTx
          ]
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
    // TODO: change this to actually use the right type and amount
    const reciept = await EthService.plasmaChain.methods.depositETH().send({
      from: EthService.web3.utils.bytesToHex(recipient),
      value: new BN('100000000', 'hex').toString(),
      gas: 3500000,
      gasPrice: '300000'
    })
    const depositEvent = reciept.events.DepositEvent.returnValues
    const tokenType = new BN(depositEvent.tokenType, 10)
    const start = new BN(depositEvent.untypedStart, 10)
    const end = new BN(depositEvent.untypedEnd, 10)
    const deposit = new UnsignedTransaction({block: depositEvent.block, transfers: [{sender: DEPOSIT_SENDER, recipient: depositEvent.depositer, tokenType, start, end}]})
    return deposit
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
  },
  getBlockNumber: () => {
    return new Promise((resolve, reject) => {
      chai.request(server.app)
        .post('/api')
        .send({
          method: constants.GET_BLOCK_NUMBER_METHOD,
          jsonrpc: '2.0',
          id: idCounter++,
          params: {}
        })
        .end((err, res) => {
          if (err) {
            throw err
          }
          log('Resolve get block number')
          resolve(new BN(res.body.result, 10))
        })
    })
  }
}

describe('Server', function () {
  before(async () => {
    // Startup with test config file
    const configFile = path.join(__dirname, 'config-test.json')
    const config = readConfigFile(configFile, 'test')

    // Server is already started in Server api test
    server.started = true
    await server.safeStartup(config)
  })
  it('Nodes are able to deposit and send transactions', (done) => {
    // const accts = accounts.slice(0, 5)
    const nodes = []
    // for (const acct of accts) {
    for (const acct of accounts) {
      nodes.push(new MockNode(operator, acct, nodes))
    }
    bigIntegrationTest(nodes, operator).then(() => {
      done()
    })
  })
})

async function bigIntegrationTest (nodes, operator) {
  // Add deposits from 100 different accounts
  const depositType = new BN(0)
  const depositAmount = new BN(10000, 'hex')
  for (const node of nodes) {
    await node.deposit(depositType, depositAmount)
    log('Submitted deposit')
  }
  // Now mine and send random transactions
  await mineAndLoopSendRandomTxs(5, operator, nodes)
}

async function mineAndLoopSendRandomTxs (numTimes, operator, nodes) {
  for (let i = 0; i < numTimes; i++) {
    const blockNumber = await operator.getBlockNumber()
    // Send a bunch of transactions
    for (const node of nodes) {
      await node.sendRandomTransaction(blockNumber, 1024)
    }
    // Start a new block
    log('Starting new block...')
    await operator.startNewBlock()
    log('Waiting before sending transactions to block:', blockNumber.toString() + '...')
    await timeout(500)
    log('Sending new txs for block number:', blockNumber.toString())
    for (const node of nodes) {
      node.processPendingRanges()
    }
  }
}
